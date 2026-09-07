# Live Test View

Run a Flutter widget test and watch it render, frame by frame, in a panel beside your editor — no debugger, no manual screenshotting.

![Live Test View demo](https://raw.githubusercontent.com/flutterninja9/live_test_view/main/assets/live_preview_demo.gif)

## Usage

Open any `*_test.dart` file. Above every `testWidgets(...)` call with a literal string name, you'll see a "▶ Live View" CodeLens:

```dart
testWidgets('increments the counter', (tester) async {
  // ▶ Live View appears above this line
  ...
});
```

Click it. A panel opens beside your editor and runs just that test (`flutter test --plain-name "..."`). As frames come in, they play back in the panel; the timeline scrubber at the bottom holds every frame the test rendered, so you can scrub back through the whole run once it finishes, or drag out of "follow" mode to inspect an earlier frame while it's still running. A failed test shows its error and stack trace inline.

## Widget Preview (experimental)

Live Test View also has a preview mode for widgets, not just tests. Above any top-level widget-returning function/getter, or `StatelessWidget`/`StatefulWidget` class, you'll see a "▶ Preview" CodeLens:

```dart
class CounterPage extends StatefulWidget {
  // ▶ Preview appears above this line
  ...
}
```

Click it. A panel opens beside your editor and renders that widget live in a headless `flutter-tester` process — auto-wrapped in a minimal `MaterialApp(home: Scaffold(...))` so `Theme.of`, `MediaQuery`, `Navigator`, and friends resolve without extra setup. Save the file and the panel updates via a real Flutter hot reload — sub-second, no process restart.

![Live Widget Preview demo](https://raw.githubusercontent.com/flutterninja9/live_test_view/main/assets/live_widget_preview_demo.gif)

Unlike test mode's scrubbable frame history, preview mode shows one thing: the widget's current rendered state. It's not interactive (taps/scroll/typing aren't forwarded), and it doesn't inject your app's own Provider/Riverpod/Bloc setup — widgets that need that will show Flutter's error widget, same as they would in an unwrapped test.

## Setup prompt

If you click "▶ Live View" and no frames show up, the panel shows a "Set up Live Test View" button. Clicking it opens a terminal and runs:

```bash
flutter pub add --dev live_test_view && dart run live_test_view:install
```

Re-run the test afterward and frames should appear. If the project already has a `test/flutter_test_config.dart`, the installer won't touch it — it prints the one-line wrapper you need to add by hand instead.

## Requirements

- Flutter >= 3.16
- `live_test_view` package >= 0.5.1
- VS Code >= 1.85

## License

MIT — see [LICENSE](LICENSE).
