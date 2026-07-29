# live_test_view

Streams rendered frames from your Flutter widget tests so the Live Test View VS Code extension can replay them live in an editor panel. On its own — without the extension driving it — this package does nothing observable at all.

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

## Requirements

- Flutter >= 3.16
- Dart SDK >= 3.2

## License

MIT — see [LICENSE](LICENSE).
