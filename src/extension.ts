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
      content += `------ ${vscode.workspace.asRelativePath(file)} ------\n\`\`\`\n`

      content += `${fileContent}\n\`\`\`\n`
    }
  }
  return content
}

async function countFiles(folderPath: string): Promise<number> {
  let count = 0
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(folderPath, entry.name)
    if (entry.isDirectory())
      count += await countFiles(entryPath) // Recurse into subdirectories
    else
      count++
  }
  return count
}

async function copyFolderRecursive(folderPath: string, withoutComments: boolean = false) {
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(folderPath, entry.name)
    if (entry.isDirectory())
      await copyFolderRecursive(entryPath, withoutComments)
    else
      filesCollection.push(entryPath)
  }
}

async function copyFolderContentRecursively(folder: vscode.Uri, withoutComments: boolean) {
  try {
    const fileCount = await countFiles(folder.fsPath)
    if (fileCount > 1000) {
      const shouldContinue = await vscode.window.showWarningMessage(
        `The folder contains more than 1000 files (${fileCount} files). Do you want to continue?`,
        'Yes',
        'No',
      )
      if (shouldContinue !== 'Yes')
        return
    }
    filesCollection = []
    await copyFolderRecursive(folder.fsPath, withoutComments)
    const content = await copyContent(filesCollection, withoutComments)
    await vscode.env.clipboard.writeText(content)
    vscode.window.showInformationMessage(`Recursive folder content copied to clipboard${withoutComments ? ' without comments' : ''}!`)
  }
  catch (err) {
    vscode.window.showErrorMessage('Could not read folder recursively')
  }
}

async function copyFolderContentRecursivelyByType(folder: vscode.Uri) {
  try {
    const fileExtensions = new Set<string>()

    async function collectFileExtensions(folderPath: string) {
      const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await collectFileExtensions(path.join(folderPath, entry.name))
        }
        else {
          const extension = path.extname(entry.name)
          if (extension)
            fileExtensions.add(extension)
        }
      }
    }

    await collectFileExtensions(folder.fsPath)
    const selectedExtensions = await vscode.window.showQuickPick(Array.from(fileExtensions), {
      placeHolder: 'Select file extensions',
      canPickMany: true,
    })

    if (!selectedExtensions || selectedExtensions.length === 0)
      return

    filesCollection = []

    async function copyFiles(folderPath: string) {
      const entries = await fs.promises.readdir(folderPath, { withFileTypes: true })
      for (const entry of entries) {
        const entryPath = path.join(folderPath, entry.name)
        if (entry.isDirectory())
          await copyFiles(entryPath)
        else if (selectedExtensions && selectedExtensions.some(ext => entry.name.endsWith(ext)))
          filesCollection.push(entryPath)
      }
    }

    await copyFiles(folder.fsPath)

    const content = await copyContent(filesCollection)
    await vscode.env.clipboard.writeText(content)
    vscode.window.showInformationMessage(`Folder content with file extensions ${selectedExtensions.join(', ')} copied to clipboard!`)
  }
  catch (err) {
    vscode.window.showErrorMessage('Could not read folder recursively')
  }
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

  const disposableRecursiveCopy = vscode.commands.registerCommand('extension.copyFolderContentRecursively', folder => copyFolderContentRecursively(folder, false))
  context.subscriptions.push(disposableRecursiveCopy)

  const disposableCopyFolderContentByType = vscode.commands.registerCommand('extension.copyFolderContentRecursivelyByType', copyFolderContentRecursivelyByType)
  context.subscriptions.push(disposableCopyFolderContentByType)
}

export function deactivate() { }
