import { marked } from "marked";
import mermaid from "mermaid";
import TurndownService from "turndown";
import { createSearchController } from "./search";

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
const boldButton = document.getElementById("bold-button") as HTMLButtonElement;
const italicButton = document.getElementById("italic-button") as HTMLButtonElement;
const strikeButton = document.getElementById("strike-button") as HTMLButtonElement;
const headingPicker = document.getElementById("heading-picker") as HTMLSelectElement;
const diagramViewPicker = document.getElementById("diagram-view-picker") as HTMLSelectElement;

interface MermaidPreviewCacheEntry {
  source: string;
  svg: string;
}

interface PanZoomTransform {
  scale: number;
  tx: number;
  ty: number;
}

function readTransform(svgEl: Element | null): PanZoomTransform {
  const match = (svgEl as HTMLElement | null)?.style.transform.match(
    /translate\(([-\d.]+)px,\s*([-\d.]+)px\)\s*scale\(([-\d.]+)\)/
  );
  if (match) {
    return { tx: parseFloat(match[1]), ty: parseFloat(match[2]), scale: parseFloat(match[3]) };
  }

  return { scale: 1, tx: 0, ty: 0 };
}

marked.setOptions({ breaks: true });

function getMermaidTheme(): "dark" | "default" {
  return document.body.classList.contains("vscode-dark") ||
    document.body.classList.contains("vscode-high-contrast")
    ? "dark"
    : "default";
}

function initMermaid(): void {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: getMermaidTheme(),
  });
}

initMermaid();

new MutationObserver(() => {
  initMermaid();
  scheduleMermaidRender();
}).observe(document.body, { attributeFilter: ["class"] });

let savedRange: Range | null = null;
let mermaidRenderTimer: number | undefined;
let mermaidRenderSerial = 0;
const mermaidPreviewCache = new Map<number, MermaidPreviewCacheEntry>();

function isMermaidPreviewElement(node: Element | null): node is HTMLDivElement {
  return !!node && node instanceof HTMLDivElement && node.dataset.mermaidPreview === "true";
}

function serializeMermaidNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }

  const element = node as HTMLElement;
  if (element.tagName === "BR") {
    return "\n";
  }

  let text = "";
  element.childNodes.forEach((childNode) => {
    text += serializeMermaidNode(childNode);
  });

  if (/^(DIV|P|LI|TR)$/.test(element.tagName)) {
    text += "\n";
  }

  return text;
}

function getMermaidSource(codeBlock: HTMLElement): string {
  return Array.from(codeBlock.childNodes)
    .map((node) => serializeMermaidNode(node))
    .join("")
    .replace(/\r\n?/g, "\n");
}

function normalizeMermaidCodeBlocks(root: ParentNode): void {
  root.querySelectorAll("pre > code.language-mermaid").forEach((node) => {
    const codeBlock = node as HTMLElement;
    codeBlock.textContent = getMermaidSource(codeBlock);
  });
}

function clearMermaidError(preview: HTMLDivElement): void {
  preview.classList.remove("has-error");
  preview.querySelectorAll("[data-mermaid-error]").forEach((node) => node.remove());
}

function setMermaidError(preview: HTMLDivElement, message: string): void {
  let errorNode = preview.querySelector("[data-mermaid-error]") as HTMLDivElement | null;
  if (!errorNode) {
    errorNode = document.createElement("div");
    errorNode.dataset.mermaidError = "true";
    errorNode.className = "mermaid-error";
    preview.appendChild(errorNode);
  }

  errorNode.textContent = message;
  preview.classList.add("has-error");
}

function createMermaidPreview(svg: string, initialTransform?: PanZoomTransform): HTMLDivElement {
  const preview = document.createElement("div");
  preview.dataset.mermaidPreview = "true";
  preview.className = "mermaid-preview";
  preview.setAttribute("contenteditable", "false");
  preview.innerHTML = svg;

  const svgEl = preview.querySelector("svg");
  if (svgEl) {
    attachPanZoom(preview, svgEl, initialTransform);
  }

  return preview;
}

function renderMarkdown(md: string): void {
  editor.innerHTML = marked.parse(md) as string;
  savedRange = null;
  scheduleMermaidRender();
  updateToolbarState();
  if (searchController.isOpen()) {
    searchController.refresh();
  }
}

