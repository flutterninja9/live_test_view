import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:live_test_view/src/installer.dart';

void main() {
  late Directory root;

  setUp(() {
    root = Directory.systemTemp.createTempSync('ltv_install');
  });

  tearDown(() => root.deleteSync(recursive: true));

  test('writes config into an existing test/ directory', () {
    Directory('${root.path}/test').createSync();
    expect(install(root), isA<Installed>());
    final content =
        File('${root.path}/test/flutter_test_config.dart').readAsStringSync();
    expect(content, contains('liveTestView(testMain)'));
    expect(content, contains("import 'package:live_test_view/live_test_view.dart'"));
  });

  test('refuses when there is no test/ directory', () {
    expect(install(root), isA<NoTestDirectory>());
  });

  test('never overwrites an existing config', () {
    Directory('${root.path}/test').createSync();
    final existing = File('${root.path}/test/flutter_test_config.dart')
      ..writeAsStringSync('// user content');
    expect(install(root), isA<ConfigAlreadyExists>());
    expect(existing.readAsStringSync(), '// user content');
  });
}
