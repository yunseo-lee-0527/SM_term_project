export type ToolMode = "pen" | "highlighter" | "eraser";

export type InkPoint = {
  x: number;
  y: number;
  time: number;
  pressure: number;
  tiltX?: number;
  tiltY?: number;
  pointerType?: string;
};

export type Stroke = {
  id: string;
  tool: ToolMode;
  color: string;
  baseWidth: number;
  opacity: number;
  points: InkPoint[];
};

export type PageBackground = "grid" | "dot" | "plain";

export type Page = {
  id: string;
  title: string;
  background: PageBackground;
  strokes: Stroke[];
};

export type Notebook = {
  id: string;
  title: string;
  activePageId: string;
  pages: Page[];
  updatedAt: number;
};

export type InkAction =
  | {
      type: "add-stroke";
      pageId: string;
      stroke: Stroke;
    }
  | {
      type: "erase-strokes";
      pageId: string;
      strokes: Stroke[];
    };

export type HistoryState = {
  done: InkAction[];
  undone: InkAction[];
};
