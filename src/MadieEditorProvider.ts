import * as vscode from "vscode";
// @ts-expect-error - webview module resolved by esbuild plugin
import webviewEditor from "webview:editor";

export class MadieEditorProvider implements vscode.CustomTextEditorProvider {
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.window.registerCustomEditorProvider(
      MadieEditorProvider.viewType,
      new MadieEditorProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } }
    );
  }

  private static readonly viewType = "madie.editor";

  constructor(_context: vscode.ExtensionContext) {}

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
    };

    const config = vscode.workspace.getConfiguration("madie");
    const fontFamily = config.get<string>("fontFamily") || "";
    const fontSize = config.get<number>("fontSize") || 14;
    const vscodeFontFamily = vscode.workspace
      .getConfiguration("editor")
      .get<string>("fontFamily", "");

    webviewPanel.webview.html = this.getHtml(
      webviewPanel.webview,
      fontFamily || vscodeFontFamily,
      fontSize,
      document.getText()
    );

    let pendingWebviewChanges = 0;

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (e.document.uri.toString() === document.uri.toString()) {
          if (pendingWebviewChanges > 0) {
            pendingWebviewChanges -= 1;
            return;
          }

          webviewPanel.webview.postMessage({
            type: "update",
            text: document.getText(),
          });
        }
      }
    );

    webviewPanel.onDidDispose(() => changeDocumentSubscription.dispose());

    webviewPanel.webview.onDidReceiveMessage(async (e) => {
      switch (e.type) {
        case "change": {
          if (typeof e.text !== "string" || e.text === document.getText()) {
            break;
          }

          pendingWebviewChanges += 1;
          const edit = new vscode.WorkspaceEdit();
          edit.replace(
            document.uri,
            getFullDocumentRange(document),
            e.text
          );
          const applied = await vscode.workspace.applyEdit(edit);
          if (!applied) {
            pendingWebviewChanges -= 1;
          }
          break;
        }
      }
    });
  }

  private getHtml(
    _webview: vscode.Webview,
    fontFamily: string,
    fontSize: number,
    initialText: string
  ): string {
    const nonce = getNonce();

    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; worker-src blob:;">
  <title>Madie</title>
  <style nonce="${nonce}">
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: ${fontFamily};
      font-size: ${fontSize}px;
      line-height: 1.6;
      padding: 0;
      height: 100vh;
      overflow: hidden;
    }

    #toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 16px;
      background-color: var(--vscode-editorWidget-background);
      border-bottom: 1px solid var(--vscode-editorWidget-border);
      font-size: 12px;
    }

    #toolbar label {
      color: var(--vscode-descriptionForeground);
    }

    #toolbar select,
    #toolbar input[type="number"] {
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border));
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 12px;
      font-family: inherit;
    }

    #toolbar button {
      background-color: var(--vscode-button-secondaryBackground, var(--vscode-input-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-input-foreground));
      border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border));
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 12px;
      font-family: inherit;
      cursor: pointer;
    }

    #toolbar button:hover {
      background-color: var(--vscode-button-secondaryHoverBackground, var(--vscode-input-background));
    }

    #toolbar button:focus,
    #toolbar button[aria-pressed="true"] {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }

    #toolbar button[aria-pressed="true"] {
      background-color: var(--vscode-button-background, var(--vscode-input-background));
      color: var(--vscode-button-foreground, var(--vscode-input-foreground));
    }

    #toolbar select:focus,
    #toolbar input:focus {
      outline: 1px solid var(--vscode-focusBorder);
    }

    #editor {
      width: 100%;
      height: calc(100vh - 36px);
      padding: 32px 48px;
      overflow-y: auto;
      outline: none;
      line-height: 1.7;
    }

    /* Markdown element styles using VS Code theme variables */
    #editor h1, #editor h2, #editor h3,
    #editor h4, #editor h5, #editor h6 {
      color: var(--vscode-editor-foreground);
      font-weight: 600;
      margin-top: 1.2em;
      margin-bottom: 0.4em;
      line-height: 1.3;
    }
    #editor h1 { font-size: 2em; border-bottom: 1px solid var(--vscode-editorWidget-border); padding-bottom: 0.2em; }
    #editor h2 { font-size: 1.5em; border-bottom: 1px solid var(--vscode-editorWidget-border); padding-bottom: 0.2em; }
    #editor h3 { font-size: 1.25em; }
    #editor h4 { font-size: 1em; }
    #editor h5 { font-size: 0.875em; }
    #editor h6 { font-size: 0.85em; color: var(--vscode-descriptionForeground); }

    #editor p { margin-bottom: 0.8em; }

    #editor strong { font-weight: 700; }
    #editor em { font-style: italic; }
    #editor del { text-decoration: line-through; opacity: 0.7; }

    #editor a { color: var(--vscode-textLink-foreground); text-decoration: none; }
    #editor a:hover { text-decoration: underline; }

    #editor code {
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 0.9em;
      background-color: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.1));
      padding: 0.1em 0.4em;
      border-radius: 3px;
    }

    #editor pre {
      background-color: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.1));
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 4px;
      padding: 12px 16px;
      overflow-x: auto;
      margin-bottom: 0.8em;
    }
    #editor pre code {
      background: none;
      padding: 0;
      font-size: 0.9em;
    }

    #editor pre code.language-mermaid {
      display: block;
      white-space: pre-wrap;
    }

    #editor .mermaid-preview {
      position: relative;
      background-color: var(--vscode-editorWidget-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 4px;
      margin-bottom: 0.8em;
      height: 340px;
      overflow: hidden;
      cursor: grab;
      user-select: none;
    }

    #editor .mermaid-preview.is-dragging {
      cursor: grabbing;
    }

    #editor .mermaid-preview svg {
      display: block;
      transform-origin: 0 0;
      background: transparent;
    }

    #editor .mermaid-preview svg > rect[id$="-background"],
    #editor .mermaid-preview svg > rect:first-child {
      fill: transparent !important;
    }

    #editor .mermaid-preview .mermaid-error {
      padding: 12px 16px;
      color: var(--vscode-errorForeground);
      font-size: 0.9em;
      cursor: default;
    }

    #editor .mermaid-toolbar {
      position: absolute;
      top: 6px;
      right: 8px;
      display: flex;
      gap: 4px;
      z-index: 10;
    }

    #editor .mermaid-toolbar button {
      background-color: var(--vscode-button-secondaryBackground, var(--vscode-input-background));
      color: var(--vscode-button-secondaryForeground, var(--vscode-input-foreground));
      border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border));
      border-radius: 3px;
      padding: 2px 7px;
      font-size: 13px;
      line-height: 1.4;
      cursor: pointer;
      opacity: 0.7;
    }

    #editor .mermaid-toolbar button:hover {
      opacity: 1;
    }

    /* Diagram modal */
    .mermaid-modal-overlay {
      position: fixed;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.65);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .mermaid-modal-dialog {
      background-color: var(--vscode-editor-background);
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 6px;
      width: 92vw;
      height: 88vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    .mermaid-modal-header {
      display: flex;
      justify-content: flex-end;
      padding: 6px 8px;
      border-bottom: 1px solid var(--vscode-editorWidget-border);
      flex-shrink: 0;
    }

    .mermaid-modal-close {
      background: none;
      border: none;
      color: var(--vscode-editor-foreground);
      font-size: 20px;
      line-height: 1;
      cursor: pointer;
      padding: 2px 8px;
      border-radius: 3px;
      opacity: 0.7;
    }

    .mermaid-modal-close:hover {
      opacity: 1;
      background-color: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.15));
    }

    .mermaid-modal-content {
      flex: 1;
      position: relative;
      overflow: hidden;
      cursor: grab;
    }

    .mermaid-modal-content.is-dragging {
      cursor: grabbing;
    }

    .mermaid-modal-content svg {
      position: absolute;
      top: 0;
      left: 0;
      transform-origin: 0 0;
      max-width: none;
      max-height: none;
      width: 100%;
      height: 100%;
    }

    /* Diagram view modes */
    #editor.diagram-view-code .mermaid-preview { display: none; }
    #editor.diagram-view-diagram pre:has(code.language-mermaid) { display: none; }

    #editor blockquote {
      border-left: 3px solid var(--vscode-textLink-foreground);
      margin: 0 0 0.8em 0;
      padding: 0.2em 0 0.2em 1em;
      color: var(--vscode-descriptionForeground);
    }

    #editor ul, #editor ol {
      margin: 0 0 0.8em 1.5em;
    }
    #editor li { margin-bottom: 0.2em; }

    #editor hr {
      border: none;
      border-top: 1px solid var(--vscode-editorWidget-border);
      margin: 1.2em 0;
    }

    #editor table {
      border-collapse: collapse;
      margin-bottom: 0.8em;
      width: 100%;
    }
    #editor th, #editor td {
      border: 1px solid var(--vscode-editorWidget-border);
      padding: 6px 12px;
      text-align: left;
    }
    #editor th {
      background-color: var(--vscode-editorWidget-background);
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <label for="font-picker">Font</label>
    <select id="font-picker">
      ${getSystemFonts()
        .map(
          (f) =>
            `<option value="${f}" ${
              fontFamily.includes(f) ? "selected" : ""
            }>${f}</option>`
        )
        .join("\n      ")}
    </select>
    <label for="size-picker">Size</label>
    <input id="size-picker" type="number" min="8" max="72" value="${fontSize}" />
    <button id="bold-button" type="button" aria-label="Bold"><strong>B</strong></button>
    <button id="italic-button" type="button" aria-label="Italic"><em>I</em></button>
    <button id="strike-button" type="button" aria-label="Strikethrough"><del>S</del></button>
    <label for="heading-picker">Heading</label>
    <select id="heading-picker">
      <option value="p">Paragraph</option>
      <option value="h1">H1</option>
      <option value="h2">H2</option>
      <option value="h3">H3</option>
      <option value="h4">H4</option>
    </select>
    <label for="diagram-view-picker">Diagrams</label>
    <select id="diagram-view-picker">
      <option value="both">Code + diagram</option>
      <option value="code">Code only</option>
      <option value="diagram">Diagram only</option>
    </select>
  </div>
  <div id="editor" contenteditable="true" spellcheck="true"></div>

  <script nonce="${nonce}">window.__madie__=${JSON.stringify({ text: initialText, fontFamily, fontSize })};</script>
  <script type="module" nonce="${nonce}">${webviewEditor}</script>
</body>
</html>`;
  }
}

function getSystemFonts(): string[] {
  return [
    "Helvetica",
    "Arial",
    "Courier New",
    "Georgia",
    "Menlo",
    "Monaco",
    "Consolas",
    "Source Code Pro",
    "Fira Code",
    "JetBrains Mono",
    "Times New Roman",
    "Verdana",
    "sans-serif",
    "serif",
    "monospace",
  ];
}

function getNonce(): string {
  let text = "";
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function getFullDocumentRange(document: vscode.TextDocument): vscode.Range {
  const lastLine = Math.max(document.lineCount - 1, 0);
  const lastCharacter = document.lineAt(lastLine).text.length;
  return new vscode.Range(0, 0, lastLine, lastCharacter);
}
