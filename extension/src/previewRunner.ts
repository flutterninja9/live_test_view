// extension/src/previewRunner.ts
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { findProjectRoot } from './runner';
import { generatePreviewEntry, previewEntryPathFor, PreviewTarget } from './previewEntry';
import { DaemonEvent, encodeRestartCommand, parseDaemonLine } from './previewProtocol';
import { ParsedLine, parseLine } from './protocol';

export interface PreviewSpawnTarget {
  targetFilePath: string;
  symbolName: string;
  kind: 'class' | 'function' | 'getter';
}

/** Owns at most one live `flutter run -d flutter-tester` process. */
export class PreviewRun {
  private child: cp.ChildProcess | undefined;
  private appId: string | undefined;
  private restartId = 0;
  /** Path of the generated entrypoint to delete when the run ends. */
  private activeEntryPath: string | undefined;

  start(
    target: PreviewSpawnTarget,
    onFrame: (l: ParsedLine) => void,
    onDaemonEvent: (e: DaemonEvent) => void,
    onExit: (code: number | null) => void,
  ): void {
    this.kill();
    const root = findProjectRoot(target.targetFilePath);
    if (!root) throw new Error(`No pubspec.yaml found above ${target.targetFilePath}`);
    const entryFilePath = previewEntryPathFor(root);
    const entry: PreviewTarget = {
      targetFilePath: target.targetFilePath,
      entryFilePath,
      symbolName: target.symbolName,
      kind: target.kind,
    };
    fs.mkdirSync(path.dirname(entryFilePath), { recursive: true });
    fs.writeFileSync(entryFilePath, generatePreviewEntry(entry));
    this.activeEntryPath = entryFilePath;
    const relEntry = path.relative(root, entryFilePath);
    const child = cp.spawn(
      'flutter',
      ['run', '-d', 'flutter-tester', '--machine', '-t', relEntry],
      {
        cwd: root,
        // flutter is flutter.bat on Windows; spawn needs a shell there.
        shell: process.platform === 'win32',
      },
    );
    this.child = child;
    this.appId = undefined;
    readline.createInterface({ input: child.stdout! }).on('line', (line) => {
      const daemonEvents = parseDaemonLine(line);
      if (daemonEvents.length > 0) {
        for (const event of daemonEvents) {
          if (event.event === 'app.start') this.appId = event.params.appId;
          onDaemonEvent(event);
        }
        return;
      }
      onFrame(parseLine(line));
    });
    readline
      .createInterface({ input: child.stderr! })
      .on('line', (l) => onFrame({ kind: 'other', text: l }));
    child.on('exit', (code) => {
      if (this.child === child) {
        this.child = undefined;
        this.appId = undefined;
      }
      onExit(code);
    });
  }

  /**
   * Triggers a hot reload without restarting the flutter process.
   *
   * Nothing needs to be touched on disk first: flutter_tools stats every
   * source of the previous compile and invalidates the ones whose mtime is
   * newer, so the user's just-saved file is picked up on its own. (An earlier
   * version rewrote the entrypoint with a fresh timestamp to "force" a
   * recompile. That was a workaround for a misdiagnosis — the entrypoint's
   * location, not its mtime, was what kept the target from reloading; see
   * `previewEntryPathFor`. All it actually did was reload the entrypoint
   * library itself.)
   */
  reload(): void {
    if (!this.child || !this.appId) return;
    const cmd = encodeRestartCommand(++this.restartId, this.appId, false);
    this.child.stdin!.write(cmd + '\n');
  }

  kill(): void {
    this.child?.kill();
    this.child = undefined;
    this.appId = undefined;
    if (this.activeEntryPath) {
      // Generated into the user's lib/; never leave it behind.
      fs.rmSync(this.activeEntryPath, { force: true });
      this.activeEntryPath = undefined;
    }
  }
}
