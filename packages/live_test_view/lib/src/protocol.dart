import 'dart:convert';
import 'dart:typed_data';

/// Prefix for every Live Test View line on stdout. The extension routes
/// lines by this marker; everything else passes through untouched.
const ltvMarker = '##LTV##';

String encodeFrameLine({
  required int seq,
  required int testTimeMs,
  required int width,
  required int height,
  required Uint8List png,
}) =>
    '$ltvMarker${jsonEncode(<String, Object>{
      'v': 1,
      'type': 'frame',
      'seq': seq,
      'testTimeMs': testTimeMs,
      'w': width,
      'h': height,
      'png': base64Encode(png),
    })}';

String encodeWarningLine(String message) =>
    '$ltvMarker${jsonEncode(<String, Object>{
      'v': 1,
      'type': 'warning',
      'message': message,
    })}';
