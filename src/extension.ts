import * as fs from 'node:fs'
import * as path from 'node:path'
import * as vscode from 'vscode'
import stripComments from 'strip-comments'
import * as jschardet from 'jschardet'
import * as iconv from 'iconv-lite'

let filesCollection: string[] = []

async function copyContent(files: string[], withoutComments: boolean = false): Promise<string> {
  let content = ''
  for (const file of files) {
    const stats = await fs.promises.stat(file)

    if (stats.isFile()) {
      const buffer = await fs.promises.readFile(file)
      const detected = jschardet.detect(buffer)
      let fileContent
      if (detected.encoding !== 'utf-8' && detected.encoding !== 'ascii' && detected.confidence > 0.5)
        fileContent = iconv.decode(buffer, detected.encoding)
      else fileContent = buffer.toString('utf-8')
      if (withoutComments) {
        fileContent = stripComments(fileContent)
          .replace(/\n\s*\n+/g, '\n\n')
      }
      content += `// ${vscode.workspace.asRelativePath(file)}\n`
      content += `${fileContent}\n`
    }
  }
  return content
}

export function activate(context: vscode.ExtensionContext) {
  const copyFolderContent = async (folder: vscode.Uri, prompt: string, withoutComments: boolean) => {
    try {
      const files = (await fs.promises.readdir(folder.fsPath)).map(fileName => path.join(folder.fsPath, fileName))
      const content = `${prompt}\n${await copyContent(files, withoutComments)}\n${prompt}`

      await vscode.env.clipboard.writeText(content)
      vscode.window.showInformationMessage(`Folder content copied to clipboard${prompt ? ' with prompt' : ''}!`)
    }
    catch (err) {
      vscode.window.showErrorMessage('Could not read folder')
    }
  }

  const addToCollection = async (file: vscode.Uri) => {
    try {
      filesCollection.push(file.fsPath)
    }
    catch (err) {
      vscode.window.showErrorMessage('Could not read file')
    }
  }

  const addToCollectionAndCopy = async (file: vscode.Uri) => {
    await addToCollection(file)
    const content = await copyContent(filesCollection)
    await vscode.env.clipboard.writeText(content)
    vscode.window.showInformationMessage(`File added to collection and copied to clipboard!`)
  }

  const newCollectionAndAdd = async (file: vscode.Uri) => {
    filesCollection = []
    await addToCollection(file)
    vscode.window.showInformationMessage(`New collection started with file!`)
  }

  const copyCollectionAndClear = async () => {
    const content = await copyContent(filesCollection)
    await vscode.env.clipboard.writeText(content)
    filesCollection = [] // Clear the collection
    vscode.window.showInformationMessage(`Collection copied to clipboard and cleared!`)
  }

  const disposable = vscode.commands.registerCommand('extension.copyFolderContent', folder => copyFolderContent(folder, '', false))
  const disposableWithPrompt = vscode.commands.registerCommand('extension.copyFolderContentWithPrompt', async (folder) => {
    const prompt = await vscode.window.showInputBox({ prompt: 'Enter the prompt' }) || ''
    return copyFolderContent(folder, prompt, false)
  })
  const disposableWithoutComments = vscode.commands.registerCommand('extension.copyFolderContentWithoutComments', folder => copyFolderContent(folder, '', true))
  const disposableAddToCollection = vscode.commands.registerCommand('extension.addToCollection', async (file) => {
    await addToCollection(file)
    vscode.window.showInformationMessage(`File added to collection!`)
  })
  const disposableAddToCollectionAndCopy = vscode.commands.registerCommand('extension.addToCollectionAndCopy', addToCollectionAndCopy)
  const disposableNewCollectionAndAdd = vscode.commands.registerCommand('extension.newCollectionAndAdd', newCollectionAndAdd)
  const disposableCopyCollectionAndClear = vscode.commands.registerCommand('extension.copyCollectionAndClear', copyCollectionAndClear)

  context.subscriptions.push(disposable)
  context.subscriptions.push(disposableWithPrompt)
  context.subscriptions.push(disposableWithoutComments)
  context.subscriptions.push(disposableAddToCollection)
  context.subscriptions.push(disposableAddToCollectionAndCopy)
  context.subscriptions.push(disposableNewCollectionAndAdd)
  context.subscriptions.push(disposableCopyCollectionAndClear)
}

export function deactivate() { }