function syncMarkdown(): void {
  const clonedEditor = editor.cloneNode(true) as HTMLDivElement;
  normalizeMermaidCodeBlocks(clonedEditor);
  clonedEditor.querySelectorAll("[data-mermaid-preview]").forEach((node) => node.remove());

  const md = turndown.turndown(clonedEditor.innerHTML);
  if (md === lastSentMd) {
    return;
  }

  lastSentMd = md;
  vscode.postMessage({ type: "change", text: md });
}

function saveSelection(): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) {
    return;
  }

  savedRange = range.cloneRange();
}

function restoreSelection(): boolean {
  if (!savedRange) {
    return false;
  }

  const selection = window.getSelection();
  if (!selection) {
    return false;
  }

  selection.removeAllRanges();
  selection.addRange(savedRange.cloneRange());
  return true;
}

function getCurrentBlockTag(): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return "p";
  }

  let node: Node | null = selection.anchorNode;
  if (!node) {
    return "p";
  }

  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement;
  }

  while (node && node !== editor) {
    if (node instanceof HTMLElement) {
      const tagName = node.tagName.toLowerCase();
      if (tagName === "p" || /^h[1-4]$/.test(tagName)) {
        return tagName;
      }
    }

    node = node.parentElement;
  }

  return "p";
}

function updateToolbarState(): void {
  const selection = window.getSelection();
  const hasEditorSelection =
    !!selection &&
    selection.rangeCount > 0 &&
    editor.contains(selection.getRangeAt(0).commonAncestorContainer);

  boldButton.setAttribute("aria-pressed", String(hasEditorSelection && document.queryCommandState("bold")));
  italicButton.setAttribute("aria-pressed", String(hasEditorSelection && document.queryCommandState("italic")));
  strikeButton.setAttribute("aria-pressed", String(hasEditorSelection && document.queryCommandState("strikeThrough")));
  headingPicker.value = hasEditorSelection ? getCurrentBlockTag() : "p";
}

function scheduleMermaidRender(): void {
  if (mermaidRenderTimer !== undefined) {
    window.clearTimeout(mermaidRenderTimer);
  }

  mermaidRenderTimer = window.setTimeout(() => {
    mermaidRenderTimer = undefined;
    void renderMermaidPreviews();
  }, 0);
}

async function renderMermaidPreviews(): Promise<void> {
  const renderSerial = ++mermaidRenderSerial;
  const activeIndexes = new Set<number>();

  const mermaidBlocks = Array.from(editor.querySelectorAll("pre > code.language-mermaid"));

  for (let index = 0; index < mermaidBlocks.length; index += 1) {
    activeIndexes.add(index);

    const codeBlock = mermaidBlocks[index];
    const pre = codeBlock.parentElement;

    if (!pre) {
      continue;
    }

    const source = getMermaidSource(codeBlock as HTMLElement);
    if (!source.trim()) {
      const existingPreview = isMermaidPreviewElement(pre.nextElementSibling) ? pre.nextElementSibling : null;
      if (existingPreview) {
        existingPreview.remove();
      }

      mermaidPreviewCache.delete(index);
      continue;
    }

    const existingPreview = isMermaidPreviewElement(pre.nextElementSibling) ? pre.nextElementSibling : null;

    const diagramId = `mermaid-${renderSerial}-${index}`;

    try {
      const { svg } = await mermaid.render(diagramId, source);
      if (renderSerial !== mermaidRenderSerial) {
        return;
      }

      const savedTransform = existingPreview ? readTransform(existingPreview.querySelector("svg")) : undefined;
      const nextPreview = createMermaidPreview(svg, savedTransform);
      clearMermaidError(nextPreview);

      if (existingPreview) {
        existingPreview.replaceWith(nextPreview);
      } else {
        pre.insertAdjacentElement("afterend", nextPreview);
      }

      mermaidPreviewCache.set(index, { source, svg });
    } catch (error) {
      if (renderSerial !== mermaidRenderSerial) {
        return;
      }

      const cachedEntry = mermaidPreviewCache.get(index);

      if (existingPreview) {
        if (existingPreview.querySelector("svg") === null && cachedEntry) {
          existingPreview.innerHTML = cachedEntry.svg;
          const svgEl = existingPreview.querySelector("svg");
          if (svgEl) {
            attachPanZoom(existingPreview, svgEl);
          }
        }

        setMermaidError(existingPreview, "Unable to render Mermaid diagram. Showing last valid version.");
      } else if (cachedEntry) {
        const fallbackPreview = createMermaidPreview(cachedEntry.svg);
        setMermaidError(fallbackPreview, "Unable to render Mermaid diagram. Showing last valid version.");
        pre.insertAdjacentElement("afterend", fallbackPreview);
      } else {
        const errorPreview = document.createElement("div");
        errorPreview.dataset.mermaidPreview = "true";
        errorPreview.className = "mermaid-preview has-error";
        errorPreview.setAttribute("contenteditable", "false");
        errorPreview.innerHTML = "<div class='mermaid-error'>Unable to render Mermaid diagram.</div>";
        pre.insertAdjacentElement("afterend", errorPreview);
      }

      console.error(error);
    }
  }

  mermaidPreviewCache.forEach((_, index) => {
    if (!activeIndexes.has(index)) {
      mermaidPreviewCache.delete(index);
    }
  });
}

