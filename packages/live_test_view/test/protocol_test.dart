import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:live_test_view/src/protocol.dart';

void main() {
  test('encodeFrameLine produces a single marked line with all fields', () {
    final png = Uint8List.fromList([0x89, 0x50, 0x4E, 0x47]);
    final line = encodeFrameLine(
        seq: 3, testTimeMs: 450, width: 800, height: 600, png: png);
    expect(line, startsWith(ltvMarker));
    expect(line.contains('\n'), isFalse);
    final decoded =
        jsonDecode(line.substring(ltvMarker.length)) as Map<String, dynamic>;
    expect(decoded, {
      'v': 1,
      'type': 'frame',
      'seq': 3,
      'testTimeMs': 450,
      'w': 800,
      'h': 600,
      'png': base64Encode(png),
    });
  });

  test('encodeWarningLine emits versioned warning', () {
    final line = encodeWarningLine('frame cap reached');
    final decoded = jsonDecode(line.substring(ltvMarker.length));
    expect(decoded, {'v': 1, 'type': 'warning', 'message': 'frame cap reached'});
  });
}
