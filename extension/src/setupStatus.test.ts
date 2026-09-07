import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  hasLiveTestViewConfig,
  hasLiveTestViewDependency,
  inspectSetup,
} from './setupStatus';

describe('setupStatus', () => {
  let tmp: string;

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  function writeProject(opts: {
    withDependency?: boolean;
    withConfig?: boolean;
    wired?: boolean;
  }) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ltv-setup-'));
    const root = path.join(tmp, 'app');
    const testDir = path.join(root, 'test');
    fs.mkdirSync(testDir, { recursive: true });
    const depBlock = opts.withDependency
      ? 'dev_dependencies:\n  live_test_view: ^0.5.1\n'
      : 'dev_dependencies:\n  flutter_test:\n    sdk: flutter\n';
    fs.writeFileSync(path.join(root, 'pubspec.yaml'), `name: app\n${depBlock}`);
    if (opts.withConfig) {
      const body = opts.wired
        ? "import 'package:live_test_view/live_test_view.dart';\nFuture<void> testExecutable(FutureOr<void> Function() testMain) => liveTestView(testMain);\n"
        : 'Future<void> testExecutable(FutureOr<void> Function() testMain) async => testMain();\n';
      fs.writeFileSync(path.join(testDir, 'flutter_test_config.dart'), body);
    }
    const testFile = path.join(testDir, 'widget_test.dart');
    fs.writeFileSync(testFile, "void main() {}");
    return { root, testFile };
  }

  it('detects missing dependency', () => {
    const { testFile } = writeProject({});
    expect(inspectSetup(testFile)).toEqual({ kind: 'missingPackage' });
  });

  it('detects missing flutter_test_config.dart', () => {
    const { testFile } = writeProject({ withDependency: true });
    expect(inspectSetup(testFile)).toEqual({ kind: 'missingConfig' });
  });

  it('detects config that is not wired to liveTestView', () => {
    const { testFile } = writeProject({
      withDependency: true,
      withConfig: true,
      wired: false,
    });
    expect(inspectSetup(testFile)).toEqual({ kind: 'configNotWired' });
  });

  it('reports ready when dependency and config are present', () => {
    const { testFile, root } = writeProject({
      withDependency: true,
      withConfig: true,
      wired: true,
    });
    expect(hasLiveTestViewDependency(root)).toBe(true);
    expect(hasLiveTestViewConfig(root)).toBe(true);
    expect(inspectSetup(testFile)).toEqual({ kind: 'ready' });
  });
});
