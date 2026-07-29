import 'dart:async';

/// Serializes async work triggered by a synchronous, possibly bursty signal.
///
/// At most one action runs at a time. Requests arriving while one is running
/// collapse into a single follow-up (of the latest action), so the last
/// request is always honored but bursts never queue unboundedly.
class CoalescingGate {
  bool _inFlight = false;
  bool _dirty = false;
  Future<void> Function()? _latest;
  Future<void> _pending = Future.value();

  void request(Future<void> Function() action) {
    _latest = action;
    if (_inFlight) {
      _dirty = true;
      return;
    }
    _run();
  }

  void _run() {
    _inFlight = true;
    _pending = _latest!().whenComplete(() {
      _inFlight = false;
      if (_dirty) {
        _dirty = false;
        _run();
      }
    });
  }

  /// Completes when no work is running or queued.
  Future<void> drain() async {
    while (_inFlight) {
      await _pending;
    }
  }
}
