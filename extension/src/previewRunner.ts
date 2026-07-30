// extension/src/previewRunner.ts
import * as cp from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { findProjectRoot } from './runner';
import { generatePreviewEntry, PreviewTarget } from './previewEntry';
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
  /** Stored on start() so reload() can rewrite the file with a fresh stamp. */
  private activeEntry: PreviewTarget | undefined;

  start(
    target: PreviewSpawnTarget,
    onFrame: (l: ParsedLine) => void,
    onDaemonEvent: (e: DaemonEvent) => void,
    onExit: (code: number | null) => void,
  ): void {
    this.kill();
    const root = findProjectRoot(target.targetFilePath);
    if (!root) throw new Error(`No pubspec.yaml found above ${target.targetFilePath}`);
    const entryFilePath = path.join(root, '.dart_tool', 'live_test_view', 'preview_entry.dart');
    this.activeEntry = {
      targetFilePath: target.targetFilePath,
      entryFilePath,
      symbolName: target.symbolName,
      kind: target.kind,
      // no stamp on initial launch — content is deterministic and readable
    };
    fs.mkdirSync(path.dirname(entryFilePath), { recursive: true });
    fs.writeFileSync(entryFilePath, generatePreviewEntry(this.activeEntry));
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
   * The core problem with naive hot reload: flutter's incremental compiler
   * only recompiles files whose mtime has changed since the last build. When
   * the user edits their widget source the entrypoint (`preview_entry.dart`)
   * hasn't changed, so the compiler sees an empty diff and sends a no-op
   * delta — `reassemble()` runs with the old code and the frame looks
   * identical.
   *
   * Fix: rewrite `preview_entry.dart` with a fresh ISO timestamp in the
   * header comment before sending `app.restart`. The file's content and mtime
   * both change, which forces the compiler to re-parse it, re-resolve all of
   * its imports, and recompile every import whose mtime is also newer — which
   * includes the user's just-saved widget file. The resulting delta carries
   * the real code change, `reassemble()` rebuilds with new function bodies,
   * and the updated frame is captured.
   */
  reload(): void {
    if (!this.child || !this.appId || !this.activeEntry) return;
    fs.writeFileSync(
      this.activeEntry.entryFilePath,
      generatePreviewEntry({ ...this.activeEntry, stamp: new Date().toISOString() }),
    );
    const cmd = encodeRestartCommand(++this.restartId, this.appId, false);
    this.child.stdin!.write(cmd + '\n');
  }

  kill(): void {
    this.child?.kill();
    this.child = undefined;
    this.appId = undefined;
    this.activeEntry = undefined;
  }
}
