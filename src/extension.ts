import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
const stripComments = require('strip-comments');

async function copyContent(files: string[], withoutComments: boolean = false): Promise<string> {
    let content = '';
    for (const file of files) {
        const stats = await fs.promises.stat(file);

        if (stats.isFile()) {
            let fileContent = await fs.promises.readFile(file, 'utf-8');

            if (withoutComments) {
                fileContent = stripComments(fileContent)
                    .replace(/\n\s*\n+/g, '\n\n');
            }

            content += '// ' + path.basename(file) + '\n';
            content += fileContent + '\n';
        }
    }
    return content;
}

export function activate(context: vscode.ExtensionContext) {
    const copyFolderContent = async (folder: vscode.Uri, includeSuffix: boolean, withoutComments: boolean) => {
        try {
            const files = (await fs.promises.readdir(folder.fsPath)).map(fileName => path.join(folder.fsPath, fileName));
            let content = await copyContent(files, withoutComments);

            if (includeSuffix) {
                content += vscode.workspace.getConfiguration('copy-folder-content').get('suffix');
            }

            await vscode.env.clipboard.writeText(content);
            vscode.window.showInformationMessage(`Folder content copied to clipboard${includeSuffix ? ' with suffix' : ''}!`);
        } catch (err) {
            vscode.window.showErrorMessage('Could not read folder');
        }
    };

    const disposable = vscode.commands.registerCommand('extension.copyFolderContent', folder => copyFolderContent(folder, false, false));
    const disposableWithSuffix = vscode.commands.registerCommand('extension.copyFolderContentWithSuffix', folder => copyFolderContent(folder, true, false));
    const disposableWithoutComments = vscode.commands.registerCommand('extension.copyFolderContentWithoutComments', folder => copyFolderContent(folder, false, true));

    context.subscriptions.push(disposable);
    context.subscriptions.push(disposableWithSuffix);
    context.subscriptions.push(disposableWithoutComments);
}

export function deactivate() { }
