import 'dart:io';

import 'package:live_test_view/src/installer.dart';

void main() {
  switch (install(Directory.current)) {
    case Installed():
      stdout.writeln('✓ Wrote test/flutter_test_config.dart');
    case NoTestDirectory():
      stderr.writeln(
          'No test/ directory here. Run from your Flutter project root.');
      exitCode = 1;
    case ConfigAlreadyExists():
      stdout.writeln('test/flutter_test_config.dart already exists.');
      stdout.writeln(
          'Wire live_test_view in manually by wrapping your existing body:');
      stdout.writeln('');
      stdout.writeln(
          '  Future<void> testExecutable(FutureOr<void> Function() testMain) =>');
      stdout.writeln('      liveTestView(() => yourExistingSetup(testMain));');
  }
}
