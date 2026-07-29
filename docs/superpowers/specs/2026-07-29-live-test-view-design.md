# Live Test View — Design Spec

**Date:** 2026-07-29
**Status:** Approved pending user review

## Overview

Live Test View lets a Flutter developer watch a widget test render live while it
runs. A `▶ Live View` CodeLens appears above every `testWidgets(...)` in VS Code;
clicking it runs that single test and streams every rendered frame into a docked
webview panel beside the editor, in real time, with a scrubbable timeline after
the run completes.

Inspired by the discontinued "Flutter Wings" extension. Two published artifacts:

| Artifact | Registry | Language | Purpose |
|---|---|---|---|
| `live_test_view` | pub.dev | Dart | Frame capture inside the test process, stdout streaming protocol, installer |
| `live-test-view` | VS Code Marketplace | TypeScript | CodeLens, test process spawning, stdout parsing, webview panel |

## Goals

- **Zero test-file changes.** No wrapper functions, no annotations, no env vars
  for the user to configure. Existing `testWidgets` bodies are untouched.
- **One-time setup ≤ 2 steps.** Install the extension + add the package with a
  single install command (the extension offers to do the second step itself).
- **Invisible when off.** A plain `flutter test` run (CI, terminal, other IDEs)
  behaves byte-for-byte identically to a project without the package.
- **True live streaming.** Frames appear in the panel as the test executes, not
  after it finishes.

## Non-Goals (v1)

- Step/action log (tap, enterText, expect interception) — impossible without an
  opt-in `liveTestWidgets` wrapper; explicitly rejected in favor of zero-touch.
- Running a whole file or suite live — v1 CodeLens targets one test per click.
- Integration tests / `flutter drive` — widget tests only.
- Configurable test surface size, device frames, golden diffing, IntelliJ
  support. All future work.

## Key Technical Insight: capture on frame, not on wall clock

Widget tests execute inside `FakeAsync` — wall-clock timers do not fire, and
pixels only change when the test pumps a frame. Therefore periodic (e.g. 100 ms)
polling is both impossible and pointless. The correct trigger is
`binding.addPersistentFrameCallback(...)`: it fires synchronously on **every
pumped frame**, which is exactly the set of moments the UI can have changed.

## Architecture

```
┌────────────── VS Code ──────────────┐      ┌───────── child process ─────────┐
│ CodeLens "▶ Live View"              │      │ flutter test <file>              │
│   └─ click ─────────────────────────┼──────▶   --plain-name "<test>"         │
│                                     │ env: │   --machine                      │
│ stdout parser                       │ LTV=1│                                  │
│   ├─ --machine JSON → lifecycle     │◀─────┤ flutter_test_config.dart         │
│   └─ ##LTV## lines  → frames        │stdout│   └─ live_test_view package      │
│                                     │      │        ├─ persistent frame cb    │
│ Webview panel                       │      │        ├─ layer.toImage → PNG    │
│   ├─ live frame                     │      │        └─ ##LTV## emit           │
│   ├─ timeline scrubber              │      └──────────────────────────────────┘
│   └─ status (running/pass/fail)     │
└─────────────────────────────────────┘
```

The extension owns the child process, so activation is entirely internal: it
sets `LIVE_TEST_VIEW=1` in the spawned process's environment. The user never
sees or configures a flag. Both the frame stream and the official
`--machine` test-lifecycle JSON arrive line-delimited on the same stdout and
are trivially distinguishable.

## Component 1 — `live_test_view` (Dart package)

### Activation & hook

Flutter's test runner auto-discovers `test/flutter_test_config.dart` and routes
every test file through its `testExecutable`. The installer writes:

```dart
// test/flutter_test_config.dart
import 'dart:async';
import 'package:live_test_view/live_test_view.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) =>
    liveTestView(testMain);
```

`liveTestView(testMain)`:

1. If `Platform.environment['LIVE_TEST_VIEW'] != '1'` → `return testMain();`
   (a single map lookup; the no-op path adds nothing observable).
2. Otherwise: `TestWidgetsFlutterBinding.ensureInitialized()`, register one
   persistent frame callback, then `await testMain()`, then flush any
   in-flight frame encodes before returning (so the process cannot exit with
   frames still buffered).

If the project already has a `flutter_test_config.dart`, the installer does not
overwrite it; it prints the one line to add inside the existing
`testExecutable`. `liveTestView` composes with other wrappers (golden config,
leak tracking) because it just awaits `testMain`.

### Frame capture

On each persistent-frame callback (fires inside the pump, synchronously):

1. Grab the root layer of the test's `RenderView`
   (`binding.renderViews.first.layer` — an `OffsetLayer` subclass, so it
   supports `toImage`). Capturing the root layer means **no `RepaintBoundary`
   is required anywhere in the tested widget tree** — unlike
   `matchesGoldenFile`, this works on any pumped tree.
2. Schedule the actual capture in the **root zone** (`Zone.root.run`), escaping
   `FakeAsync`, because `toImage`/`toByteData` are engine-async and must not be
   trapped behind fake timers. The frame callback itself only enqueues; a
   single-consumer queue does `toImage → toByteData(png) → base64 → emit`.
3. **Throttle:** if a capture is already in flight when a new frame fires, mark
   `dirty` and re-capture once the in-flight one finishes (coalescing). This
   caps cost during `pumpAndSettle` storms while guaranteeing the *final* frame
   of any burst is always captured. Additionally cap at 500 frames per test;
   past the cap, keep emitting but log a warning event.

