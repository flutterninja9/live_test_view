// extension/src/extension.ts
import * as vscode from 'vscode';
import { LiveTestCodeLensProvider } from './codelens';
import { LivePreviewCodeLensProvider } from './previewCodelens';
import { LiveViewPanel, SetupReason } from './panel';
import { PreviewPanel } from './previewPanel';
import { TestRun } from './runner';
import { PreviewRun, PreviewSpawnTarget } from './previewRunner';
import { inspectSetup } from './setupStatus';

const run = new TestRun();
const previewRun = new PreviewRun();
let output: vscode.OutputChannel;
let previewSaveListener: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('Live Test View');
  context.subscriptions.push(
    output,
    vscode.languages.registerCodeLensProvider(
      { language: 'dart', pattern: '**/*_test.dart' },
      new LiveTestCodeLensProvider(),
    ),
    vscode.languages.registerCodeLensProvider(
      { language: 'dart', pattern: '**/*.dart' },
      new LivePreviewCodeLensProvider(),
    ),
    vscode.commands.registerCommand(
      'liveTestView.runTest',
      (filePath: string, testName: string) =>
        runLiveTest(context.extensionUri, filePath, testName),
    ),
    vscode.commands.registerCommand(
      'livePreview.show',
      (filePath: string, symbolName: string, kind: PreviewSpawnTarget['kind']) =>
        showLivePreview(context.extensionUri, filePath, symbolName, kind),
    ),
  );
}

export function deactivate(): void {
  run.kill();
  previewRun.kill();
  previewSaveListener?.dispose();
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
          panel.post({ type: 'setupNeeded', reason: setupReasonFor(filePath) });
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

function setupReasonFor(testFilePath: string): SetupReason {
  switch (inspectSetup(testFilePath).kind) {
    case 'missingPackage':
      return 'missingPackage';
    case 'missingConfig':
      return 'missingConfig';
    case 'configNotWired':
      return 'configNotWired';
    case 'ready':
      return 'noFramesCaptured';
  }
}

function runSetup(testFilePath: string): void {
  const terminal = vscode.window.createTerminal('Live Test View setup');
  terminal.show();
  terminal.sendText(
    'flutter pub add --dev live_test_view && dart run live_test_view:install',
  );
}

function showLivePreview(
  extensionUri: vscode.Uri,
  filePath: string,
  symbolName: string,
  kind: PreviewSpawnTarget['kind'],
): void {
  previewSaveListener?.dispose();
  const panel = PreviewPanel.show(extensionUri, () => {
    previewRun.kill();
    previewSaveListener?.dispose();
  });
  panel.post({ type: 'reset', label: symbolName });
  panel.post({ type: 'status', state: 'booting' });

  try {
    previewRun.start(
      { targetFilePath: filePath, symbolName, kind },
      (line) => {
        if (line.kind === 'ltv' && line.event.type === 'frame') {
          panel.post({ type: 'frame', seq: line.event.seq, png: line.event.png });
          panel.post({ type: 'status', state: 'ready' });
        } else if (line.kind === 'other') {
          output.appendLine(line.text);
        }
      },
      (event) => {
        if (event.event === 'app.stop' && event.params.error) {
          panel.post({ type: 'status', state: 'error', message: event.params.error });
        }
      },
      (code) => {
        if (code !== null && code !== 0) {
          panel.post({
            type: 'status',
            state: 'error',
            message: `flutter run exited with code ${code}`,
          });
        }
      },
    );
  } catch (err) {
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
