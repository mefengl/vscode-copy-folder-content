# 📂 Copy Folder Content VSCode Extension 📋

This Visual Studio Code (VSCode) extension allows you to copy the content of a selected folder or file into your clipboard, providing additional customization options.

## Why This Extension?

This extension simplifies the process of referencing multiple file types and enhances the efficiency of prompting language learning models like ChatGPT.

## Features 💡

This extension provides unique commands based on whether a file or a folder is selected in the explorer panel.

### Folder Commands

- Copy Folder Content
- Copy Folder Content With Prompt
- Copy Folder Content Without Comments

Each of these options allows you to copy the content of all files in a selected folder to your clipboard. You can opt to include a user-defined prompt or exclude comments from the copied content.

### File Commands

- Add File to Collection
- Add File to Collection and Copy
- Begin New File Collection
- Copy Collection and Clear

These commands enable you to create a collection of individual files, add to the collection, copy the entire collection's content to your clipboard, and clear the collection.

## Installation 🔧

1. Open Visual Studio Code.
2. Press `Ctrl+P` to open the quick open dialog.
3. Type `ext install copy-folder-content` and hit enter.
4. Reload Visual Studio Code.

## Usage 🖱️

### Folder Operations:

1. Open the Explorer panel in VSCode.
2. Right-click on your desired folder.
3. Select your preferred copying option.
   - If you select "Copy Folder Content With Prompt", you will be prompted to enter a string that will be added at the beginning and end of the copied content.
4. The content is now loaded onto your clipboard!

### File Operations:

1. Open the Explorer panel in VSCode.
2. Right-click on your desired file.
3. Select your preferred collection option.
   - "Add File to Collection" adds the selected file to your current collection.
   - "Add File to Collection and Copy" adds the selected file to your current collection and copies the entire collection to the clipboard.
   - "Begin New File Collection" clears your current collection and adds the selected file as the first item in the new collection.
   - "Copy Collection and Clear" copies the current collection to the clipboard and clears it.

## Contributing 🤝

Pull requests are welcome! For major changes, please open an issue first to discuss what you would like to change.

## License 📄

MIT

Enjoy! 🎉
