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

  return restoreStrokes(notebook, action.pageId, action.strokes);
}

export function redoInkAction(notebook: Notebook, action: InkAction) {
  if (action.type === "add-stroke") {
    return appendStroke(notebook, action.pageId, action.stroke);
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
