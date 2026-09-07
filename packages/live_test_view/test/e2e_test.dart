@Timeout(Duration(minutes: 5))
library;

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:live_test_view/src/protocol.dart';

Future<ProcessResult> _runExampleTests({
  required bool live,
  String testFile = 'test/counter_test.dart',
  String? plainName,
}) {
  final args = ['test', testFile, if (plainName != null) ...['--plain-name', plainName]];
  return Process.run(
    'flutter',
    args,
    workingDirectory: 'example',
    environment: {
      ...Platform.environment,
      if (live) 'LIVE_TEST_VIEW': '1',
    },
  );
}

List<Map<String, dynamic>> _framesFrom(ProcessResult result) =>
    const LineSplitter()
        .convert(result.stdout.toString())
        .expand<Map<String, dynamic>>((l) {
          final i = l.indexOf(ltvMarker);
          if (i < 0) return const [];
          return [
            jsonDecode(l.substring(i + ltvMarker.length))
                as Map<String, dynamic>
          ];
        })
        .where((e) => e['type'] == 'frame')
        .toList();

void main() {
  test('emits ordered, decodable PNG frames when activated', () async {
    final result = await _runExampleTests(live: true);
    expect(result.exitCode, 0, reason: '${result.stderr}');
    // flutter test's compact reporter forwards the test process's prints
    // alongside its own carriage-return-driven progress text, which can glue
    // directly onto an adjacent line with no newline separator — so the
    // marker isn't guaranteed to sit at index 0. Locate it anywhere in the
    // line instead of requiring startsWith.
    final frames = _framesFrom(result);
    expect(frames.length, greaterThanOrEqualTo(6),
        reason: '2 frames from test 1 + ≥4 animation frames from test 2');
    final seqs = frames.map((f) => f['seq'] as int).toList();
    expect(seqs, List<int>.generate(seqs.length, (i) => i),
        reason: 'gapless, ordered seq — no drops, no reordering');
    for (final f in frames) {
      expect(f['v'], 1);
      // Physical pixels: 800x600 logical at this test binding's default
      // devicePixelRatio of 3.0 (measured empirically on Flutter 3.38.5).
      expect(f['w'], 2400);
      expect(f['h'], 1800);
      expect(f['testTimeMs'], isA<int>());
      final png = base64Decode(f['png'] as String);
      expect(png.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47],
          reason: 'PNG magic bytes');
    }
  });

  test('captures partial-viewport widgets without a full-screen scaffold', () async {
    final result = await _runExampleTests(
      live: true,
      plainName: 'without scaffold',
    );
    expect(result.exitCode, 0, reason: '${result.stderr}');
    expect(
      _framesFrom(result).length,
      greaterThan(0),
      reason: 'widgets that do not fill the viewport must still emit frames',
    );
  });

  test('is byte-for-byte silent without the activation flag', () async {
    final result = await _runExampleTests(live: false);
    expect(result.exitCode, 0);
    expect(result.stdout.toString().contains(ltvMarker), isFalse);
  });
}
