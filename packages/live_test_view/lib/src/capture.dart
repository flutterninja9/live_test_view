import 'dart:io';

import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

import 'frame_encoder.dart';

/// Captures the test's root render layer after each pumped frame and emits
/// it via the shared [FrameEncoder] pipeline.
class FrameCapture {
  FrameCapture(this._binding, {IOSink? sink, int maxFrames = 500})
      : _encoder = FrameEncoder(sink: sink, maxFrames: maxFrames);

  final TestWidgetsFlutterBinding _binding;
  final FrameEncoder _encoder;

  DateTime? _firstFrameAt;
  bool _active = false;

  /// Gates capture to only the window between a test's `setUp` and
  /// `tearDown`. Flutter's test framework pumps frames outside that window
  /// too (tearing down the previous test's tree, building the next) and our
  /// persistent frame callback fires on every one of them; without this
  /// gate those transitional frames would be captured as if real UI. Also
  /// resets the per-test clock so each test's timeline starts at 0ms.
  void setActive(bool value) {
    _active = value;
    if (value) _firstFrameAt = null;
  }

  /// Called synchronously from a persistent frame callback, after paint.
  void onFrame() {
    if (!_active) return;
    _firstFrameAt ??= _binding.clock.now();
    if (_encoder.atCap) {
      _encoder.warnCapOnce();
      return;
    }
    final renderView = _binding.renderViews.first;
    final layer = renderView.debugLayer;
    if (layer is! OffsetLayer) return;
    final imageFuture = layer.toImage(renderView.paintBounds);
    final testTimeMs =
        _binding.clock.now().difference(_firstFrameAt!).inMilliseconds;
    _encoder.capture(imageFuture, testTimeMs);
  }

  /// Awaits all in-flight captures and flushes the sink. Call after
  /// [testMain] completes — real async is legal there.
  Future<void> flush() => _encoder.flush();
}
