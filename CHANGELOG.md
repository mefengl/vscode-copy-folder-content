# Change Log

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.6.1] - 2025-04-29

### Changed

- Updated dependencies and VS Code engine version. (Internal change, might affect compatibility)

## [1.6.0] - 2025-04-29

### Added

- New command `Copy Last Selection`: Allows re-copying the content of the last selection made using this extension via a status bar item or command palette (commit `ed8c806`).

## [1.5.4] - 2025-04-12

### Removed

- Removed the `Copy Folder Content With Prompt` command (commit `f58dadd`).

## [1.5.1] - 2025-02-28

### Added

- Enhanced error handling for more robust operation (commit `20c9190`).

## [1.5.0] - 2025-02-06

### Added

- New command `Copy Selected Files and Folders`: Allows copying multiple selected files and the direct files within selected folders from the explorer (commit `79293b1`).

### Fixed

- Addressed an issue related to cursor code version compatibility (commit `b8dec40`).

### Changed

- Improved formatting of the copied content for better readability (commits `d4a2e2b`, `853bfcf`).
- Information messages (like "Copied!") now auto-hide after 5 seconds (commit `8043640`).

## [1.4.0] - 2024-04-23

### Added

- Copy folder contents recursively while selecting specific file types.

## [1.3.0] - 2024-03-04

### Added

- Recursive folder content copying with file count check.

## [1.2.0] - 2023-11-08

### Added

- Non-UTF-8 encoded support. [#31](https://github.com/mefengl/vscode-copy-folder-content/issues/31)

## [1.1.0] - 2023-08-10

### Added

- New command "Copy Collection and Clear". This command allows users to copy the content of the current file collection to the clipboard and clear the collection.

## [1.0.1] - 2023-08-08

### Updated

- Updated the description of the extension in the package.json file.

## [1.0.0] - 2023-08-08

### Added

- New commands "Add to Collection", "Add to Collection and Copy", and "Begin New Collection and Add". These commands allow users to create a collection of files and copy their content all at once.

## [0.4.0] - 2023-08-08

### Changed

- Removed the setting "Suffix".
- The "Copy Folder Content With Suffix" command has been replaced with the "Copy Folder Content With Prompt" command. This command prompts the user to input a string which is added at the beginning and end of the copied content.

## [0.3.0] - 2023-07-11

### Added

- Added a new command "Copy Folder Content Without Comments" that copies the folder content without comments.

## [0.2.1] - 2023-07-04

### Added

- Added a new command "Copy Folder Content With Suffix" that appends a user-defined suffix to the copied content.

### Changed

- The "Copy Folder Content" command no longer appends the suffix.

## [0.2.0] - 2023-06-25

### Added

- Added a new extension setting "Suffix" which appends a specified suffix after the copied folder content.

## [0.1.4] - 2023-06-18

### Changed

- Updated icon.

## [0.1.1] - 2023-06-16

### Fixed

- Updated "when" condition for copy folder command in explorer context menu in package.json as per commit `18de608`.

## [0.1.0] - 2023-06-16

### Added

- Initial release of the "copy-folder-content" extension.
- The "group" property in "extension.copyFolderContent" command has been updated as per commit `76aceb7`.
- Logo and publisher details have been added to the package.json file as per commit `17f63d1`.

## [Unreleased]

- No changes have been made after the initial release.
