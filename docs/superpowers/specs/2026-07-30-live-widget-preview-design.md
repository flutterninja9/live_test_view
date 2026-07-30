# Live Widget Preview — Design Spec

**Date:** 2026-07-30
**Status:** Approved pending user review

## Overview

Live Widget Preview extends Live Test View with a second mode: instead of
replaying a recorded widget *test*, it renders an arbitrary widget *live*,
outside of any test, and keeps it up to date via real Flutter hot reload as
the developer edits and saves. A `▶ Preview` CodeLens appears above any
top-level widget-returning function/getter or `StatelessWidget`/
`StatefulWidget` class; clicking it boots that widget in a headless engine
and streams frames into a docked panel, refreshing on save.

This targets the same pain point Flutter's own widget-preview tooling has:
it renders through Flutter Web, which pays a browser + dart2js/wasm compile
cost on every cold start. This design instead renders through
`flutter-tester` — Flutter's own headless engine device (software/Skia
rendering, no window, no browser), the same device Flutter's internal
tooling already uses, with fully documented hot reload built in.

## Goals

- **Live, not recorded.** Unlike test mode's scrub-through-history timeline,
  preview mode shows one thing: the widget's current rendered state.
- **Real hot reload.** Saving a file triggers an actual Flutter hot reload
  (sub-second), not a process restart.
- **No new authoring convention.** Any widget-returning top-level function or
  getter, or `StatelessWidget`/`StatefulWidget` class, is previewable via
  CodeLens — no annotations, no wrapper boilerplate.
- **Works with ordinary Material widgets out of the box.** The previewed
  widget is auto-wrapped in a minimal `MaterialApp(home: Scaffold(...))` so
  `Theme.of`, `MediaQuery`, `Directionality`, `Navigator` etc. resolve
  without the developer wiring anything up themselves.

## Non-Goals (v1)

