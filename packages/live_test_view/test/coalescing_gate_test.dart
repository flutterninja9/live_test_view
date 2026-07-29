import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:live_test_view/src/coalescing_gate.dart';

void main() {
  test('runs immediately when idle', () async {
    final gate = CoalescingGate();
    var runs = 0;
    gate.request(() async => runs++);
    await gate.drain();
    expect(runs, 1);
    gate.request(() async => runs++);
    await gate.drain();
    expect(runs, 2);
  });

  test('coalesces a burst into exactly one follow-up run', () async {
    final gate = CoalescingGate();
    var runs = 0;
    final blocker = Completer<void>();
    Future<void> action() async {
      runs++;
      if (runs == 1) await blocker.future;
    }

    gate.request(action);
    gate.request(action);
    gate.request(action);
    gate.request(action);
    expect(runs, 1, reason: 'burst must not queue while one is in flight');
    blocker.complete();
    await gate.drain();
    expect(runs, 2, reason: 'exactly one follow-up for the whole burst');
  });

  test('follow-up runs the latest requested action', () async {
    final gate = CoalescingGate();
    final ran = <String>[];
    final blocker = Completer<void>();
    gate.request(() async {
      ran.add('first');
      await blocker.future;
    });
    gate.request(() async => ran.add('stale'));
    gate.request(() async => ran.add('latest'));
    blocker.complete();
    await gate.drain();
    expect(ran, ['first', 'latest']);
  });
}