**Risk (top of list):** interaction between `FakeAsync`, `toImage`, and the
test binding's "pending async work" guard. Mitigations: enqueue-only inside the
callback, root-zone execution, end-of-suite flush in `liveTestView` after
`testMain` completes (real async is legal there). This is the first thing the
implementation plan must spike end-to-end before any other work.

### stdout protocol

One JSON object per line, prefixed with the magic marker `##LTV##`:

```
##LTV##{"v":1,"type":"frame","seq":12,"testTimeMs":450,"w":800,"h":600,"png":"<base64>"}
##LTV##{"v":1,"type":"warning","message":"frame cap reached"}
```

- `v` — protocol version, for forward compatibility between package and
  extension releases.
- `testTimeMs` — fake-clock elapsed time since the test's first frame; lets the
  timeline scrubber show meaningful timestamps.
- Test lifecycle (start, pass, fail, error message, stack) is **not** part of
  this protocol — the extension gets it from `--machine` JSON, which is
  official and stable. The package emits only what the runner cannot know:
  pixels.
- Everything not marked `##LTV##` and not `--machine` JSON is passed through to
  a normal VS Code output channel (so `debugPrint`s still land somewhere
  visible).

## Component 2 — `live-test-view` (VS Code extension)

### CodeLens

- Regex scan of `*_test.dart` documents for `testWidgets(` with a **literal
  string** first argument (single/double/triple-quoted). Interpolated or
  variable names get no lens in v1.
- Lens title: `▶ Live View`. Command payload: file path + test name string.
- No AST/analyzer dependency — keeps the extension tiny and fast.

### Test runner

- On click: reuse the panel (create if absent), kill any previous live run,
  then spawn from the project root (nearest ancestor of the file with a
  `pubspec.yaml`):

  ```
  flutter test <relative-file> --plain-name "<name>" --machine
  ```

  with `LIVE_TEST_VIEW=1` merged into the environment.
- `--plain-name` is substring-matched by the runner, so it works with
  `group()` prefixes unchanged.
- Parse stdout line-by-line: `##LTV##` → frame handler; JSON with `--machine`
  shape → lifecycle handler; else → output channel.
- **Setup detection:** if the spawn produces zero `##LTV##` frames but the test
  ran (lifecycle events arrived), the package isn't installed/wired. The panel
  shows a one-click "Set up Live Test View" action that runs
  `flutter pub add --dev live_test_view` and `dart run live_test_view:install`
  in the integrated terminal. This is the ≤ 2-step onboarding.

### Webview panel

Docked `ViewColumn.Beside`. Plain HTML/JS/CSS (no framework). Three regions:

1. **Frame area** — latest frame, scaled to fit, checkerboard behind
   transparency, actual-pixels toggle.
2. **Timeline** — filmstrip/scrubber of all received frames with `testTimeMs`
   labels. During the run it tracks the newest frame; after completion (or
   whenever the user drags) it becomes a free scrubber. This gives the
   record-and-replay experience as a free byproduct of live streaming.
3. **Status bar** — test name, frame count, spinner while running, then
   ✓ pass / ✗ fail. On failure, the exception message + stack from `--machine`
   render in a collapsible section under the status bar.

Frames are held in webview memory only (base64 strings); a new run clears them.
500-frame cap × ~30 KB PNG ≈ 15 MB worst case — acceptable.

### Error handling

| Failure | Behavior |
|---|---|
| Test fails / throws | Frames keep streaming until the failure; panel shows ✗ + error; timeline remains scrubbable — this is the core debugging use case, not an edge case |
| Compile error in test file | No lifecycle events; stderr shown in panel error region |
| Package not installed | Zero frames + successful run → setup prompt (above) |
| Panel closed mid-run | Process killed; nothing leaks |
| Second lens clicked mid-run | Previous process killed, panel reset, new run starts |
| Version skew (protocol `v` unknown) | Panel shows "update the live_test_view package / extension" notice |

## Testing Strategy

- **Dart package:** unit tests for protocol encoding and the coalescing
  throttle; an end-to-end fixture (`example/` app with real widget tests
  including a `pumpAndSettle` animation) run via `flutter test` with the env
  var set, asserting emitted `##LTV##` lines decode to valid PNGs in order.
  The same fixture run *without* the env var must emit nothing.
- **Extension:** unit tests for the CodeLens regex and stdout line parser
  (fixture transcripts). Webview and process wiring verified by a manual
  checklist against real-world tests (mypos_mobile's `test/presentation/`
  suite is the guinea pig).

## Repository Layout

```
live_test_view/
├── packages/
│   └── live_test_view/           # pub.dev package
│       ├── lib/live_test_view.dart          # liveTestView(testMain)
│       ├── lib/src/{capture,protocol}.dart
│       ├── bin/install.dart                 # writes flutter_test_config.dart
│       ├── example/                         # e2e fixture app + tests
│       └── test/
├── extension/                    # VS Code extension (TypeScript)
│   ├── src/{extension,codelens,runner,protocol,panel}.ts
│   ├── media/{panel.js,panel.css}
│   └── package.json
├── docs/superpowers/specs/
├── README.md                     # root: what it is, GIF, setup
└── LICENSE                       # MIT
```

## Publishing (v1 definition of done)

- `live_test_view` on pub.dev with README, example, and the installer bin.
- `live-test-view` on the Marketplace with README + demo GIF.
- Root README covering the 2-step setup and a troubleshooting section
  (the FakeAsync risk area will produce the first real-world bug reports).
