import { Buffer } from 'node:buffer'
import * as iconv from 'iconv-lite'
import * as jschardet from 'jschardet'
import stripComments from 'strip-comments'
import * as vscode from 'vscode'

let filesCollection: vscode.Uri[] = []
let lastSelItem: vscode.StatusBarItem | undefined

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

async function finalizeCopy(
  context: vscode.ExtensionContext,
  uris: vscode.Uri[],
  content: string,
  refresh: (n: number) => void,
) {
  await vscode.env.clipboard.writeText(content)

  // Limit stored selection size
  if (uris.length > 5000) {
    vscode.window.showWarningMessage('Selection too large (>5000 files), not storing for "Copy Last Selection".')
    await context.workspaceState.update('lastSelection', []) // Clear potentially large old state
    refresh(0) // Ensure button is hidden
    return // Skip storing
  }

  // Persist URIs as strings
  const uriStrings = uris.map(u => u.toString())
  await context.workspaceState.update('lastSelection', uriStrings)
  refresh(uris.length)
}

async function addToCollection(file: vscode.Uri) {
  try {
    // Basic check if it's a valid URI we can handle
    if (file && file.fsPath) {
      filesCollection.push(file)
      vscode.window.setStatusBarMessage(`File added to collection! (${filesCollection.length} total)`, 5000)
    }
    else {
      vscode.window.showErrorMessage('Invalid item provided to add to collection.')
    }
  }
  catch (err) {
    vscode.window.showErrorMessage(`Could not add file to collection: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

async function newCollectionAndAdd(file: vscode.Uri) {
  try {
    if (file && file.fsPath) {
      filesCollection = [file] // Start new collection with this file
      vscode.window.setStatusBarMessage(`New collection started with file! (1 total)`, 5000)
    }
    else {
      vscode.window.showErrorMessage('Invalid item provided to start collection.')
    }
  }
  catch (err) {
    vscode.window.showErrorMessage(`Could not start new collection: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

async function copySelected(context: vscode.ExtensionContext, selectedItems: vscode.Uri[], refresh: (n: number) => void) {
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

    // Deduplicate URIs using Map one-liner
    const uniqueUris = Array.from(new Map(tempCollection.map(u => [u.toString(), u])).values())
    const content = await copyContent(uniqueUris)
    await finalizeCopy(context, uniqueUris, content, refresh)
    vscode.window.setStatusBarMessage(
      `Selected content copied to clipboard! (${uniqueUris.length} files)`,
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
  /** create status-bar item, right side, priority 100 */
  lastSelItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  )
  lastSelItem.command = 'extension.copyLastSelection'
  context.subscriptions.push(lastSelItem)

  /** refresh helper */
  const refreshStatusBar = (count: number) => {
    if (!lastSelItem)
      return
    if (count > 0) {
      lastSelItem.text = `$(files) LastSel: ${count}` // Simplified text
      lastSelItem.tooltip = `Copy ${count} files from last selection`
      lastSelItem.show()
    }
    else {
      lastSelItem.hide()
    }
  }

  /** restore snapshot from previous session */
  const cachedUriStrings = context.workspaceState
    .get<string[]>('lastSelection') || []
  // Restore URIs using parse
  let restoredUris: vscode.Uri[] = []
  try {
    restoredUris = cachedUriStrings.map(str => vscode.Uri.parse(str, true)) // Use strict parsing
  }
  catch (e) {
    console.error('Error parsing stored URIs:', e)
    // Optionally clear invalid state
    context.workspaceState.update('lastSelection', [])
  }
  refreshStatusBar(restoredUris.length)

  const copyFolderContent = async (folder: vscode.Uri, prompt: string, withoutComments: boolean) => {
    try {
      const entries = await vscode.workspace.fs.readDirectory(folder)
      const files: vscode.Uri[] = []

      for (const [name, type] of entries) {
        if (type === vscode.FileType.File) {
          files.push(vscode.Uri.joinPath(folder, name))
        }
      }

      // Deduplicate URIs using Map one-liner
      const uniqueUris = Array.from(new Map(files.map(u => [u.toString(), u])).values())
      const fileContent = await copyContent(uniqueUris, withoutComments) // Renamed variable for clarity
      const content = `${prompt}\n${fileContent}\n${prompt}`

      await finalizeCopy(context, uniqueUris, content, refreshStatusBar)
      vscode.window.setStatusBarMessage(`Folder content copied to clipboard${prompt ? ' with prompt' : ''}! (${uniqueUris.length} files)`, 5000)
    }
    catch {
      vscode.window.showErrorMessage('Could not read folder')
    }
  }

  const addToCollectionAndCopy = async (file: vscode.Uri) => {
    // Use the globally defined addToCollection first
    await addToCollection(file)
    // Check if the file was actually added (addToCollection might have errored)
    if (filesCollection.includes(file)) {
      if (filesCollection.length > 0) {
        // Deduplicate URIs using Map one-liner
        const uniqueUris = Array.from(new Map(filesCollection.map(u => [u.toString(), u])).values())
        const content = await copyContent(uniqueUris)
        await finalizeCopy(context, uniqueUris, content, refreshStatusBar)
        vscode.window.setStatusBarMessage(`File added and collection copied! (${uniqueUris.length} total)`, 5000)
      }
      else {
        // This case might occur if addToCollection failed silently or cleared the collection somehow
        vscode.window.showWarningMessage('Collection is empty, nothing to copy.')
      }
    } // If file wasn't added, the status message from addToCollection should suffice.
  }

  const copyCollectionAndClear = async () => {
    if (filesCollection.length === 0) {
      vscode.window.showInformationMessage('Collection is already empty.')
      return
    }
    // Deduplicate URIs using Map one-liner
    const uniqueUris = Array.from(new Map(filesCollection.map(u => [u.toString(), u])).values())
    const content = await copyContent(uniqueUris)
    // Write directly to clipboard, bypassing finalizeCopy for this specific command
    await vscode.env.clipboard.writeText(content)
    filesCollection = [] // Clear the active collection
    // Explicitly clear persisted state and hide status bar item for "clear" action
    await context.workspaceState.update('lastSelection', [])
    refreshStatusBar(0)
    vscode.window.setStatusBarMessage(`Collection copied to clipboard and cleared!`, 5000)
  }

  const disposable = vscode.commands.registerCommand('extension.copyFolderContent', folder => copyFolderContent(folder, '', false))
  const disposableWithoutComments = vscode.commands.registerCommand('extension.copyFolderContentWithoutComments', folder => copyFolderContent(folder, '', true))
  const disposableAddToCollection = vscode.commands.registerCommand('extension.addToCollection', addToCollection)
  const disposableAddToCollectionAndCopy = vscode.commands.registerCommand('extension.addToCollectionAndCopy', addToCollectionAndCopy)
  const disposableNewCollectionAndAdd = vscode.commands.registerCommand('extension.newCollectionAndAdd', newCollectionAndAdd)
  const disposableCopyCollectionAndClear = vscode.commands.registerCommand('extension.copyCollectionAndClear', copyCollectionAndClear)

  context.subscriptions.push(disposable)
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
    // Call copySelected with the single folder URI, passing context and refresh
    await copySelected(context, [folder], refreshStatusBar)
  })
  context.subscriptions.push(disposableRecursiveCopy)

  const disposableCopyFolderContentByType = vscode.commands.registerCommand('extension.copyFolderContentRecursivelyByType', async (folder: vscode.Uri) => {
    try {
      const allFiles = await getFilesRecursively(folder)

      if (allFiles.length === 0) {
        vscode.window.showInformationMessage('No files found in the folder.')
        return
      }

      const fileExtensions = new Set<string>()
      allFiles.forEach((fileUri) => {
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

      const filesToCopy = allFiles.filter((fileUri) => {
        const name = fileUri.path.substring(fileUri.path.lastIndexOf('/') + 1)
        return selectedExtensions.some(ext => name.endsWith(ext))
      })

      if (filesToCopy.length === 0) {
        vscode.window.showInformationMessage('No files matching the selected extensions found.')
        return
      }

      if (filesToCopy.length > 1000) {
        const shouldContinue = await vscode.window.showWarningMessage(
          `The selection contains more than 1000 files (${filesToCopy.length} files) of the selected types. Do you want to continue?`,
          'Yes',
          'No',
        )
        if (shouldContinue !== 'Yes')
          return
      }

      // Deduplicate URIs using Map one-liner
      const uniqueUris = Array.from(new Map(filesToCopy.map(u => [u.toString(), u])).values())
      const content = await copyContent(uniqueUris)
      await finalizeCopy(context, uniqueUris, content, refreshStatusBar)
      vscode.window.setStatusBarMessage(`Folder content with extensions [${selectedExtensions.join(', ')}] copied! (${uniqueUris.length} files)`, 5000)
    }
    catch (err) {
      vscode.window.showErrorMessage(`Could not read folder recursively by type: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  })
  context.subscriptions.push(disposableCopyFolderContentByType)

  const disposableSelectedCopy = vscode.commands.registerCommand(
    'extension.copySelectedFilesAndFolders',
    async (uri: vscode.Uri, uris: vscode.Uri[]) => {
      const selectedItems = uris?.length ? uris : (uri ? [uri] : [])
      if (!selectedItems.length) {
        vscode.window.showInformationMessage('No file or folder selected.')
        return
      }
      await copySelected(context, selectedItems, refreshStatusBar)
    },
  )
  context.subscriptions.push(disposableSelectedCopy)

  // New command registration
  const disposableCopyLast = vscode.commands.registerCommand(
    'extension.copyLastSelection',
    async () => {
      const lastUriStrings = context.workspaceState
        .get<string[]>('lastSelection') || []

      if (!lastUriStrings.length) {
        vscode.window.showInformationMessage('No previous selection stored.')
        return
      }

      let lastUris: vscode.Uri[] = []
      try {
        lastUris = lastUriStrings.map(str => vscode.Uri.parse(str, true)) // Use strict parsing
      }
      catch (e) {
        vscode.window.showErrorMessage('Error restoring last selection URIs. Clearing stored selection.')
        console.error('Error parsing URIs from workspaceState:', e)
        await context.workspaceState.update('lastSelection', [])
        refreshStatusBar(0)
        return
      }

      // Directly use copyContent and finalizeCopy, skip copySelected
      try {
        // Deduplicate URIs using Map one-liner
        const uniqueUris = Array.from(new Map(lastUris.map(u => [u.toString(), u])).values())
        const content = await copyContent(uniqueUris)
        // Call finalizeCopy to update clipboard, state, and UI
        await finalizeCopy(context, uniqueUris, content, refreshStatusBar)
        vscode.window.setStatusBarMessage(`Copied last selection (${uniqueUris.length} files)!`, 5000)
      }
      catch (err) {
        vscode.window.showErrorMessage(`Error copying last selection: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    },
  )
  context.subscriptions.push(disposableCopyLast)
}

export function deactivate() {
  // Dispose status bar item if it exists
  if (lastSelItem) {
    lastSelItem.dispose()
    lastSelItem = undefined
  }
}
