"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LiveTestCodeLensProvider = void 0;
const vscode = require("vscode");
const scan_1 = require("./scan");
class LiveTestCodeLensProvider {
    provideCodeLenses(document) {
        return (0, scan_1.findTestSites)(document.getText()).map((site) => new vscode.CodeLens(new vscode.Range(site.line, 0, site.line, 0), {
            command: 'liveTestView.runTest',
            title: '▶ Live View',
            arguments: [document.uri.fsPath, site.name],
        }));
    }
}
exports.LiveTestCodeLensProvider = LiveTestCodeLensProvider;
//# sourceMappingURL=codelens.js.map