- **Interactivity.** No taps/scroll/typing forwarded into the preview — it's
  a live *image*, not a live *app*. (Considered and explicitly deferred —
  requires an input-forwarding/hit-testing layer that doesn't exist yet.)
- **Multi-variant/gallery view.** One widget, one panel. No side-by-side
  states à la Storybook.
- **Custom wrapper injection** (e.g. a project's own Provider/Riverpod/Bloc
  setup). v1 always wraps with a bare `MaterialApp` + `Scaffold`; widgets
  that need app-level DI to build will show Flutter's error widget, same as
  they would in an unwrapped test. Revisit if this proves too limiting.
- **Resource-conscious multi-preview management.** Every open preview panel
  gets its own `flutter run -d flutter-tester` process. Fine at the expected
  scale (a developer previewing one or two widgets at a time); no pooling or
  process reuse in v1.

## Key Technical Decision: `flutter-tester`, not the `flutter_test` harness

Two ways to get a hot-reloadable render loop were considered:

1. **Reuse the existing `flutter_test` harness**, keeping a single
   `flutter test` process alive indefinitely (block after the initial pump
   instead of returning) and hoping Flutter's `reassemble()` hot-reload
   lifecycle hook fires correctly against a deliberately-suspended test
   body. Attractive because it reuses almost all of test mode's capture
   code untouched — but this depends on undocumented behavior. `flutter
   test` was never designed to be a long-lived, reload-driven host; whether
   its VM service reloads reliably against an indefinitely-blocked test is
   something we'd be discovering, not something the tooling promises.
2. **`flutter run -d flutter-tester --machine`** — a real, running Flutter
   engine instance targeting the headless tester device. This is exactly
   the device+mode Flutter's own tooling (DevTools, IDEs) uses for
   integration-test-style headless runs, and hot reload here is the same,
   fully-documented mechanism `flutter run`'s `r` keypress uses in normal
   development.

**Decision: option 2.** It costs a new (structurally similar) capture path
and a persistent-process manager in the extension, but it rests on
guaranteed, documented behavior rather than repurposing test infrastructure
for something it wasn't built to do. Hot reload is the entire reason this
mode exists, so it shouldn't be the part built on shaky ground.

## Architecture

```
┌────────────── VS Code ──────────────┐      ┌───────── child process (persistent) ─────────┐
│ CodeLens "▶ Preview"                │      │ flutter run -d flutter-tester                 │
│   └─ click ─────────────────────────┼──────▶   --machine -t <generated entrypoint>          │
│                                     │      │                                                │
│ PreviewRun (daemon JSON-RPC)        │      │ generated main.dart:                           │
│   ├─ parse app.start/debugPort      │◀─────┤   runApp(MaterialApp(home: Scaffold(           │
│   ├─ parse ##LTV## frame lines      │stdout│     body: <TargetWidget>)))                    │
│   └─ send app.restart on save ──────┼──────▶   + persistent postFrameCallback capture       │
│                                     │      │        ├─ shared capture core (see below)       │
│ Preview panel (single frame)        │      │        └─ ##LTV## emit                         │
│   ├─ latest frame                   │      └────────────────────────────────────────────────┘
│   └─ status (booting/ready/error)   │
└─────────────────────────────────────┘
```

## Component 1 — `live_test_view` (Dart package) additions

### Shared capture core

`capture.dart`'s `FrameCapture` currently hardcodes
`TestWidgetsFlutterBinding` for frame notification (a persistent frame
callback registered once) but its actual work — snapshot via
`layer.toImage()`, raw-RGBA glitch check, PNG encode, seq-ordered emit via
the reorder buffer — has nothing test-specific about it. Refactor so the
image-pipeline logic is binding-agnostic, taking a `RenderView`/layer
provider rather than reading `_binding.renderViews.first` directly. Test
mode keeps its existing frame-source adapter (persistent frame callback,
gated by `setActive`); preview mode adds a new adapter using
`WidgetsBinding.instance.addPostFrameCallback` (one-shot; re-registered
after every capture, since there is no persistent-callback API on the
plain app binding, unlike the test binding).

No `setActive`/gating logic is needed in preview mode — there's no
test/teardown boundary, every frame is real UI.

### Generated entrypoint

A small template (`preview_entry_template.dart`, extension-side generator +
Dart-side runtime helper) produces a `main.dart` like:

```dart
import 'package:flutter/material.dart';
import 'package:live_test_view/live_test_view.dart' show previewCapture;
import '<relative path to target file>';

void main() {
  previewCapture(() => MaterialApp(home: Scaffold(body: <TargetSymbol>())));
}
```

`previewCapture` calls `runApp`, wires up the post-frame capture adapter,
and starts the `##LTV##` stdout stream — mirroring `liveTestView`'s role in
test mode, but for the app binding instead of the test binding.

The generated file is written under the target project's
`.dart_tool/live_test_view/preview_entry.dart` so relative imports back to
the developer's file resolve correctly, and regenerated fresh on every
preview launch (never hand-edited, never committed).

### Protocol

Unchanged. The existing `frame`/`warning` `##LTV##` line format already
carries everything preview mode needs (`seq`, dimensions, PNG bytes);
`testTimeMs` is simply not meaningful here and can be set to elapsed
wall-clock time since preview start for consistency, though the panel
won't display a timeline for it.

## Component 2 — `live-test-view` (VS Code extension) additions

### CodeLens

- `previewScan.ts`: regex scan (same style as `scan.ts`) for:
  - `Widget <name>(...)` / `Widget get <name>` top-level functions/getters
  - `class <Name> extends StatelessWidget` / `extends StatefulWidget`
- Lens title `▶ Preview`. Command payload: file path + symbol name +
  whether it's a class (needs `()`) or a function/getter reference.
- No AST dependency, consistent with the project's existing choice to keep
  the extension free of an analyzer/AST layer.

### `PreviewRun` (persistent process manager)

Sibling to `runner.ts`'s `TestRun`, but with a different lifecycle: `TestRun`
spawns and expects natural exit; `PreviewRun` spawns and stays alive until
explicitly killed (panel closed, or a different symbol's preview clicked).

- Spawn: `flutter run -d flutter-tester --machine -t <generated entrypoint>`
  from the project root (found the same way `runner.ts.findProjectRoot`
  does today).
- Parse the `--machine` daemon JSON-RPC stream for `app.start`,
  `app.debugPort`/`app.started`, `app.progress` (compiling.../reloading...),
  and error events — same line-delimited stdout as today, just a different
  JSON shape than the test runner's `--machine` output, disambiguated the
  same way `##LTV##` frame lines already are (JSON without the marker vs.
  JSON with it).
- On save of the previewed file (`vscode.workspace.onDidSaveTextDocument`,
  filtered to the file currently under preview): send the daemon's
  hot-reload request (`app.restart` with `fullRestart: false`) over the
  child's stdin.
- `kill()`: same pattern as `TestRun.kill()`.

### Preview panel

New, simpler sibling to `panel.ts`'s timeline panel:

1. **Frame area** — latest frame only, scaled to fit, checkerboard behind
   transparency (reuse existing rendering code from the test panel where
   possible).
2. **Status line** — Booting… / Ready / Reloading… / error text, driven by
   the daemon progress/error events.
3. No scrubber, no frame history — v1 preview mode is explicitly "current
   state," not "record and replay" (that's test mode's job).

## Error Handling

| Failure | Behavior |
|---|---|
| Compile error (initial boot or after save) | Daemon error event surfaces verbatim in the panel status area; last-good frame stays visible but is visually marked stale so it's clear the reload didn't succeed |
| Widget throws during `build()` | Flutter's own red error screen renders as a normal captured frame — matches on-device behavior, no special-casing |
| `flutter-tester` device unavailable (old SDK / engine artifacts missing) | Spawn/exit failure detected; panel shows a setup hint, consistent with today's "Set up Live Test View" onboarding pattern |
| Panel closed | `PreviewRun.kill()`; process and generated entrypoint cleaned up |
| Different preview clicked while one is running | Previous `PreviewRun` killed, panel reset to the new target |

## Testing Strategy

- **Dart package:** unit tests for the refactored binding-agnostic capture
  core (mirrors existing `coalescing_gate_test.dart`/`protocol_test.dart`
  style); unit tests for entrypoint-template generation as pure string
  output (given a target file + symbol, assert the generated `main.dart`
  source) — no engine required for either.
- **Extension:** unit tests for `previewScan.ts` CodeLens detection
  (mirrors `scan.test.ts`); unit tests for `previewRunner.ts`'s daemon
  JSON-RPC command construction/parsing (mirrors `runner.test.ts`).
- **E2E:** one test analogous to `packages/live_test_view/test/e2e_test.dart`
  that launches a real `flutter run -d flutter-tester` preview, asserts a
  first frame arrives, edits the target file, sends reload, asserts an
  updated frame arrives. Slow (real engine boot) — kept out of the fast
  unit loop, run in CI/manually.

## Repository Layout (additions only)

```
live_test_view/
├── packages/live_test_view/
│   └── lib/src/
│       ├── capture.dart               # refactored: binding-agnostic core
│       ├── preview_capture.dart        # new: app-binding frame-source adapter
│       └── preview_entry_template.dart # new: generated main.dart source
├── extension/src/
│   ├── previewScan.ts                  # new: CodeLens detection
│   ├── previewRunner.ts                # new: persistent PreviewRun process
│   └── previewPanel.ts                 # new: single-frame webview
```

## Definition of Done (v1)

- `▶ Preview` CodeLens appears above widget-returning functions/getters and
  `StatelessWidget`/`StatefulWidget` classes.
- Clicking it shows a first frame within a couple seconds (flutter-tester
  boot time, no browser/JS compile).
- Saving the file updates the preview via real hot reload, sub-second.
- Compile errors and build-time widget errors are visible in the panel, not
  a silently frozen frame.
- Root README updated with a "Live Preview" section alongside the existing
  "Live Test View" one.
