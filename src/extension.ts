import { Buffer } from 'node:buffer'
import * as iconv from 'iconv-lite'
import * as jschardet from 'jschardet'
import stripComments from 'strip-comments'
import * as vscode from 'vscode'

let filesCollection: vscode.Uri[] = []

async function copyContent(files: vscode.Uri[], withoutComments: boolean = false): Promise<string> {
  let content = ''
  for (const file of files) {
    const stat = await vscode.workspace.fs.stat(file)

    if (stat.type === vscode.FileType.File) {
      const data = await vscode.workspace.fs.readFile(file)
      const buffer = Buffer.from(data)
      const detected = jschardet.detect(buffer)
      let fileContent
      if (detected.encoding !== 'utf-8' && detected.encoding !== 'ascii' && detected.confidence > 0.5)
        fileContent = iconv.decode(buffer, detected.encoding)
      else fileContent = buffer.toString('utf-8')
      if (withoutComments) {
        fileContent = stripComments(fileContent)
          .replace(/\n\s*\n/g, '\n\n')
      }
      content += `------ ${vscode.workspace.asRelativePath(file)} ------\n\`\`\`\`\`\`\n`

      content += `${fileContent}\n\`\`\`\`\`\`\n`
    }
  }
  return content
}

async function countFiles(folderUri: vscode.Uri): Promise<number> {
  let count = 0
  const entries = await vscode.workspace.fs.readDirectory(folderUri)
  for (const [name, type] of entries) {
    const entryUri = vscode.Uri.joinPath(folderUri, name)
    if (type === vscode.FileType.Directory)
      count += await countFiles(entryUri) // Recurse into subdirectories
    else if (type === vscode.FileType.File)
      count++
  }
  return count
}

async function copyFolderRecursive(folderUri: vscode.Uri, withoutComments: boolean = false) {
  const entries = await vscode.workspace.fs.readDirectory(folderUri)
  for (const [name, type] of entries) {
    const entryUri = vscode.Uri.joinPath(folderUri, name)
    if (type === vscode.FileType.Directory)
      await copyFolderRecursive(entryUri, withoutComments)
    else if (type === vscode.FileType.File)
      filesCollection.push(entryUri)
  }
}

async function copyFolderContentRecursively(folder: vscode.Uri, withoutComments: boolean) {
  try {
    const fileCount = await countFiles(folder)
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
    await copyFolderRecursive(folder, withoutComments)
    const content = await copyContent(filesCollection, withoutComments)
    await vscode.env.clipboard.writeText(content)
    vscode.window.setStatusBarMessage(`Recursive folder content copied to clipboard${withoutComments ? ' without comments' : ''}!`, 5000)
  }
  catch {
    vscode.window.showErrorMessage('Could not read folder recursively')
  }
}

async function copyFolderContentRecursivelyByType(folder: vscode.Uri) {
  try {
    const fileExtensions = new Set<string>()

    async function collectFileExtensions(folderUri: vscode.Uri) {
      const entries = await vscode.workspace.fs.readDirectory(folderUri)
      for (const [name, type] of entries) {
        const entryUri = vscode.Uri.joinPath(folderUri, name)
        if (type === vscode.FileType.Directory) {
          await collectFileExtensions(entryUri)
        }
        else if (type === vscode.FileType.File) {
          const extension = name.includes('.') ? `.${name.split('.').pop()}` : ''
          if (extension)
            fileExtensions.add(extension)
        }
      }
    }

    await collectFileExtensions(folder)
    const selectedExtensions = await vscode.window.showQuickPick(Array.from(fileExtensions), {
      placeHolder: 'Select file extensions',
      canPickMany: true,
    })

    if (!selectedExtensions || selectedExtensions.length === 0)
      return

    filesCollection = []

    async function copyFiles(folderUri: vscode.Uri) {
      const entries = await vscode.workspace.fs.readDirectory(folderUri)
      for (const [name, type] of entries) {
        const entryUri = vscode.Uri.joinPath(folderUri, name)
        if (type === vscode.FileType.Directory)
          await copyFiles(entryUri)
        else if (type === vscode.FileType.File && selectedExtensions && selectedExtensions.some(ext => name.endsWith(ext)))
          filesCollection.push(entryUri)
      }
    }

    await copyFiles(folder)

    const content = await copyContent(filesCollection)
    await vscode.env.clipboard.writeText(content)
    vscode.window.setStatusBarMessage(`Folder content with file extensions ${selectedExtensions.join(', ')} copied to clipboard!`, 5000)
  }
  catch {
    vscode.window.showErrorMessage('Could not read folder recursively')
  }
}

