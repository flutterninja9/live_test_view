## 0.5.0

- Fix: widgets that do not fill the viewport (e.g. a list item or card as `MaterialApp.home` without a full-screen `Scaffold`) now emit frames instead of being silently discarded. The blank-frame guard only drops snapshots when all four corners **and** the center are transparent — a mid-recomposition glitch — not when only the viewport edges are unpainted.

## 0.4.0

- Add `previewCapture` for Live Widget Preview mode: wraps a widget in a minimal `MaterialApp`/`Scaffold`, registers a post-frame capture callback, and streams the same `##LTV##` frame protocol used by test mode.

## 0.2.1

- Fix: a font that fails to load from `FontManifest.json` no longer aborts the rest of the manifest — each family loads independently, and a failure emits a `##LTV##` warning line naming it instead of silently rendering a placeholder box.
- Document that `google_fonts` can't render in Live Test View (a structural conflict with `flutter_test`'s HTTP mocking, not a bug) and the offline-asset workaround.

## 0.2.0

- Fix bug where jank inital and final frames were rendering

## 0.1.0

Initial release.

- `liveTestView` test-executable hook: activates frame capture only when `LIVE_TEST_VIEW=1` is set, and is a byte-for-byte no-op otherwise.
- Frame capture after every pumped frame, encoded as PNG and emitted as an ordered, gapless sequence of `##LTV##`-prefixed JSON lines on stdout.
- 500-frame cap per test run, with a warning line emitted once the cap is reached.
- `dart run live_test_view:install` — writes `test/flutter_test_config.dart`, or prints manual wiring instructions if one already exists.
