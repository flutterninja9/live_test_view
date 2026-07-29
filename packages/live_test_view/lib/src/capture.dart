import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';

import 'protocol.dart';

/// Captures the test's root render layer after each pumped frame and emits
/// it as a protocol line on [_sink].
///
/// Every frame is snapshotted synchronously at the moment [onFrame] fires
/// (spike behavior — see the module doc below on why), and each snapshot's
/// encode is started immediately and independently, exactly like the
/// others. A small reorder buffer ([_completed]) guarantees emission is
/// still strict FIFO by seq even though real completion order is
/// unpredictable.
class FrameCapture {
  FrameCapture(this._binding, {IOSink? sink, this.maxFrames = 500})
      : _sink = sink ?? stdout;

  final TestWidgetsFlutterBinding _binding;
  final IOSink _sink;
  final int maxFrames;

  int _seq = 0;
  bool _capWarned = false;
  DateTime? _firstFrameAt;

  // Deliberately NOT `CoalescingGate` (Task 4), and deliberately NOT a
  // sequential "await one before starting the next" queue either — both
  // were tried and both broke frame capture:
  //
  // 1. CoalescingGate: under FakeAsync-driven test bodies, nothing on this
  //    Zone.root-escaped pipeline gets a real event-loop turn until very
  //    late in the run, so the gate's "in flight" window spans almost the
  //    entire suite instead of a genuine millisecond-scale burst. Its
  //    (otherwise correct) drop-latest semantics then silently discards
  //    nearly every frame — measured empirically at 17 real frames
  //    collapsing to 2 (see task-3-6-report deviation #3).
  // 2. A `.then()`-chained serial queue that only calls `toImage()` (or
  //    only attaches a listener to an already-created image future) once
  //    the previous frame's whole encode finished: this deadlocked outright
  //    — frame 0 resolved, frame 1's `await imageFuture` then hung forever.
  //    The spike (Task 1-2) never had this problem because it attached a
  //    listener to *every* frame's `toImage()` future immediately and
  //    independently at capture time; deferring that attachment (as the
  //    chained version does) is what breaks it. Root cause not fully
  //    isolated beyond that; treated as an empirical constraint, not
  //    re-litigated further given a working alternative exists.
  //
  // So: fire every frame's encode independently and immediately (matching
  // the proven-working spike), and reorder on the way out instead of
  // serializing on the way in.
  final _completed = <int, _EncodedFrame>{};
  int _nextEmitSeq = 0;
  int _emittedCount = 0;
  int _pendingCount = 0;
  Completer<void>? _drainWaiter;
  bool _active = false;

  /// Gates capture to only the window between a test's `setUp` and
  /// `tearDown`. Flutter's test framework pumps frames outside that window
  /// too — tearing down the previous test's tree and building the next —
  /// and our persistent frame callback fires on every one of them. Without
  /// this gate, those transitional frames (empty canvas, stale partially
  /// composited layers) get captured and emitted as if they were real UI.
  /// Also resets the per-test clock so each test's timeline starts at 0ms.
  void setActive(bool value) {
    _active = value;
    if (value) _firstFrameAt = null;
  }

  /// Called synchronously from a persistent frame callback, after paint.
  void onFrame() {
    if (!_active) return;
    _firstFrameAt ??= _binding.clock.now();
    if (_seq >= maxFrames) {
      if (!_capWarned) {
        _capWarned = true;
        _sink.writeln(encodeWarningLine(
            'frame cap ($maxFrames) reached; dropping further frames'));
      }
      return;
    }
    final renderView = _binding.renderViews.first;
    final layer = renderView.debugLayer;
    if (layer is! OffsetLayer) return;
    // Scene is snapshotted synchronously by toImage(); only rasterization
    // and encoding are async. Snapshotting here — and starting the encode
    // immediately below, not deferred behind other frames — is what
    // guarantees the retained image is the one actually on screen at this
    // onFrame call, and what lets the engine actually resolve it (see the
    // note above on the chained-queue deadlock).
    final imageFuture = layer.toImage(renderView.paintBounds);
    final seq = _seq++;
    final testTimeMs =
        _binding.clock.now().difference(_firstFrameAt!).inMilliseconds;
    _pendingCount++;
    // Zone.root escapes FakeAsync so encoding is never trapped behind fake
    // timers. Each frame's encode runs independently; _emitReady reorders
    // completions back into strict seq order on the way out.
    Zone.root.run(() => _captureFrom(imageFuture, seq, testTimeMs));
  }

