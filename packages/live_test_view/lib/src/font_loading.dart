import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';

import 'protocol.dart';

/// Loads real fonts into the test environment so captured frames show
/// actual glyphs.
///
/// `flutter test` renders all text with a placeholder font (FlutterTest /
/// Ahem) whose every glyph is a solid box — correct for layout tests,
/// useless to look at. Only called when live view is active, so plain test
/// runs keep the placeholder font and golden files are unaffected.
Future<void> loadRealFonts() async {
  await _loadRobotoFromSdkCache();
  await _loadFontManifestFonts();
}

/// Roboto is not bundled with test assets, but every Flutter SDK ships it
/// in bin/cache/artifacts/material_fonts. Resolve it relative to the
/// running dart executable (<sdk>/bin/cache/dart-sdk/bin/dart) so this
/// works with any SDK install, including fvm.
Future<void> _loadRobotoFromSdkCache() async {
  try {
    final cache =
        File(Platform.resolvedExecutable).parent.parent.parent.parent;
    final fontsDir = Directory('${cache.path}/artifacts/material_fonts');
    if (!fontsDir.existsSync()) return;
    final loader = FontLoader('Roboto');
    var found = false;
    for (final file in fontsDir.listSync().whereType<File>()) {
      final name = file.uri.pathSegments.last;
      if (name.startsWith('Roboto-') && name.endsWith('.ttf')) {
        found = true;
        loader.addFont(file.readAsBytes().then(ByteData.sublistView));
      }
    }
    if (found) await loader.load();
  } catch (_) {
    // SDK layout changed or unreadable — frames fall back to box glyphs.
  }
}

/// Fonts the project itself bundles (and MaterialIcons) are listed in
/// FontManifest.json and loadable through the asset bundle.
///
/// Not to be confused with fonts an app loads itself at runtime (e.g.
/// `google_fonts`, which fetches over HTTP the first time it's used) — those
/// aren't in this manifest and aren't handled here. See the "Fonts" section
/// in the README for why that case can't be supported the same way.
Future<void> _loadFontManifestFonts() async {
  List<dynamic> manifest;
  try {
    final manifestData = await rootBundle.load('FontManifest.json');
    manifest = json.decode(utf8.decode(manifestData.buffer.asUint8List()))
        as List<dynamic>;
  } catch (_) {
    // No manifest in this test build — nothing to preload.
    return;
  }
  for (final entry in manifest.cast<Map<String, dynamic>>()) {
    final family = entry['family'] as String;
    // Isolated per entry: one bad/unreadable font must not abort the rest
    // of the manifest — every other family should still load.
    try {
      final loader = FontLoader(family);
      for (final font
          in (entry['fonts'] as List).cast<Map<String, dynamic>>()) {
        loader.addFont(rootBundle.load(font['asset'] as String));
      }
      await loader.load();
    } catch (e) {
      stdout.writeln(encodeWarningLine(
          'font "$family" failed to load and will render as a placeholder box: $e'));
    }
  }
}
