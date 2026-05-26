export type ToolMode = "pen" | "highlighter" | "eraser" | "lasso" | "text" | "shape";

export type ElementKind = "axis" | "distribution" | "function" | "vector" | "matrix" | "table" | "circle" | "rect" | "triangle" | "line_drawn";

export type DistributionKind = "normal" | "uniform" | "exponential" | "bimodal" | "skewed";

export type NoteElement = {
  id: string;
  kind: ElementKind;
  x: number;
  y: number;
  color: string;
  length?: number;
  rows?: number;
  cols?: number;
  dimension?: 1 | 2 | 3;
  distribution?: DistributionKind;
  expression?: string;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  radius?: number;
  shapeW?: number;
  shapeH?: number;
  pts?: number[][];
};

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
  elements: NoteElement[];
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
