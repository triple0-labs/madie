type HighlightConstructor = new (...ranges: Range[]) => unknown;
type HighlightRegistry = {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
};
type TextSegment = {
  node: Text;
  start: number;
  end: number;
};
type SearchMatch = {
  range: Range;
};

export type SearchController = {
  isOpen: () => boolean;
  refresh: (preferredIndex?: number) => void;
  handleDocumentKeydown: (event: KeyboardEvent) => boolean;
};

export function createSearchController(
  editor: HTMLDivElement,
  restoreSelection: () => boolean
): SearchController {
  const findWidget = document.getElementById("find-widget") as HTMLDivElement;
  const findInput = document.getElementById("find-input") as HTMLInputElement;
  const findCount = document.getElementById("find-count") as HTMLSpanElement;
  const findPrevButton = document.getElementById("find-prev-button") as HTMLButtonElement;
  const findNextButton = document.getElementById("find-next-button") as HTMLButtonElement;
  const findCloseButton = document.getElementById("find-close-button") as HTMLButtonElement;

  const cssHighlights = (CSS as unknown as { highlights?: HighlightRegistry }).highlights;
  const HighlightCtor = (window as Window & { Highlight?: HighlightConstructor }).Highlight;

  let searchMatches: SearchMatch[] = [];
  let currentSearchIndex = -1;

  function clearSearchHighlights(): void {
    cssHighlights?.delete("madie-search-match");
    cssHighlights?.delete("madie-search-current");
  }

  function isOpen(): boolean {
    return findWidget.classList.contains("is-open");
  }

  function getSearchTextSegments(): { segments: TextSegment[]; text: string } {
    const segments: TextSegment[] = [];
    let text = "";
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest("[data-mermaid-preview]")) {
          return NodeFilter.FILTER_REJECT;
        }

        if (!node.textContent) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const value = node.textContent ?? "";
      segments.push({ node, start: text.length, end: text.length + value.length });
      text += value;
    }

    return { segments, text };
  }

  function getRangeBoundary(
    segments: TextSegment[],
    index: number
  ): { node: Text; offset: number } | undefined {
    for (const segment of segments) {
      if (index >= segment.start && index <= segment.end) {
        return { node: segment.node, offset: index - segment.start };
      }
    }

    const lastSegment = segments[segments.length - 1];
    if (lastSegment && index === lastSegment.end) {
      return { node: lastSegment.node, offset: lastSegment.node.length };
    }

    return undefined;
  }

  function createSearchRange(
    segments: TextSegment[],
    start: number,
    end: number
  ): Range | undefined {
    const startBoundary = getRangeBoundary(segments, start);
    const endBoundary = getRangeBoundary(segments, end);
    if (!startBoundary || !endBoundary) {
      return undefined;
    }

    const range = document.createRange();
    range.setStart(startBoundary.node, startBoundary.offset);
    range.setEnd(endBoundary.node, endBoundary.offset);
    return range;
  }

  function collectSearchMatches(query: string): SearchMatch[] {
    if (!query) {
      return [];
    }

    const { segments, text } = getSearchTextSegments();
    const normalizedText = text.toLowerCase();
    const normalizedQuery = query.toLowerCase();
    const matches: SearchMatch[] = [];
    let index = normalizedText.indexOf(normalizedQuery);

    while (index !== -1) {
      const end = index + normalizedQuery.length;
      const range = createSearchRange(segments, index, end);
      if (range) {
        matches.push({ range });
      }
      index = normalizedText.indexOf(normalizedQuery, Math.max(end, index + 1));
    }

    return matches;
  }

  function paintSearchHighlights(): void {
    clearSearchHighlights();

    if (!HighlightCtor || !cssHighlights || searchMatches.length === 0) {
      return;
    }

    const allRanges = searchMatches.map((match) => match.range);
    cssHighlights.set("madie-search-match", new HighlightCtor(...allRanges));

    const currentMatch = searchMatches[currentSearchIndex];
    if (currentMatch) {
      cssHighlights.set("madie-search-current", new HighlightCtor(currentMatch.range));
    }
  }

  function scrollCurrentSearchMatchIntoView(): void {
    const currentMatch = searchMatches[currentSearchIndex];
    if (!currentMatch) {
      return;
    }

    const selection = window.getSelection();
    if (!HighlightCtor || !cssHighlights) {
      selection?.removeAllRanges();
      selection?.addRange(currentMatch.range.cloneRange());
    }

    const targetElement =
      currentMatch.range.startContainer.parentElement ??
      editor;
    targetElement.scrollIntoView({ block: "center", inline: "nearest" });
  }

  function updateFindControls(): void {
    const total = searchMatches.length;
    findCount.textContent = total === 0 ? "0/0" : `${currentSearchIndex + 1}/${total}`;
    findPrevButton.disabled = total === 0;
    findNextButton.disabled = total === 0;
  }

  function refresh(preferredIndex = currentSearchIndex): void {
    const query = findInput.value;
    searchMatches = collectSearchMatches(query);

    if (searchMatches.length === 0) {
      currentSearchIndex = -1;
      clearSearchHighlights();
      updateFindControls();
      return;
    }

    currentSearchIndex = Math.min(
      Math.max(preferredIndex, 0),
      searchMatches.length - 1
    );
    paintSearchHighlights();
    updateFindControls();
    scrollCurrentSearchMatchIntoView();
  }

  function moveSearchMatch(delta: 1 | -1): void {
    if (searchMatches.length === 0) {
      return;
    }

    currentSearchIndex =
      (currentSearchIndex + delta + searchMatches.length) % searchMatches.length;
    paintSearchHighlights();
    updateFindControls();
    scrollCurrentSearchMatchIntoView();
  }

  function openFindWidget(): void {
    if (!isOpen()) {
      findWidget.classList.add("is-open");
      const selectedText = window.getSelection()?.toString();
      if (selectedText) {
        findInput.value = selectedText.replace(/\s+/g, " ");
      }
      refresh(0);
    }

    findInput.focus();
    findInput.select();
  }

  function closeFindWidget(): void {
    findWidget.classList.remove("is-open");
    searchMatches = [];
    currentSearchIndex = -1;
    clearSearchHighlights();
    updateFindControls();
    editor.focus();
    restoreSelection();
  }

  function handleDocumentKeydown(event: KeyboardEvent): boolean {
    const isFindShortcut =
      event.key.toLowerCase() === "f" &&
      (event.ctrlKey || event.metaKey);

    if (isFindShortcut) {
      event.preventDefault();
      openFindWidget();
      return true;
    }

    if (!isOpen()) {
      return false;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closeFindWidget();
      return true;
    }

    if (event.key === "F3") {
      event.preventDefault();
      moveSearchMatch(event.shiftKey ? -1 : 1);
      return true;
    }

    return false;
  }

  findInput.addEventListener("input", () => {
    refresh(0);
  });

  findInput.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      moveSearchMatch(event.shiftKey ? -1 : 1);
    }
  });

  findPrevButton.addEventListener("click", () => {
    moveSearchMatch(-1);
    findInput.focus();
  });

  findNextButton.addEventListener("click", () => {
    moveSearchMatch(1);
    findInput.focus();
  });

  findCloseButton.addEventListener("click", () => {
    closeFindWidget();
  });

  return { isOpen, refresh, handleDocumentKeydown };
}
