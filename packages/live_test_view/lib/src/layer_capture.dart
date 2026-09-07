import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/rendering.dart';

/// Finds the root composited [Layer] for [renderView].
Layer? rootLayerFor(RenderView renderView) {
  Layer? root = renderView.debugLayer;
  while (root?.parent != null) {
    root = root!.parent;
  }
  return root;
}

/// Starts rasterizing [renderView]'s current frame.
///
/// Returns null when the view has not composited yet. Accepts any
/// [OffsetLayer] root — including [TransformLayer], which apps like GetX use.
Future<ui.Image>? captureRenderView(RenderView renderView) {
  final root = rootLayerFor(renderView);
  if (root is! OffsetLayer) return null;
  return root.toImage(renderView.paintBounds);
}

/// True when a sparse grid over the RGBA buffer finds no opaque pixels.
///
/// Partially-filled viewports (list items, cards without a full-screen
/// [Scaffold]) and GetX apps that paint content away from the exact center
/// must not be treated as blank.
bool isBlankRgbaGrid(ByteData raw, int width, int height) {
  if (width <= 0 || height <= 0) return true;

  const alphaThreshold = 250;

  bool opaqueAt(int x, int y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    final offset = (y * width + x) * 4;
    if (offset + 3 >= raw.lengthInBytes) return false;
    return raw.getUint8(offset + 3) >= alphaThreshold;
  }

  // Always probe corners and center — catches small widgets that a coarse
  // grid would skip on large viewports.
  final probes = <(int, int)>{
    (0, 0),
    (width - 1, 0),
    (0, height - 1),
    (width - 1, height - 1),
    (width ~/ 2, height ~/ 2),
    (width ~/ 4, height ~/ 4),
    (width * 3 ~/ 4, height ~/ 4),
    (width ~/ 4, height * 3 ~/ 4),
    (width * 3 ~/ 4, height * 3 ~/ 4),
  };
  for (final (x, y) in probes) {
    if (opaqueAt(x, y)) return false;
  }

  final step = (width ~/ 32).clamp(8, 64);
  for (var y = 0; y < height; y += step) {
    for (var x = 0; x < width; x += step) {
      if (opaqueAt(x, y)) return false;
    }
  }
  return true;
}
