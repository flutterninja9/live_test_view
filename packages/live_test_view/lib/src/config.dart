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
  tearDown(() => capture.setActive(false));
  // `testMain` only *declares* the suite's tests here — package:test invokes
  // the declared test bodies afterward, outside this awaited Future. So the
  // real end-of-suite hook is tearDownAll, which package:test guarantees to
  // run once all declared tests have actually executed, still inside the
  // isolate that owns the persistent frame callback above. Registering it
  // before `await testMain()` (rather than flushing in a `finally` after)
  // is required: a `finally` here would run once mere declaration finishes,
  // not once the tests actually execute.
  tearDownAll(() => capture.flush());
  await testMain();
}
