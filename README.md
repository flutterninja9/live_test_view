# Live Test View

Watch your Flutter widget tests render live, right next to the code, without leaving your editor. Click a CodeLens above any `testWidgets` block and a panel opens beside your editor, replaying every frame the test painted as the test ran.

This repo has two halves that work together:

- [`packages/live_test_view`](packages/live_test_view) — a tiny Dart package you add to a Flutter project. When activated, it captures a PNG of every rendered frame during a widget test and streams them on stdout.
- [`extension`](extension) — a VS Code extension that adds a "▶ Live View" CodeLens above `testWidgets(...)` calls, runs the test for you, and shows the captured frames in a scrubbable timeline.

## Setup

Two steps, from a Flutter project with widget tests:

1. **Install the extension** — search "Live Test View" in the VS Code Extensions view, or install the `.vsix` directly.
2. **Wire up the package** — click "▶ Live View" above any `testWidgets(...)` call. If frames don't show up, the panel offers a one-click setup prompt that runs:

   ```bash
   flutter pub add --dev live_test_view && dart run live_test_view:install
   ```

   That's it — no manual config in the common case.

## How it works

The installer writes `test/flutter_test_config.dart`, which calls a hook (`liveTestView`) around your test suite's entry point. When the extension runs a test, it sets `LIVE_TEST_VIEW=1` in the test process's environment, and the hook attaches a frame callback that captures a PNG snapshot after every paint. Each frame is written to stdout as a single `##LTV##`-prefixed JSON line; the extension's test runner reads those lines and forwards each frame to a webview panel, which replays them on a scrubbable timeline. Without the environment flag, the hook is a strict no-op — `flutter test` on its own behaves exactly as if the package weren't there.

## v1 limitations

- Only `testWidgets` calls with a **literal string name** get a CodeLens — interpolated (`'test $i'`) or raw-string names can't be resolved statically, since the extension needs the exact string to pass to `flutter test --plain-name`.
- Test names are matched with `--plain-name`, which is a **substring** match. If two tests in the same file have names where one contains the other (e.g. `'renders'` and `'renders correctly'`), clicking the CodeLens for the shorter name will also run the longer one.
- Widget tests only (`testWidgets`) — plain `test()` blocks have no render tree to capture, so they get no CodeLens.

## Troubleshooting

**No frames appear ("No frames received" in the panel):** the `live_test_view` package isn't wired into this project yet, or the test process never ran through it. Use the panel's "Set up Live Test View" button, or run the two setup commands above manually. If the project already has a `test/flutter_test_config.dart` (common in larger apps), the installer won't overwrite it — it prints instructions for wrapping your existing `testExecutable` body with `liveTestView(...)` by hand.

**Frames arrive all at once instead of trickling in:** this is expected. Widget tests commonly run on a fake clock (`FakeAsync`), which starves the real event loop until the test body finishes — so frames are captured throughout the test but only flush to stdout in a burst near the end. The panel compensates by replaying the burst as paced playback, spacing frames apart using the fake clock's own timestamps (capped at 300ms per gap) so it still reads as a live sequence. The timeline scrubber holds the full frame history regardless, so nothing is lost — you can always scrub back through every frame after the fact.

## Before publishing

- [ ] Demo GIF: record with the example app before publishing.

## License

MIT — see [LICENSE](LICENSE).
