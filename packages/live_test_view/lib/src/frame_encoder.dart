import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'protocol.dart';

/// Binding-agnostic core of frame capture: given a per-frame image future and
/// timestamp, encodes it to PNG and emits it on [_sink] in strict seq order,
/// regardless of real completion order. Shared by test mode ([FrameCapture],
/// driven by TestWidgetsFlutterBinding's persistent frame callback) and
/// preview mode (`previewCapture`, driven by the app binding's one-shot
/// post-frame callback, re-registered every frame).
///
/// Deliberately NOT a `CoalescingGate`, and deliberately NOT a sequential
/// "await one before starting the next" queue either — both were tried in
/// test mode and both broke frame capture:
///
/// 1. CoalescingGate: under FakeAsync-driven test bodies, nothing on this
///    Zone.root-escaped pipeline gets a real event-loop turn until very
///    late in the run, so the gate's "in flight" window spans almost the
///    entire suite instead of a genuine millisecond-scale burst. Its
///    (otherwise correct) drop-latest semantics then silently discards
///    nearly every frame — measured empirically at 17 real frames
///    collapsing to 2.
/// 2. A `.then()`-chained serial queue that only calls `toImage()` (or only
///    attaches a listener to an already-created image future) once the
///    previous frame's whole encode finished: this deadlocked outright —
///    frame 0 resolved, frame 1's `await imageFuture` then hung forever.
///    Attaching a listener to *every* frame's `toImage()` future
///    immediately and independently at capture time doesn't have this
///    problem; deferring that attachment (as the chained version does) is
///    what breaks it.
///
/// So: fire every frame's encode independently and immediately, and reorder
/// on the way out ([_emitReady]) instead of serializing on the way in.
/// Preview mode never runs under FakeAsync itself, but keeps the same
/// design so both modes share one implementation.
class FrameEncoder {
  FrameEncoder({IOSink? sink, this.maxFrames = 500}) : _sink = sink ?? stdout;

  final IOSink _sink;
  final int maxFrames;

  int _seq = 0;
  bool _capWarned = false;

  final _completed = <int, _EncodedFrame>{};
  int _nextEmitSeq = 0;
  int _emittedCount = 0;
  int _pendingCount = 0;
  Completer<void>? _drainWaiter;

  /// True once [maxFrames] captures have been started. Callers must check
  /// this before calling [capture] and call [warnCapOnce] instead.
  bool get atCap => _seq >= maxFrames;

  void warnCapOnce() {
    if (_capWarned) return;
    _capWarned = true;
    _sink.writeln(encodeWarningLine(
        'frame cap ($maxFrames) reached; dropping further frames'));
  }

  /// Starts capturing [imageFuture] as the next frame. Must not be called
  /// when [atCap] is true.
  void capture(Future<ui.Image> imageFuture, int testTimeMs) {
    final seq = _seq++;
    _pendingCount++;
    Zone.root.run(() => _captureFrom(imageFuture, seq, testTimeMs));
  }

  Future<void> _captureFrom(
      Future<ui.Image> imageFuture, int seq, int testTimeMs) async {
    ui.Image? image;
    try {
      image = await imageFuture;
      final raw = await image.toByteData(format: ui.ImageByteFormat.rawRgba);
      if (raw == null || _isBlankSnapshot(raw, image.width, image.height)) {
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

  /// True when corners *and* center are transparent — a mid-recomposition
  /// glitch with nothing painted yet.
  ///
  /// Partially-filled viewports (e.g. a list item as [MaterialApp.home]
  /// without a [Scaffold]) leave the viewport corners unpainted; those are
  /// valid frames and must not be dropped just because the corners are clear.
  bool _isBlankSnapshot(ByteData raw, int width, int height) {
    bool transparentAt(int x, int y) {
      final offset = (y * width + x) * 4;
      if (offset + 3 >= raw.lengthInBytes) return true;
      return raw.getUint8(offset + 3) < 250;
    }

    final cx = width ~/ 2;
    final cy = height ~/ 2;
    return transparentAt(0, 0) &&
        transparentAt(width - 1, 0) &&
        transparentAt(0, height - 1) &&
        transparentAt(width - 1, height - 1) &&
        transparentAt(cx, cy);
  }

  void _emitReady() {
    while (true) {
      final frame = _completed.remove(_nextEmitSeq);
      if (frame == null) {
        if (_pendingCount == 0 && _completed.isNotEmpty) {
          _nextEmitSeq++;
          continue;
        }
        return;
      }
      _nextEmitSeq++;
      _sink.writeln(encodeFrameLine(
        seq: _emittedCount++,
        testTimeMs: frame.testTimeMs,
        width: frame.width,
        height: frame.height,
        png: frame.png,
      ));
    }
  }

  /// Awaits all in-flight captures and flushes the sink.
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
