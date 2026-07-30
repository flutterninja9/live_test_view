"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PreviewRun = void 0;
// extension/src/previewRunner.ts
const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const runner_1 = require("./runner");
const previewEntry_1 = require("./previewEntry");
const previewProtocol_1 = require("./previewProtocol");
const protocol_1 = require("./protocol");
/** Owns at most one live `flutter run -d flutter-tester` process. */
class PreviewRun {
    child;
    appId;
    restartId = 0;
    /** Stored on start() so reload() can rewrite the file with a fresh stamp. */
    activeEntry;
    start(target, onFrame, onDaemonEvent, onExit) {
        this.kill();
        const root = (0, runner_1.findProjectRoot)(target.targetFilePath);
        if (!root)
            throw new Error(`No pubspec.yaml found above ${target.targetFilePath}`);
        const entryFilePath = path.join(root, '.dart_tool', 'live_test_view', 'preview_entry.dart');
        this.activeEntry = {
            targetFilePath: target.targetFilePath,
            entryFilePath,
            symbolName: target.symbolName,
            kind: target.kind,
            // no stamp on initial launch — content is deterministic and readable
        };
        fs.mkdirSync(path.dirname(entryFilePath), { recursive: true });
        fs.writeFileSync(entryFilePath, (0, previewEntry_1.generatePreviewEntry)(this.activeEntry));
        const relEntry = path.relative(root, entryFilePath);
        const child = cp.spawn('flutter', ['run', '-d', 'flutter-tester', '--machine', '-t', relEntry], {
            cwd: root,
            // flutter is flutter.bat on Windows; spawn needs a shell there.
            shell: process.platform === 'win32',
        });
        this.child = child;
        this.appId = undefined;
        readline.createInterface({ input: child.stdout }).on('line', (line) => {
            const daemonEvents = (0, previewProtocol_1.parseDaemonLine)(line);
            if (daemonEvents.length > 0) {
                for (const event of daemonEvents) {
                    if (event.event === 'app.start')
                        this.appId = event.params.appId;
                    onDaemonEvent(event);
                }
                return;
            }
            onFrame((0, protocol_1.parseLine)(line));
        });
        readline
            .createInterface({ input: child.stderr })
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
    reload() {
        if (!this.child || !this.appId || !this.activeEntry)
            return;
        fs.writeFileSync(this.activeEntry.entryFilePath, (0, previewEntry_1.generatePreviewEntry)({ ...this.activeEntry, stamp: new Date().toISOString() }));
        const cmd = (0, previewProtocol_1.encodeRestartCommand)(++this.restartId, this.appId, false);
        this.child.stdin.write(cmd + '\n');
    }
    kill() {
        this.child?.kill();
        this.child = undefined;
        this.appId = undefined;
        this.activeEntry = undefined;
    }
}
exports.PreviewRun = PreviewRun;
//# sourceMappingURL=previewRunner.js.map