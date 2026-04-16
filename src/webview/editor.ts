import { marked } from "marked";
import TurndownService from "turndown";

declare const acquireVsCodeApi: () => {
  postMessage: (msg: unknown) => void;
};

declare global {
  interface Window {
    __madie__: { text: string; fontFamily: string; fontSize: number };
  }
}

const vscode = acquireVsCodeApi();
const { text: initialText } = window.__madie__;

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
});

const editor = document.getElementById("editor") as HTMLDivElement;
const fontPicker = document.getElementById("font-picker") as HTMLSelectElement;
const sizePicker = document.getElementById("size-picker") as HTMLInputElement;

marked.setOptions({ breaks: true });

function renderMarkdown(md: string): void {
  editor.innerHTML = marked.parse(md) as string;
}

renderMarkdown(initialText);

let lastSentMd = initialText;

editor.addEventListener("input", () => {
  const md = turndown.turndown(editor.innerHTML);
  lastSentMd = md;
  vscode.postMessage({ type: "change", text: md });
});

window.addEventListener("message", (event: MessageEvent) => {
  const message = event.data;
  if (message.type === "update") {
    if (message.text === lastSentMd) {
      return;
    }
    renderMarkdown(message.text);
    lastSentMd = message.text;
  }
});

fontPicker.addEventListener("change", () => {
  document.body.style.fontFamily = fontPicker.value;
});

sizePicker.addEventListener("input", () => {
  const size = parseInt(sizePicker.value, 10);
  if (size >= 8 && size <= 72) {
    document.body.style.fontSize = size + "px";
  }
});

editor.focus();
