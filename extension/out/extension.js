"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const codelens_1 = require("./codelens");
const panel_1 = require("./panel");
const runner_1 = require("./runner");
const run = new runner_1.TestRun();
let output;
function activate(context) {
    output = vscode.window.createOutputChannel('Live Test View');
    context.subscriptions.push(output, vscode.languages.registerCodeLensProvider({ language: 'dart', pattern: '**/*_test.dart' }, new codelens_1.LiveTestCodeLensProvider()), vscode.commands.registerCommand('liveTestView.runTest', (filePath, testName) => runLiveTest(context.extensionUri, filePath, testName)));
}
function deactivate() {
    run.kill();
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
//# sourceMappingURL=extension.js.map