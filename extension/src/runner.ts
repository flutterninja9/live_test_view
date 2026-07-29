import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { ParsedLine, parseLine } from './protocol';

export function findProjectRoot(testFilePath: string): string | undefined {
  let dir = path.dirname(testFilePath);
  for (;;) {
    if (fs.existsSync(path.join(dir, 'pubspec.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Owns at most one live `flutter test` child process. */
export class TestRun {
  private child: cp.ChildProcess | undefined;

  start(
    testFilePath: string,
    testName: string,
    onLine: (l: ParsedLine) => void,
    onExit: (code: number | null) => void,
  ): void {
    this.kill();
    const root = findProjectRoot(testFilePath);
    if (!root) throw new Error(`No pubspec.yaml found above ${testFilePath}`);
    const rel = path.relative(root, testFilePath);
    const child = cp.spawn(
      'flutter',
      ['test', rel, '--plain-name', testName, '--machine'],
      {
        cwd: root,
        env: { ...process.env, LIVE_TEST_VIEW: '1' },
        // flutter is flutter.bat on Windows; spawn needs a shell there.
        shell: process.platform === 'win32',
      },
    );
    this.child = child;
    readline
      .createInterface({ input: child.stdout! })
      .on('line', (l) => onLine(parseLine(l)));
    readline
      .createInterface({ input: child.stderr! })
      .on('line', (l) => onLine({ kind: 'other', text: l }));
    child.on('exit', (code) => {
      if (this.child === child) this.child = undefined;
      onExit(code);
    });
  }

  kill(): void {
    this.child?.kill();
    this.child = undefined;
  }
}