function openDiagramModal(svgEl: SVGSVGElement | Element): void {
  const overlay = document.createElement("div");
  overlay.className = "mermaid-modal-overlay";

  const dialog = document.createElement("div");
  dialog.className = "mermaid-modal-dialog";

  const header = document.createElement("div");
  header.className = "mermaid-modal-header";

  const btnClose = document.createElement("button");
  btnClose.type = "button";
  btnClose.className = "mermaid-modal-close";
  btnClose.textContent = "×";
  btnClose.title = "Close";
  header.appendChild(btnClose);

  const content = document.createElement("div");
  content.className = "mermaid-modal-content";

  const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
  svgClone.removeAttribute("width");
  svgClone.removeAttribute("height");
  content.appendChild(svgClone);

  dialog.append(header, content);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  let scale = 1;
  let tx = 0;
  let ty = 0;

  function applyTransform(): void {
    svgClone.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  content.addEventListener("wheel", (e: WheelEvent) => {
    e.preventDefault();
    const rect = content.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newScale = Math.min(8, Math.max(0.1, scale * delta));
    tx = mouseX - (mouseX - tx) * (newScale / scale);
    ty = mouseY - (mouseY - ty) * (newScale / scale);
    scale = newScale;
    applyTransform();
  }, { passive: false });

  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartTx = 0;
  let dragStartTy = 0;

  content.addEventListener("mousedown", (e: MouseEvent) => {
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartTx = tx;
    dragStartTy = ty;
    content.classList.add("is-dragging");
    e.preventDefault();
  });

  const onMouseMove = (e: MouseEvent): void => {
    if (!dragging) return;
    tx = dragStartTx + (e.clientX - dragStartX);
    ty = dragStartTy + (e.clientY - dragStartY);
    applyTransform();
  };

  const onMouseUp = (): void => {
    if (dragging) {
      dragging = false;
      content.classList.remove("is-dragging");
    }
  };

  const closeModal = (): void => {
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") closeModal();
  };

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  document.addEventListener("keydown", onKeyDown);

  btnClose.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e: MouseEvent) => {
    if (e.target === overlay) closeModal();
  });
}

function attachPanZoom(container: HTMLDivElement, svgEl: SVGSVGElement | Element, initialTransform?: PanZoomTransform): void {
  let scale = initialTransform?.scale ?? 1;
  let tx = initialTransform?.tx ?? 0;
  let ty = initialTransform?.ty ?? 0;

  function applyTransform(): void {
    (svgEl as HTMLElement).style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  if (initialTransform) {
    applyTransform();
  }

  function resetTransform(): void {
    scale = 1;
    tx = 0;
    ty = 0;
    applyTransform();
  }

  // Wheel to zoom, pivot at mouse cursor
  container.addEventListener("wheel", (e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newScale = Math.min(4, Math.max(0.2, scale * delta));

    tx = mouseX - (mouseX - tx) * (newScale / scale);
    ty = mouseY - (mouseY - ty) * (newScale / scale);
    scale = newScale;

    applyTransform();
  }, { passive: false });

  // Drag to pan
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartTx = 0;
  let dragStartTy = 0;

  container.addEventListener("mousedown", (e: MouseEvent) => {
    // Ignore toolbar button clicks
    if ((e.target as HTMLElement).closest(".mermaid-toolbar")) {
      return;
    }
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartTx = tx;
    dragStartTy = ty;
    container.classList.add("is-dragging");
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e: MouseEvent) => {
    if (!dragging) {
      return;
    }
    tx = dragStartTx + (e.clientX - dragStartX);
    ty = dragStartTy + (e.clientY - dragStartY);
    applyTransform();
  });

  window.addEventListener("mouseup", () => {
    if (dragging) {
      dragging = false;
      container.classList.remove("is-dragging");
    }
  });

  // Double-click to reset
  container.addEventListener("dblclick", (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest(".mermaid-toolbar")) {
      return;
    }
    resetTransform();
  });

  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.className = "mermaid-toolbar";
  toolbar.setAttribute("contenteditable", "false");

  const btnZoomIn = document.createElement("button");
  btnZoomIn.type = "button";
  btnZoomIn.textContent = "+";
  btnZoomIn.title = "Zoom in";
  btnZoomIn.addEventListener("click", () => {
    scale = Math.min(4, scale * 1.25);
    applyTransform();
  });

  const btnZoomOut = document.createElement("button");
  btnZoomOut.type = "button";
  btnZoomOut.textContent = "−";
  btnZoomOut.title = "Zoom out";
  btnZoomOut.addEventListener("click", () => {
    scale = Math.max(0.2, scale / 1.25);
    applyTransform();
  });

  const btnReset = document.createElement("button");
  btnReset.type = "button";
  btnReset.textContent = "⊙";
  btnReset.title = "Reset view";
  btnReset.addEventListener("click", resetTransform);

  const btnExpand = document.createElement("button");
  btnExpand.type = "button";
  btnExpand.textContent = "⤢";
  btnExpand.title = "Open in fullscreen";
  btnExpand.addEventListener("click", () => openDiagramModal(svgEl));

  toolbar.append(btnZoomIn, btnZoomOut, btnReset, btnExpand);
  container.appendChild(toolbar);
}

