# Madie

Madie is a markdown WYSIWYG-style editor for VS Code. It opens Markdown files in a custom editor that renders the document, lets you edit the rendered content directly, and syncs changes back to the source Markdown.

## Features

- Render Markdown with a live editable webview.
- Edit the rendered content and keep the source Markdown in sync.
- Match the current VS Code theme for colors and editor font.
- Choose a custom font family and font size from Madie settings.

## Usage

1. Open a `.md` file in VS Code.
2. Choose Madie as the editor if VS Code asks.
3. Edit the rendered document directly.

## Settings

- `madie.fontFamily`: Override the editor font family. Leave empty to use the VS Code editor font.
- `madie.fontSize`: Set the editor font size in pixels.

## Development

- `npm run watch` builds the extension and webview in watch mode.
- `npm run build` produces the production bundle.
- `npm run lint` type-checks the project.
- `npm run test` runs the extension test suite.

## Release Status

The initial public release target is `v0.1.0` under `triple0-labs/madie`.