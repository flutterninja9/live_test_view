# Live Test View

Run a Flutter widget test and watch it render, frame by frame, in a panel beside your editor — no debugger, no manual screenshotting.

## Before publishing

- [ ] Demo GIF: record with the example app before publishing.

## Usage

Open any `*_test.dart` file. Above every `testWidgets(...)` call with a literal string name, you'll see a "▶ Live View" CodeLens:

```dart
testWidgets('increments the counter', (tester) async {
  // ▶ Live View appears above this line
  ...
});
```

Click it. A panel opens beside your editor and runs just that test (`flutter test --plain-name "..."`). As frames come in, they play back in the panel; the timeline scrubber at the bottom holds every frame the test rendered, so you can scrub back through the whole run once it finishes, or drag out of "follow" mode to inspect an earlier frame while it's still running. A failed test shows its error and stack trace inline.

## Setup prompt

If you click "▶ Live View" and no frames show up, the panel shows a "Set up Live Test View" button. Clicking it opens a terminal and runs:

```bash
flutter pub add --dev live_test_view && dart run live_test_view:install
```

Re-run the test afterward and frames should appear. If the project already has a `test/flutter_test_config.dart`, the installer won't touch it — it prints the one-line wrapper you need to add by hand instead.

## Requirements

- Flutter >= 3.16
- `live_test_view` package >= 0.1.0
- VS Code >= 1.85

## License

MIT — see [LICENSE](LICENSE).
