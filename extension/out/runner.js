"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestRun = void 0;
exports.findProjectRoot = findProjectRoot;
const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const protocol_1 = require("./protocol");
function findProjectRoot(testFilePath) {
    let dir = path.dirname(testFilePath);
    for (;;) {
        if (fs.existsSync(path.join(dir, 'pubspec.yaml')))
            return dir;
        const parent = path.dirname(dir);
        if (parent === dir)
            return undefined;
        dir = parent;
    }
}
/** Owns at most one live `flutter test` child process. */
class TestRun {
    child;
    start(testFilePath, testName, onLine, onExit) {
        this.kill();
        const root = findProjectRoot(testFilePath);
        if (!root)
            throw new Error(`No pubspec.yaml found above ${testFilePath}`);
        const rel = path.relative(root, testFilePath);
        const child = cp.spawn('flutter', ['test', rel, '--plain-name', testName, '--machine'], {
            cwd: root,
            env: { ...process.env, LIVE_TEST_VIEW: '1' },
            // flutter is flutter.bat on Windows; spawn needs a shell there.
            shell: process.platform === 'win32',
        });
        this.child = child;
        readline
            .createInterface({ input: child.stdout })
            .on('line', (l) => onLine((0, protocol_1.parseLine)(l)));
        readline
            .createInterface({ input: child.stderr })
            .on('line', (l) => onLine({ kind: 'other', text: l }));
        child.on('exit', (code) => {
            if (this.child === child)
                this.child = undefined;
            onExit(code);
        });
    }
    kill() {
        this.child?.kill();
        this.child = undefined;
    }
}
exports.TestRun = TestRun;
//# sourceMappingURL=runner.js.map