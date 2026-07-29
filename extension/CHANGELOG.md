## 0.1.0

Initial release.

- "▶ Live View" CodeLens above `testWidgets(...)` calls with a literal string name.
- Runs the selected test via `flutter test --plain-name --machine` and streams captured frames into a webview panel.
- Paced playback timeline: frames replay spaced by their fake-clock timestamps (capped at 300ms per gap), with a scrubber holding the full frame history.
- Pass/fail status with inline error and stack trace display on failure.
- One-click setup prompt when the `live_test_view` package isn't wired into the project yet.