function applyCommand(command: "bold" | "italic" | "strikeThrough"): void {
  editor.focus();
  restoreSelection();
  document.execCommand(command, false);
  saveSelection();
  syncMarkdown();
  updateToolbarState();
}

function applyHeading(level: string): void {
  editor.focus();
  restoreSelection();
  document.execCommand("formatBlock", false, `<${level}>`);
  saveSelection();
  syncMarkdown();
  updateToolbarState();
}

const searchController = createSearchController(editor, restoreSelection);

renderMarkdown(initialText);

let lastSentMd = initialText;

editor.addEventListener("input", () => {
  syncMarkdown();
  scheduleMermaidRender();
  if (searchController.isOpen()) {
    searchController.refresh();
  }
});

document.addEventListener("selectionchange", () => {
  saveSelection();
  updateToolbarState();
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

document.addEventListener("keydown", (event: KeyboardEvent) => {
  searchController.handleDocumentKeydown(event);
});

boldButton.addEventListener("mousedown", (event) => {
  event.preventDefault();
});

italicButton.addEventListener("mousedown", (event) => {
  event.preventDefault();
});

strikeButton.addEventListener("mousedown", (event) => {
  event.preventDefault();
});

boldButton.addEventListener("click", () => {
  applyCommand("bold");
});

italicButton.addEventListener("click", () => {
  applyCommand("italic");
});

strikeButton.addEventListener("click", () => {
  applyCommand("strikeThrough");
});

headingPicker.addEventListener("change", () => {
  applyHeading(headingPicker.value);
});

diagramViewPicker.addEventListener("change", () => {
  editor.classList.remove("diagram-view-code", "diagram-view-diagram");
  const value = diagramViewPicker.value;
  if (value === "code") {
    editor.classList.add("diagram-view-code");
  } else if (value === "diagram") {
    editor.classList.add("diagram-view-diagram");
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

editor.addEventListener("mouseup", saveSelection);
editor.addEventListener("keyup", saveSelection);

editor.addEventListener("paste", (event: ClipboardEvent) => {
  const plain = event.clipboardData?.getData("text/plain") ?? "";

  const looksLikeMarkdown =
    /^#{1,6} /m.test(plain) ||
    /^```/m.test(plain) ||
    /^[-*+] /m.test(plain) ||
    /^\d+\. /m.test(plain) ||
    /\*\*[^*]+\*\*/.test(plain) ||
    /^>/m.test(plain);

  if (!looksLikeMarkdown) {
    return;
  }

  event.preventDefault();

  const html = marked.parse(plain) as string;

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return;
  }

  const range = selection.getRangeAt(0);
  range.deleteContents();

  const fragment = document.createRange().createContextualFragment(html);
  range.insertNode(fragment);

  // Collapse selection to the end of the inserted content
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);

  syncMarkdown();
  scheduleMermaidRender();
});

editor.focus();
saveSelection();
updateToolbarState();
