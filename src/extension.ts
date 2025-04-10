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

async function getFilesRecursively(folderUri: vscode.Uri): Promise<vscode.Uri[]> {
  let files: vscode.Uri[] = []
  try {
    const entries = await vscode.workspace.fs.readDirectory(folderUri)
    for (const [name, type] of entries) {
      const entryUri = vscode.Uri.joinPath(folderUri, name)
      if (type === vscode.FileType.Directory) {
        files = files.concat(await getFilesRecursively(entryUri)) // Recurse
      }
      else if (type === vscode.FileType.File) {
        files.push(entryUri)
      }
    }
  }
  catch (err) {
    // Log error or show a warning? For now, just ignore folders we can't read.
    console.error(`Error reading directory ${folderUri.fsPath}: ${err}`)
    // Optionally: vscode.window.showWarningMessage(`Could not read directory: ${folderUri.fsPath}`);
  }
  return files
}

async function copyFolderContentRecursivelyByType(folder: vscode.Uri) {
  try {
    // Use the new helper function
    const allFiles = await getFilesRecursively(folder)

    if (allFiles.length === 0) {
      vscode.window.showInformationMessage('No files found in the folder.')
      return
    }

    const fileExtensions = new Set<string>()
    allFiles.forEach((fileUri) => {
      // Extract filename robustly
      const name = fileUri.path.substring(fileUri.path.lastIndexOf('/') + 1)
      const extension = name.includes('.') ? `.${name.split('.').pop()}` : ''
      if (extension)
        fileExtensions.add(extension)
    })

    if (fileExtensions.size === 0) {
      vscode.window.showInformationMessage('No files with extensions found in the folder.')
      return
    }

    const selectedExtensions = await vscode.window.showQuickPick(Array.from(fileExtensions).sort(), { // Sort extensions
      placeHolder: 'Select file extensions to copy',
      canPickMany: true,
    })

    if (!selectedExtensions || selectedExtensions.length === 0)
      return // User cancelled

    // Filter using the list returned by the helper
    const filesToCopy = allFiles.filter((fileUri) => {
      const name = fileUri.path.substring(fileUri.path.lastIndexOf('/') + 1)
      return selectedExtensions.some(ext => name.endsWith(ext))
    })

    if (filesToCopy.length === 0) {
      // This case should ideally not happen if selectedExtensions is not empty and fileExtensions was derived correctly
      vscode.window.showInformationMessage('No files matching the selected extensions found.')
      return
    }

    // Add file count check
    if (filesToCopy.length > 1000) {
      const shouldContinue = await vscode.window.showWarningMessage(
        `The selection contains more than 1000 files (${filesToCopy.length} files) of the selected types. Do you want to continue?`,
        'Yes',
        'No',
      )
      if (shouldContinue !== 'Yes')
        return // Abort if user says no
    }

    const content = await copyContent(filesToCopy) // Pass the filtered list
    await vscode.env.clipboard.writeText(content)
    vscode.window.setStatusBarMessage(`Folder content with extensions [${selectedExtensions.join(', ')}] copied!`, 5000) // Adjusted message
  }
  catch (err) { // Add error parameter
    vscode.window.showErrorMessage(`Could not read folder recursively by type: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

async function copySelected(selectedItems: vscode.Uri[]) {
  try {
    let tempCollection: vscode.Uri[] = [] // Changed to let

    for (const item of selectedItems) {
      const stat = await vscode.workspace.fs.stat(item)

      if (stat.type === vscode.FileType.File) {
        tempCollection.push(item)
      }
      else if (stat.type === vscode.FileType.Directory) {
        // Use the new recursive helper
        const folderFiles = await getFilesRecursively(item)
        tempCollection = tempCollection.concat(folderFiles) // Concatenate the results
      }
    }

    if (tempCollection.length === 0) {
      vscode.window.showInformationMessage('No files found in the selection to copy.')
      return
    }

    // Add file count check for the total collection
    if (tempCollection.length > 1000) {
      const shouldContinue = await vscode.window.showWarningMessage(
        `The selection contains more than 1000 files (${tempCollection.length} files). Do you want to continue?`,
        'Yes',
        'No',
      )
      if (shouldContinue !== 'Yes')
        return // Abort if user says no
    }

    const content = await copyContent(tempCollection)
    await vscode.env.clipboard.writeText(content)
    vscode.window.setStatusBarMessage(
      `Selected content copied to clipboard! (${tempCollection.length} files)`, // Add count
      5000,
    )
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

  const disposableRecursiveCopy = vscode.commands.registerCommand('extension.copyFolderContentRecursively', async (folder: vscode.Uri) => {
    if (!folder) {
      vscode.window.showErrorMessage('No folder specified for recursive copy.')
      return
    }
    // Call copySelected with the single folder URI
    await copySelected([folder])
  })
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
