// extension/src/previewCodelens.ts
import * as vscode from 'vscode';
import { findPreviewSites } from './previewScan';

export class LivePreviewCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return findPreviewSites(document.getText()).map(
      (site) =>
        new vscode.CodeLens(new vscode.Range(site.line, 0, site.line, 0), {
          command: 'livePreview.show',
          title: '▶ Preview',
          arguments: [document.uri.fsPath, site.name, site.kind],
        }),
    );
  }
}
