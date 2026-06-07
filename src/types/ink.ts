export type ToolMode = "pen" | "highlighter" | "eraser" | "lasso" | "text" | "shape";

export type ElementKind =
  | "normal_curve"
  | "hyperbola"
  | "exp_decay"
  | "log_curve"
  | "sin_curve"
  | "tan_curve"
  | "semicircle"
  | "quadrant"
  | "matrix"
  | "table"
  | "determinant"
  | "axis"
  | "distribution"
  | "function"
  | "vector"
  | "circle"
  | "rect"
  | "triangle"
  | "line_drawn";

export type DistributionKind = "normal" | "uniform" | "exponential" | "bimodal" | "skewed";

// A shape is described as crisp vector geometry (polylines + dots) in its own
// local coordinate space (0,0)-(width,height). It is rendered with anti-aliased
// Skia paths and scaled by the element transform, so it stays sharp at any zoom.
export type ShapePolyline = {
  points: Array<[number, number]>;
  width?: number;
  color?: string;
  opacity?: number;
  closed?: boolean;
};

export type ShapeDot = {
  x: number;
  y: number;
  r: number;
  color?: string;
  opacity?: number;
};

export type ShapeGeometry = {
  width: number;
  height: number;
  version?: number;
  strokes: ShapePolyline[];
  dots?: ShapeDot[];
};

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
  objectScale?: number;
  // Per-axis scale for directional resize (horizontal/vertical compression).
  // Fall back to objectScale, then 1, when unset. See getElementScale.
  scaleX?: number;
  scaleY?: number;
  shapeGeo?: ShapeGeometry;
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
    }
  | {
      type: "erase-elements";
      pageId: string;
      elements: NoteElement[];
    }
  | {
      // Precision eraser: original strokes replaced by their surviving pieces.
      type: "split-strokes";
      pageId: string;
      removed: Stroke[];
      added: Stroke[];
    };

export type HistoryState = {
  done: InkAction[];
  undone: InkAction[];
};
