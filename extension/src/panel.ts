import * as vscode from 'vscode';

export type PanelMessage =
  | { type: 'reset'; testLabel: string }
  | { type: 'frame'; seq: number; testTimeMs: number; png: string }
  | { type: 'status'; state: 'passed' | 'failed'; error?: string; stack?: string }
  | { type: 'testName'; name: string }
  | { type: 'setupNeeded' };

export class LiveViewPanel {
  private static current: LiveViewPanel | undefined;
  private setupHandler: (() => void) | undefined;

  private constructor(private readonly panel: vscode.WebviewPanel) {}

  static show(extensionUri: vscode.Uri, onDispose: () => void): LiveViewPanel {
    if (LiveViewPanel.current) {
      LiveViewPanel.current.panel.reveal(undefined, true);
      return LiveViewPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      'liveTestView',
      'Live Test View',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );
    const instance = new LiveViewPanel(panel);
    panel.webview.html = render(panel.webview, extensionUri);
    panel.webview.onDidReceiveMessage((msg) => {
      if (msg?.type === 'setup') instance.setupHandler?.();
    });
    panel.onDidDispose(() => {
      LiveViewPanel.current = undefined;
      onDispose();
    });
    LiveViewPanel.current = instance;
    return instance;
  }

  post(msg: PanelMessage): void {
    void this.panel.webview.postMessage(msg);
  }

  onSetupRequested(handler: () => void): void {
    this.setupHandler = handler;
  }
}

function render(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const js = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'panel.js'),
  );
  const css = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'panel.css'),
  );
  const nonce = Math.random().toString(36).slice(2);
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${css}">
</head>
<body>
  <div id="status-bar">
    <span id="test-label">No test running</span>
    <span id="state"></span>
  </div>
  <div id="frame-area"><img id="frame" alt=""></div>
  <div id="timeline">
    <button id="replay-btn" disabled title="Replay the paced recording from the start">&#8635; Replay</button>
    <input id="slider" type="range" min="0" max="0" value="0" disabled>
    <span id="frame-info"></span>
  </div>
  <details id="error-box" hidden><summary>Failure details</summary><pre id="error-text"></pre></details>
  <div id="setup-box" hidden>
    <p>No frames received — the <code>live_test_view</code> package doesn't seem to be set up in this project.</p>
    <button id="setup-btn">Set up Live Test View</button>
  </div>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
}
