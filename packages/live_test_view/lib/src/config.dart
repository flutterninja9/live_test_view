import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

import 'capture.dart';
import 'font_loading.dart';

/// Wraps a suite's `testExecutable`. Streams rendered frames to stdout when
/// the Live Test View editor extension sets LIVE_TEST_VIEW=1 in the test
/// process's environment. A strict no-op otherwise.
Future<void> liveTestView(FutureOr<void> Function() testMain) async {
  if (Platform.environment['LIVE_TEST_VIEW'] != '1') {
    await testMain();
    return;
  }
  final binding = TestWidgetsFlutterBinding.ensureInitialized();
  // Real glyphs instead of the test environment's box-placeholder font.
  // Runs before any test executes; real async is legal in testExecutable.
  await loadRealFonts();
  final capture = FrameCapture(binding);
  // Registered after binding init → runs after RendererBinding.drawFrame,
  // i.e. after layout and paint for the frame are complete.
  binding.addPersistentFrameCallback((_) => capture.onFrame());
  // Frames pumped between tests (tree teardown/rebuild) are not real UI —
  // only capture within an actual test's run.
  setUp(() => capture.setActive(true));
  tearDownAll(() => capture.flush());
  await testMain();
  // Registered after [testMain] so this runs *before* the test file's own
  // tearDown hooks (package:test runs tearDown last-registered first).
  // GetMaterialApp and similar roots often paint their real content on a
  // post-frame callback after the test body's final pump — pump once more
  // while capture is still active and before the test tears down DI/state.
  tearDown(() {
    if (capture.captureAttempts == 0) {
      binding.pump();
    }
    capture.setActive(false);
  });
}
