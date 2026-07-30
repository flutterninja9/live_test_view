"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LivePreviewCodeLensProvider = void 0;
// extension/src/previewCodelens.ts
const vscode = require("vscode");
const previewScan_1 = require("./previewScan");
class LivePreviewCodeLensProvider {
    provideCodeLenses(document) {
        return (0, previewScan_1.findPreviewSites)(document.getText()).map((site) => new vscode.CodeLens(new vscode.Range(site.line, 0, site.line, 0), {
            command: 'livePreview.show',
            title: '▶ Preview',
            arguments: [document.uri.fsPath, site.name, site.kind],
        }));
    }
}
exports.LivePreviewCodeLensProvider = LivePreviewCodeLensProvider;
//# sourceMappingURL=previewCodelens.js.map