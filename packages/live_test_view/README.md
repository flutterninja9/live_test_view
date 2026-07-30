# live_test_view

Streams rendered frames from your Flutter widget tests so the Live Test View VS Code extension can replay them live in an editor panel. On its own — without the extension driving it — this package does nothing observable at all.

![Live Test View demo](https://raw.githubusercontent.com/flutterninja9/live_test_view/main/assets/live_preview_demo.gif)

## Install

```bash
flutter pub add --dev live_test_view
dart run live_test_view:install
```

The installer writes `test/flutter_test_config.dart` for you. If that file already exists, it won't be overwritten — the installer instead prints the one-line change needed to wrap your existing `testExecutable`:

```dart
Future<void> testExecutable(FutureOr<void> Function() testMain) =>
    liveTestView(() => yourExistingSetup(testMain));
```

## What the config file does

`flutter_test_config.dart` is a special file `package:test` looks for and, if present, uses to wrap every test in the directory. The generated file looks like this:

```dart
import 'dart:async';

import 'package:live_test_view/live_test_view.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) =>
    liveTestView(testMain);
```

`liveTestView` checks the `LIVE_TEST_VIEW` environment variable. When it's unset (every normal `flutter test` run, including CI), it just calls `testMain()` and returns — see "the silence invariant" below. When the Live Test View extension runs a test, it sets `LIVE_TEST_VIEW=1` in the child process's environment; `liveTestView` then attaches a persistent frame callback that snapshots the render tree after every paint, encodes each snapshot as PNG, and writes it to stdout as a single line prefixed with `##LTV##` followed by JSON (`v`, `seq`, `testTimeMs`, `w`, `h`, `png`). The extension's test runner reads these lines back out; you never need to parse them yourself.

## The silence invariant

This package is designed so that adding it can never change your test suite's behavior or output under a plain `flutter test` run. With `LIVE_TEST_VIEW` unset, `liveTestView` is a pass-through: no frame callback is registered, nothing is written to stdout, and the only cost is one environment-variable check. This is covered by an end-to-end test that asserts a run without the flag is byte-for-byte identical, stdout included, to a run without the package wired in at all.

## Companion extension

This package only captures and streams frames — it has no UI of its own. Pair it with the "Live Test View" VS Code extension, which adds the "▶ Live View" CodeLens, runs your tests, and renders the captured frames in a scrubbable timeline panel.

## Fonts

`flutter test` renders all text with a placeholder font (every glyph a solid box) unless something loads real fonts in. When `LIVE_TEST_VIEW=1`, `liveTestView` does this for you before `testMain` runs, via `loadRealFonts()`:

- **Roboto** — resolved from the running Flutter SDK's own cache (`bin/cache/artifacts/material_fonts`), so it works with any SDK install without the project needing to bundle it.
- **Every family in the test build's `FontManifest.json`** — this covers project fonts declared under `flutter: fonts:` in `pubspec.yaml`, package-bundled fonts, and `MaterialIcons`. Each family is loaded independently; if one fails (bad asset, malformed manifest entry), a `##LTV##` warning line is emitted naming it and the rest of the manifest still loads.

**`google_fonts` is not covered by either mechanism and can't be made to work here.** It isn't in `FontManifest.json` — it fetches its `.ttf` over HTTP the first time `GoogleFonts.xxx()` is called, as a fire-and-forget `Future` the widget doesn't await. Two things make this unrecoverable inside `flutter test`:

1. `flutter_test` installs a global `HttpOverrides` that makes every HTTP request in the process return a fake 400, so the fetch always fails.
2. The fetch is *initiated* inside `flutter_test`'s FakeAsync-controlled zone (during widget `build()`). Bypassing the HTTP mock and awaiting the request from a real zone afterward (`binding.runAsync`) doesn't help — it deadlocks, because the pending Future is entangled with a fake clock that nothing is advancing anymore. There's no sequencing trick around this from outside `google_fonts`.

If a project needs `google_fonts` text to render in Live Test View, bundle the actual `.ttf` files as assets and set `GoogleFonts.config.allowRuntimeFetching = false` in the app. That routes `google_fonts` through the local asset bundle instead of the network — the same `FontManifest.json`-backed path above, which already works. This is `google_fonts`' own recommended setup for golden/widget tests generally: https://pub.dev/packages/google_fonts#offline-support-and-cache

## Requirements

- Flutter >= 3.16
- Dart SDK >= 3.2

## License

MIT — see [LICENSE](LICENSE).
