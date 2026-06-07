import type { HistoryState, InkAction, Notebook, NoteElement, Page, Stroke } from "../types/ink";

export function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createPage(index: number): Page {
  return {
    id: makeId("page"),
    title: `Page ${index}`,
    background: "grid",
    strokes: [],
    elements: [],
  };
}

export function createInitialNotebook(): Notebook {
  const firstPage = createPage(1);

  return {
    id: makeId("notebook"),
    title: "InkPad Lab",
    activePageId: firstPage.id,
    pages: [firstPage],
    updatedAt: Date.now(),
  };
}

export function getActivePage(notebook: Notebook) {
  return notebook.pages.find((page) => page.id === notebook.activePageId) ?? notebook.pages[0];
}

// Removes a page. Keeps at least one page; if the active page is deleted, the
// active page moves to its neighbour.
export function removePage(notebook: Notebook, pageId: string): Notebook {
  if (notebook.pages.length <= 1) {
    return notebook;
  }

  const index = notebook.pages.findIndex((page) => page.id === pageId);
  if (index === -1) {
    return notebook;
  }

  const pages = notebook.pages.filter((page) => page.id !== pageId);
  const activePageId =
    notebook.activePageId === pageId ? pages[Math.min(index, pages.length - 1)].id : notebook.activePageId;

  return { ...notebook, pages, activePageId, updatedAt: Date.now() };
}

export function updatePage(notebook: Notebook, pageId: string, updater: (page: Page) => Page): Notebook {
  return {
    ...notebook,
    updatedAt: Date.now(),
    pages: notebook.pages.map((page) => (page.id === pageId ? updater(page) : page)),
  };
}

export function appendStroke(notebook: Notebook, pageId: string, stroke: Stroke) {
  return updatePage(notebook, pageId, (page) => ({
    ...page,
    strokes: [...page.strokes, stroke],
  }));
}

export function removeStrokes(notebook: Notebook, pageId: string, strokeIds: string[]) {
  const removed = new Set(strokeIds);

  return updatePage(notebook, pageId, (page) => ({
    ...page,
    strokes: page.strokes.filter((stroke) => !removed.has(stroke.id)),
  }));
}

export function removeElements(notebook: Notebook, pageId: string, elementIds: string[]) {
  const removed = new Set(elementIds);

  return updatePage(notebook, pageId, (page) => ({
    ...page,
    elements: (page.elements ?? []).filter((element) => !removed.has(element.id)),
  }));
}

// Precision eraser: swap each affected stroke for its surviving pieces in place
// (preserving z-order). An empty piece list drops the stroke entirely.
export function replaceStrokes(notebook: Notebook, pageId: string, replacements: Record<string, Stroke[]>) {
  return updatePage(notebook, pageId, (page) => ({
    ...page,
    strokes: page.strokes.flatMap((stroke) => replacements[stroke.id] ?? [stroke]),
  }));
}

export function appendElement(notebook: Notebook, pageId: string, element: NoteElement) {
  return updatePage(notebook, pageId, (page) => ({
    ...page,
    elements: [...(page.elements ?? []), element],
  }));
}

export function updateElement(notebook: Notebook, pageId: string, element: NoteElement) {
  return updatePage(notebook, pageId, (page) => ({
    ...page,
    elements: (page.elements ?? []).map((item) => (item.id === element.id ? element : item)),
  }));
}

export function restoreElements(notebook: Notebook, pageId: string, elements: NoteElement[]) {
  return updatePage(notebook, pageId, (page) => ({
    ...page,
    elements: [...(page.elements ?? []), ...elements],
  }));
}

export function restoreStrokes(notebook: Notebook, pageId: string, strokes: Stroke[]) {
  return updatePage(notebook, pageId, (page) => ({
    ...page,
    strokes: [...page.strokes, ...strokes],
  }));
}

export function undoInkAction(notebook: Notebook, action: InkAction) {
  if (action.type === "add-stroke") {
    return removeStrokes(notebook, action.pageId, [action.stroke.id]);
  }

  if (action.type === "erase-elements") {
    return restoreElements(notebook, action.pageId, action.elements);
  }

  if (action.type === "split-strokes") {
    const withoutPieces = removeStrokes(
      notebook,
      action.pageId,
      action.added.map((stroke) => stroke.id),
    );
    return restoreStrokes(withoutPieces, action.pageId, action.removed);
  }

  return restoreStrokes(notebook, action.pageId, action.strokes);
}

export function redoInkAction(notebook: Notebook, action: InkAction) {
  if (action.type === "add-stroke") {
    return appendStroke(notebook, action.pageId, action.stroke);
  }

  if (action.type === "erase-elements") {
    return removeElements(
      notebook,
      action.pageId,
      action.elements.map((element) => element.id),
    );
  }

  if (action.type === "split-strokes") {
    const withoutOriginals = removeStrokes(
      notebook,
      action.pageId,
      action.removed.map((stroke) => stroke.id),
    );
    return restoreStrokes(withoutOriginals, action.pageId, action.added);
  }

  return removeStrokes(
    notebook,
    action.pageId,
    action.strokes.map((stroke) => stroke.id),
  );
}

export function pushHistory(history: HistoryState, action: InkAction): HistoryState {
  return {
    done: [...history.done, action].slice(-80),
    undone: [],
  };
}
