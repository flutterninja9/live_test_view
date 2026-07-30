"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiveViewPanel = void 0;
const vscode = require("vscode");
class LiveViewPanel {
    panel;
    static current;
    setupHandler;
    constructor(panel) {
        this.panel = panel;
    }
    static show(extensionUri, onDispose) {
        if (LiveViewPanel.current) {
            LiveViewPanel.current.panel.reveal(undefined, true);
            return LiveViewPanel.current;
        }
        const panel = vscode.window.createWebviewPanel('liveTestView', 'Live Test View', { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        });
        const instance = new LiveViewPanel(panel);
        panel.webview.html = render(panel.webview, extensionUri);
        panel.webview.onDidReceiveMessage((msg) => {
            if (msg?.type === 'setup')
                instance.setupHandler?.();
        });
        panel.onDidDispose(() => {
            LiveViewPanel.current = undefined;
            onDispose();
        });
        LiveViewPanel.current = instance;
        return instance;
    }
    post(msg) {
        void this.panel.webview.postMessage(msg);
    }
    onSetupRequested(handler) {
        this.setupHandler = handler;
    }
}
exports.LiveViewPanel = LiveViewPanel;
function render(webview, extensionUri) {
    const js = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'panel.js'));
    const css = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'panel.css'));
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
    <span id="test-name">No test running</span>
    <div id="toolbar-right">
      <span id="meta"></span>
      <span id="state"></span>
    </div>
  </div>
  <div id="frame-area">
    <img id="frame" alt="" hidden>
    <span id="frame-badge" hidden></span>
    <div id="zoom-controls">
      <button id="zoom-out" title="Zoom out">−</button>
      <button id="zoom-reset" title="Reset zoom">⤢</button>
      <button id="zoom-in" title="Zoom in">＋</button>
    </div>
  </div>
  <div id="timeline">
    <button id="replay-btn" class="ltv-btn" disabled title="Replay the paced recording from the start">&#8635; Replay</button>
    <button id="follow-btn" title="Jump to the latest frame and stay pinned to live playback">⏵ Follow</button>
    <input id="slider" type="range" min="0" max="0" value="0" disabled>
    <span id="frame-info"></span>
  </div>
  <div id="drawer" hidden>
    <div id="drawer-header">
      <span id="drawer-title">✗ Failure details</span>
      <div id="drawer-actions">
        <button id="copy-btn">⧉ Copy</button>
        <button id="maximize-btn">⤢ Maximize</button>
      </div>
    </div>
    <div id="drawer-body">
      <div id="error-message" hidden></div>
      <div id="stack-label" hidden>Stack trace</div>
      <pre id="stack-trace"></pre>
    </div>
  </div>
  <div id="setup-box" hidden>
    <div id="setup-icon">⚙</div>
    <p>No frames received — the <code>live_test_view</code> package doesn't seem to be set up in this project.</p>
    <button id="setup-btn" class="ltv-btn">Set up Live Test View</button>
  </div>
  <script nonce="${nonce}" src="${js}"></script>
</body>
</html>`;
}
//# sourceMappingURL=panel.js.map