  Future<void> _captureFrom(
      Future<ui.Image> imageFuture, int seq, int testTimeMs) async {
    ui.Image? image;
    try {
      image = await imageFuture;
      // Raw pixels first (cheap, uncompressed) so we can validate the
      // composite before paying for PNG encoding.
      final raw = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
      if (raw == null || _isIncompleteComposite(raw, image.width, image.height)) {
        // Empirically observed: on an intermittent tick, `toImage()` snapshots
        // a layer tree mid-recomposition — only some child layers attached,
        // the rest still transparent. A real Flutter app always paints an
        // opaque Scaffold/Material background over the whole viewport, so a
        // transparent corner unambiguously means "not a real frame", not
        // "app with a transparent background". Drop it: never occupies the
        // emit slot, so _emitReady skips over it without a gap in the output.
        return;
      }
      final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
      if (bytes == null) return;
      _completed[seq] = _EncodedFrame(
        testTimeMs: testTimeMs,
        width: image.width,
        height: image.height,
        png: bytes.buffer.asUint8List(),
      );
    } catch (_) {
      // Dropped: never occupies the emit slot, so _emitReady skips it.
    } finally {
      image?.dispose();
      _pendingCount--;
      _emitReady();
      if (_pendingCount == 0) _drainWaiter?.complete();
    }
  }

  /// True if any corner of the raw RGBA buffer is transparent. See the call
  /// site for why that means "capture glitch", not "app content".
  bool _isIncompleteComposite(ByteData raw, int width, int height) {
    bool transparentAt(int x, int y) {
      final offset = (y * width + x) * 4;
      if (offset + 3 >= raw.lengthInBytes) return true;
      return raw.getUint8(offset + 3) < 250;
    }

    return transparentAt(0, 0) ||
        transparentAt(width - 1, 0) ||
        transparentAt(0, height - 1) ||
        transparentAt(width - 1, height - 1);
  }

  void _emitReady() {
    while (true) {
      final frame = _completed.remove(_nextEmitSeq);
      if (frame == null) {
        // If the frame at _nextEmitSeq will never arrive (dropped due to an
        // error or a detected glitch), don't stall the rest of the queue
        // behind it forever. With no in-flight work left and a gap, skip
        // past it.
        if (_pendingCount == 0 && _completed.isNotEmpty) {
          _nextEmitSeq++;
          continue;
        }
        return;
      }
      _nextEmitSeq++;
      // _emittedCount (not _nextEmitSeq) is the output seq: it counts only
      // frames actually written, so dropped glitches never leave a gap in
      // the numbering the extension relies on for ordering.
      _sink.writeln(encodeFrameLine(
        seq: _emittedCount++,
        testTimeMs: frame.testTimeMs,
        width: frame.width,
        height: frame.height,
        png: frame.png,
      ));
    }
  }

  /// Awaits all in-flight captures and flushes the sink. Call after
  /// [testMain] completes — real async is legal there.
  Future<void> flush() async {
    if (_pendingCount > 0) {
      final waiter = _drainWaiter ??= Completer<void>();
      await waiter.future;
    }
    await _sink.flush();
  }
}

class _EncodedFrame {
  _EncodedFrame({
    required this.testTimeMs,
    required this.width,
    required this.height,
    required this.png,
  });

  final int testTimeMs;
  final int width;
  final int height;
  final Uint8List png;
}
