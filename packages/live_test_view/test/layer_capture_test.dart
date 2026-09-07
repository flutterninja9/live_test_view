import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:live_test_view/src/layer_capture.dart';

void main() {
  test('isBlankRgbaGrid returns false when any sampled pixel is opaque', () {
    final raw = _solidRgba(width: 64, height: 64, alpha: 255);
    expect(isBlankRgbaGrid(raw, 64, 64), isFalse);
  });

  test('isBlankRgbaGrid returns false for content in a corner only', () {
    final raw = ByteData(64 * 64 * 4);
    _setAlpha(raw, 64, x: 0, y: 0, alpha: 255);
    expect(isBlankRgbaGrid(raw, 64, 64), isFalse);
  });

  test('isBlankRgbaGrid returns false for content at a quarter probe point', () {
    final raw = ByteData(64 * 64 * 4);
    _setAlpha(raw, 64, x: 16, y: 16, alpha: 255);
    expect(isBlankRgbaGrid(raw, 64, 64), isFalse);
  });

  test('isBlankRgbaGrid returns true when every sampled pixel is transparent', () {
    final raw = _solidRgba(width: 64, height: 64, alpha: 0);
    expect(isBlankRgbaGrid(raw, 64, 64), isTrue);
  });

  test('grid sampling detects content away from viewport center', () {
    final raw = ByteData(64 * 64 * 4);
    _setAlpha(raw, 64, x: 16, y: 16, alpha: 255);
    const cx = 64 ~/ 2;
    const cy = 64 ~/ 2;
    expect(raw.getUint8((cy * 64 + cx) * 4 + 3), 0);
    expect(isBlankRgbaGrid(raw, 64, 64), isFalse);
  });
}

ByteData _solidRgba({required int width, required int height, required int alpha}) {
  final raw = ByteData(width * height * 4);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      _setAlpha(raw, width, x: x, y: y, alpha: alpha);
    }
  }
  return raw;
}

void _setAlpha(ByteData raw, int width, {required int x, required int y, required int alpha}) {
  final offset = (y * width + x) * 4;
  raw.setUint8(offset + 3, alpha);
}
