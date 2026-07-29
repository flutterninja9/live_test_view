import * as vscode from 'vscode';
import { findTestSites } from './scan';

export class LiveTestCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    return findTestSites(document.getText()).map(
      (site) =>
        new vscode.CodeLens(new vscode.Range(site.line, 0, site.line, 0), {
          command: 'liveTestView.runTest',
          title: '▶ Live View',
          arguments: [document.uri.fsPath, site.name],
        }),
    );
  }
}
