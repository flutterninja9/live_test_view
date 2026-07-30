// extension/src/previewPanel.ts
import * as vscode from 'vscode';

export type PreviewPanelMessage =
  | { type: 'reset'; label: string }
  | { type: 'frame'; seq: number; png: string }
  | { type: 'status'; state: 'booting' | 'ready' | 'reloading' | 'error'; message?: string };

export class PreviewPanel {
  private static current: PreviewPanel | undefined;

  private constructor(private readonly panel: vscode.WebviewPanel) {}

  static show(extensionUri: vscode.Uri, onDispose: () => void): PreviewPanel {
    if (PreviewPanel.current) {
      PreviewPanel.current.panel.reveal(undefined, true);
      return PreviewPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      'livePreview',
      'Live Preview',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      },
    );
    const instance = new PreviewPanel(panel);
    panel.webview.html = render(panel.webview, extensionUri);
    panel.onDidDispose(() => {
      PreviewPanel.current = undefined;
      onDispose();
    });
    PreviewPanel.current = instance;
    return instance;
  }

  post(msg: PreviewPanelMessage): void {
    void this.panel.webview.postMessage(msg);
  }
}

function render(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const js = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'previewPanel.js'));
  const css = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'previewPanel.css'));
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
  <div id="toolbar">
    <span id="label">No preview running</span>
    <span id="state"></span>
  </div>
  <div id="frame-area">
    <img id="frame" alt="" hidden>
  </div>
  <div id="error-box" hidden><pre id="error-text"></pre></div>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
}