async function copySelected(selectedItems: vscode.Uri[]) {
  try {
    const tempCollection: vscode.Uri[] = []

    for (const item of selectedItems) {
      const stat = await vscode.workspace.fs.stat(item)

      if (stat.type === vscode.FileType.File) {
        tempCollection.push(item)
      }
      else if (stat.type === vscode.FileType.Directory) {
        // Only get direct children (non-recursive)
        const entries = await vscode.workspace.fs.readDirectory(item)
        for (const [name, type] of entries) {
          if (type === vscode.FileType.File) {
            tempCollection.push(vscode.Uri.joinPath(item, name))
          }
        }
      }
    }

    if (tempCollection.length > 0) {
      const content = await copyContent(tempCollection)
      await vscode.env.clipboard.writeText(content)
      vscode.window.setStatusBarMessage(
        `Selected content copied to clipboard!`,
        5000,
      )
    }
  }
  catch (err) {
    vscode.window.showErrorMessage(
      `Error copying selected items: ${err instanceof Error ? err.message : 'Unknown error'}`,
    )
  }
}

export function activate(context: vscode.ExtensionContext) {
  const copyFolderContent = async (folder: vscode.Uri, prompt: string, withoutComments: boolean) => {
    try {
      const entries = await vscode.workspace.fs.readDirectory(folder)
      const files: vscode.Uri[] = []

      for (const [name, type] of entries) {
        if (type === vscode.FileType.File) {
          files.push(vscode.Uri.joinPath(folder, name))
        }
      }

      const content = `${prompt}\n${await copyContent(files, withoutComments)}\n${prompt}`

      await vscode.env.clipboard.writeText(content)
      vscode.window.setStatusBarMessage(`Folder content copied to clipboard${prompt ? ' with prompt' : ''}!`, 5000)
    }
    catch {
      vscode.window.showErrorMessage('Could not read folder')
    }
  }

  const addToCollection = async (file: vscode.Uri) => {
    try {
      filesCollection.push(file)
    }
    catch {
      vscode.window.showErrorMessage('Could not read file')
    }
  }

  const addToCollectionAndCopy = async (file: vscode.Uri) => {
    await addToCollection(file)
    const content = await copyContent(filesCollection)
    await vscode.env.clipboard.writeText(content)
    vscode.window.setStatusBarMessage(`File added to collection and copied to clipboard!`, 5000)
  }

  const newCollectionAndAdd = async (file: vscode.Uri) => {
    filesCollection = []
    await addToCollection(file)
    vscode.window.setStatusBarMessage(`New collection started with file!`, 5000)
  }

  const copyCollectionAndClear = async () => {
    const content = await copyContent(filesCollection)
    await vscode.env.clipboard.writeText(content)
    filesCollection = [] // Clear the collection
    vscode.window.setStatusBarMessage(`Collection copied to clipboard and cleared!`, 5000)
  }

  const disposable = vscode.commands.registerCommand('extension.copyFolderContent', folder => copyFolderContent(folder, '', false))
  const disposableWithPrompt = vscode.commands.registerCommand('extension.copyFolderContentWithPrompt', async (folder) => {
    const prompt = await vscode.window.showInputBox({ prompt: 'Enter the prompt' }) || ''
    return copyFolderContent(folder, prompt, false)
  })
  const disposableWithoutComments = vscode.commands.registerCommand('extension.copyFolderContentWithoutComments', folder => copyFolderContent(folder, '', true))
  const disposableAddToCollection = vscode.commands.registerCommand('extension.addToCollection', async (file) => {
    await addToCollection(file)
    vscode.window.setStatusBarMessage(`File added to collection!`, 5000)
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

  const disposableSelectedCopy = vscode.commands.registerCommand(
    'extension.copySelectedFilesAndFolders',
    async (uri: vscode.Uri, uris: vscode.Uri[]) => {
      const selectedItems = uris?.length ? uris : (uri ? [uri] : [])
      if (!selectedItems.length) {
        vscode.window.showInformationMessage('No file or folder selected.')
        return
      }
      await copySelected(selectedItems)
    },
  )
  context.subscriptions.push(disposableSelectedCopy)
}

export function deactivate() { }
