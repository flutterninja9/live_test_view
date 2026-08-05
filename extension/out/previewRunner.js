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
    /** Path of the generated entrypoint to delete when the run ends. */
    activeEntryPath;
    start(target, onFrame, onDaemonEvent, onExit) {
        this.kill();
        const root = (0, runner_1.findProjectRoot)(target.targetFilePath);
        if (!root)
            throw new Error(`No pubspec.yaml found above ${target.targetFilePath}`);
        const entryFilePath = (0, previewEntry_1.previewEntryPathFor)(root);
        const entry = {
            targetFilePath: target.targetFilePath,
            entryFilePath,
            symbolName: target.symbolName,
            kind: target.kind,
        };
        fs.mkdirSync(path.dirname(entryFilePath), { recursive: true });
        fs.writeFileSync(entryFilePath, (0, previewEntry_1.generatePreviewEntry)(entry));
        this.activeEntryPath = entryFilePath;
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
     * Nothing needs to be touched on disk first: flutter_tools stats every
     * source of the previous compile and invalidates the ones whose mtime is
     * newer, so the user's just-saved file is picked up on its own. (An earlier
     * version rewrote the entrypoint with a fresh timestamp to "force" a
     * recompile. That was a workaround for a misdiagnosis — the entrypoint's
     * location, not its mtime, was what kept the target from reloading; see
     * `previewEntryPathFor`. All it actually did was reload the entrypoint
     * library itself.)
     */
    reload() {
        if (!this.child || !this.appId)
            return;
        const cmd = (0, previewProtocol_1.encodeRestartCommand)(++this.restartId, this.appId, false);
        this.child.stdin.write(cmd + '\n');
    }
    kill() {
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
exports.PreviewRun = PreviewRun;
//# sourceMappingURL=previewRunner.js.map