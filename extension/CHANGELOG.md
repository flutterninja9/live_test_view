## 0.5.0

- Fix: smarter setup diagnostics when a test passes but no frames arrive — inspects `pubspec.yaml` and `test/flutter_test_config.dart` and shows a specific message (missing package, missing config, config not wired, or genuinely no frames captured) instead of always implying the dev dependency is absent.
- Requires `live_test_view` package >= 0.5.0 for the partial-viewport frame capture fix.

## 0.4.0

- Widget Preview hot reload: saving a `.dart` file triggers a real Flutter hot reload in the preview process — sub-second updates without restarting `flutter run`.
- README now embeds the Live Widget Preview demo GIF.

## 0.3.0

- **Widget Preview (experimental):** "▶ Preview" CodeLens above top-level widget-returning functions/getters and `StatelessWidget`/`StatefulWidget` classes. Spawns a headless `flutter-tester` process and renders the widget live in a panel beside the editor.

## 0.2.0

- Redesigned the panel UI/UX: overhauled timeline, frame view, and overall styling.
- Marketplace-ready metadata: icon, keywords, categories, repository/bugs/homepage links, gallery banner, and pricing.
- README now embeds the demo GIF instead of a placeholder.

## 0.1.0

Initial release.

- "▶ Live View" CodeLens above `testWidgets(...)` calls with a literal string name.
- Runs the selected test via `flutter test --plain-name --machine` and streams captured frames into a webview panel.
- Paced playback timeline: frames replay spaced by their fake-clock timestamps (capped at 300ms per gap), with a scrubber holding the full frame history.
- Pass/fail status with inline error and stack trace display on failure.
- One-click setup prompt when the `live_test_view` package isn't wired into the project yet.
