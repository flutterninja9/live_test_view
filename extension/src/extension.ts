import * as vscode from 'vscode';
import { LiveTestCodeLensProvider } from './codelens';
import { LiveViewPanel } from './panel';
import { TestRun } from './runner';

const run = new TestRun();
let output: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('Live Test View');
  context.subscriptions.push(
    output,
    vscode.languages.registerCodeLensProvider(
      { language: 'dart', pattern: '**/*_test.dart' },
      new LiveTestCodeLensProvider(),
    ),
    vscode.commands.registerCommand(
      'liveTestView.runTest',
      (filePath: string, testName: string) =>
        runLiveTest(context.extensionUri, filePath, testName),
    ),
  );
}

export function deactivate(): void {
  run.kill();
}

function runLiveTest(
  extensionUri: vscode.Uri,
  filePath: string,
  testName: string,
): void {
  const panel = LiveViewPanel.show(extensionUri, () => run.kill());
  panel.onSetupRequested(() => runSetup(filePath));
  panel.post({ type: 'reset', testLabel: testName });

  let frameCount = 0;
  let sawRealTest = false;
  let failure: { error: string; stack: string } | undefined;

  try {
    run.start(
      filePath,
      testName,
      (line) => {
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
            } else {
              output.appendLine(`[live_test_view] ${line.event.message}`);
            }
            break;
          case 'machine': {
            const e = line.event;
            if (e.type === 'testStart' && !e.test.name.startsWith('loading ')) {
              sawRealTest = true;
              panel.post({ type: 'testName', name: e.test.name });
            } else if (e.type === 'error') {
              failure = { error: e.error, stack: e.stackTrace };
            }
            break;
          }
          case 'other':
            output.appendLine(line.text);
            break;
        }
      },
      (code) => {
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
      },
    );
  } catch (err) {
    void vscode.window.showErrorMessage(`Live Test View: ${String(err)}`);
  }
}

function runSetup(testFilePath: string): void {
  const terminal = vscode.window.createTerminal('Live Test View setup');
  terminal.show();
  terminal.sendText(
    'flutter pub add --dev live_test_view && dart run live_test_view:install',
  );
}
