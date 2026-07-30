"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// extension/src/extension.ts
const vscode = require("vscode");
const codelens_1 = require("./codelens");
const previewCodelens_1 = require("./previewCodelens");
const panel_1 = require("./panel");
const previewPanel_1 = require("./previewPanel");
const runner_1 = require("./runner");
const previewRunner_1 = require("./previewRunner");
const run = new runner_1.TestRun();
const previewRun = new previewRunner_1.PreviewRun();
let output;
let previewSaveListener;
function activate(context) {
    output = vscode.window.createOutputChannel('Live Test View');
    context.subscriptions.push(output, vscode.languages.registerCodeLensProvider({ language: 'dart', pattern: '**/*_test.dart' }, new codelens_1.LiveTestCodeLensProvider()), vscode.languages.registerCodeLensProvider({ language: 'dart', pattern: '**/*.dart' }, new previewCodelens_1.LivePreviewCodeLensProvider()), vscode.commands.registerCommand('liveTestView.runTest', (filePath, testName) => runLiveTest(context.extensionUri, filePath, testName)), vscode.commands.registerCommand('livePreview.show', (filePath, symbolName, kind) => showLivePreview(context.extensionUri, filePath, symbolName, kind)));
}
function deactivate() {
    run.kill();
    previewRun.kill();
    previewSaveListener?.dispose();
}
function runLiveTest(extensionUri, filePath, testName) {
    const panel = panel_1.LiveViewPanel.show(extensionUri, () => run.kill());
    panel.onSetupRequested(() => runSetup(filePath));
    panel.post({ type: 'reset', testLabel: testName });
    let frameCount = 0;
    let sawRealTest = false;
    let failure;
    try {
        run.start(filePath, testName, (line) => {
            switch (line.kind) {
                case 'ltv':
                    if (line.event.type === 'frame') {
                        frameCount++;
                        panel.post({
                            type: 'frame',
                            seq: line.event.seq,
                            testTimeMs: line.event.testTimeMs,
                            png: line.event.png,
                        });
                    }
                    else {
                        output.appendLine(`[live_test_view] ${line.event.message}`);
                    }
                    break;
                case 'machine': {
                    const e = line.event;
                    if (e.type === 'testStart' && !e.test.name.startsWith('loading ')) {
                        sawRealTest = true;
                        panel.post({ type: 'testName', name: e.test.name });
                    }
                    else if (e.type === 'error') {
                        failure = { error: e.error, stack: e.stackTrace };
                    }
                    break;
                }
                case 'other':
                    output.appendLine(line.text);
                    break;
            }
        }, (code) => {
            if (code === 0 && sawRealTest && frameCount === 0) {
                panel.post({ type: 'setupNeeded' });
                return;
            }
            panel.post({
                type: 'status',
                state: code === 0 ? 'passed' : 'failed',
                error: failure?.error,
                stack: failure?.stack,
            });
        });
    }
    catch (err) {
        void vscode.window.showErrorMessage(`Live Test View: ${String(err)}`);
    }
}
function runSetup(testFilePath) {
    const terminal = vscode.window.createTerminal('Live Test View setup');
    terminal.show();
    terminal.sendText('flutter pub add --dev live_test_view && dart run live_test_view:install');
}
function showLivePreview(extensionUri, filePath, symbolName, kind) {
    previewSaveListener?.dispose();
    const panel = previewPanel_1.PreviewPanel.show(extensionUri, () => {
        previewRun.kill();
        previewSaveListener?.dispose();
    });
    panel.post({ type: 'reset', label: symbolName });
    panel.post({ type: 'status', state: 'booting' });
    try {
        previewRun.start({ targetFilePath: filePath, symbolName, kind }, (line) => {
            if (line.kind === 'ltv' && line.event.type === 'frame') {
                panel.post({ type: 'frame', seq: line.event.seq, png: line.event.png });
                panel.post({ type: 'status', state: 'ready' });
            }
            else if (line.kind === 'other') {
                output.appendLine(line.text);
            }
        }, (event) => {
            if (event.event === 'app.stop' && event.params.error) {
                panel.post({ type: 'status', state: 'error', message: event.params.error });
            }
        }, (code) => {
            if (code !== null && code !== 0) {
                panel.post({
                    type: 'status',
                    state: 'error',
                    message: `flutter run exited with code ${code}`,
                });
            }
        });
    }
    catch (err) {
        void vscode.window.showErrorMessage(`Live Preview: ${String(err)}`);
        return;
    }
    previewSaveListener = vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.uri.fsPath.endsWith('.dart')) {
            panel.post({ type: 'status', state: 'reloading' });
            previewRun.reload();
        }
    });
}
//# sourceMappingURL=extension.js.map