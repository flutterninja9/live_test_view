import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

import 'frame_encoder.dart';

/// Boots [builder] as the app root under a headless engine (the intended
/// target is `flutter run -d flutter-tester`) and streams every subsequent
/// frame — including ones produced by hot reload's `reassemble()` — to
/// stdout using the same ##LTV## protocol test mode uses.
///
/// Call this from a generated preview entrypoint's `main()`; see the
/// live-test-view VS Code extension's `previewEntry.ts` for how that
/// entrypoint is generated and why it always wraps [builder]'s result in a
/// `MaterialApp`/`Scaffold` itself rather than this function doing it.
void previewCapture(Widget Function() builder) {
  WidgetsFlutterBinding.ensureInitialized();
  final encoder = FrameEncoder();
  DateTime? firstFrameAt;

  void onFrame(Duration _) {
    firstFrameAt ??= DateTime.now();
    if (encoder.atCap) {
      encoder.warnCapOnce();
    } else {
      final renderView = WidgetsBinding.instance.renderViews.first;
      final layer = renderView.debugLayer;
      if (layer is OffsetLayer) {
        final imageFuture = layer.toImage(renderView.paintBounds);
        final testTimeMs =
            DateTime.now().difference(firstFrameAt!).inMilliseconds;
        encoder.capture(imageFuture, testTimeMs);
      }
    }
    // Unlike TestWidgetsFlutterBinding, the plain app binding has no
    // persistent-callback API — re-register for the next frame every time,
    // which also covers frames produced by hot reload's reassemble().
    WidgetsBinding.instance.addPostFrameCallback(onFrame);
  }

  WidgetsBinding.instance.addPostFrameCallback(onFrame);
  runApp(builder());
}
