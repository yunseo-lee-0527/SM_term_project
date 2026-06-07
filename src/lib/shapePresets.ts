import type { InkPoint, NoteElement, ShapeDot, ShapeGeometry, ShapePolyline } from "../types/ink";
import { clamp, distance, pointToSegmentDistance } from "./geometry";

// Bump when the generated geometry changes so persisted elements regenerate.
const GEO_VERSION = 5;

const GRAPH_WIDTH = 230;
const GRAPH_HEIGHT = 124;

// Line widths are in the shape's local units (≈ page units at objectScale 1).
const LINE = 3;
const BRACKET = 4;
const DOT_R = 2.6;
const DOT_COLOR = "#94a3b8";
const DOT_OPACITY = 0.76;

type Point = [number, number];

function geo(width: number, height: number, strokes: ShapePolyline[], dots?: ShapeDot[]): ShapeGeometry {
  return { width, height, version: GEO_VERSION, strokes, dots };
}

function line(points: Point[], width = LINE): ShapePolyline {
  return { points, width };
}

function arcPoints(cx: number, cy: number, r: number, start: number, end: number, samples = 96): Point[] {
  return Array.from({ length: samples }, (_, index) => {
    const t = index / (samples - 1);
    const angle = start + (end - start) * t;

    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  });
}

function sampleGraph(yAt: (x: number) => number, samples = 160): Point[] {
  return Array.from({ length: samples }, (_, index) => {
    const t = index / (samples - 1);
    return [t * GRAPH_WIDTH, 94 - clamp(yAt(t), -1.4, 1.4) * 70];
  });
}

function sampleFunction(
  startPercent: number,
  endPercent: number,
  xAt: (t: number) => number,
  yAt: (x: number) => number,
  amplitude = 30,
  samples = 140,
): Point[] {
  const startX = (startPercent / 100) * GRAPH_WIDTH;
  const endX = (endPercent / 100) * GRAPH_WIDTH;
  const centerY = GRAPH_HEIGHT * 0.56;

  return Array.from({ length: samples }, (_, index) => {
    const t = index / (samples - 1);
    const x = startX + (endX - startX) * t;
    const y = centerY - clamp(yAt(xAt(t)), -2.5, 2.5) * amplitude;

    return [x, y];
  });
}

function graphGeometry(lines: Point[][], width = GRAPH_WIDTH, height = GRAPH_HEIGHT): ShapeGeometry {
  return geo(
    width,
    height,
    lines.map((points) => line(points)),
  );
}

// tan(x) over just the principal branch (-π/2 … π/2): map x linearly to the
// angle (like sin) and plot tan, trimming the ends near the asymptotes so the
// single S-curve stays inside the box.
function createTanGeometry(): ShapeGeometry {
  const width = GRAPH_WIDTH;
  const height = GRAPH_HEIGHT;
  const centerY = height / 2;
  const halfExtent = height / 2 - 12; // vertical headroom inside the box
  const cutTan = 5; // trim the curve where |tan| exceeds this (near the asymptotes)
  const vscale = halfExtent / cutTan;
  const angleStart = -Math.PI / 2; // principal branch only
  const angleSpan = Math.PI;
  const samples = 240;

  const branches: Point[][] = [];
  let current: Point[] = [];

  for (let index = 0; index < samples; index += 1) {
    const t = index / (samples - 1);
    const value = Math.tan(angleStart + t * angleSpan);

    if (!Number.isFinite(value) || Math.abs(value) > cutTan) {
      if (current.length > 1) {
        branches.push(current);
      }
      current = [];
      continue;
    }

    current.push([t * width, centerY - value * vscale]);
  }

  if (current.length > 1) {
    branches.push(current);
  }

  return graphGeometry(branches, width, height);
}

function createSemicircleGeometry(radius = 62): ShapeGeometry {
  const width = radius * 2 + 24;
  const height = radius + 28;
  const y = radius + 12;
  const cx = radius + 12;

  return geo(width, height, [line(arcPoints(cx, y, radius, Math.PI, Math.PI * 2)), line([[12, y], [radius * 2 + 12, y]])]);
}

function createQuadrantGeometry(radius = 68): ShapeGeometry {
  const width = radius * 2 + 24;
  const height = radius + 34;
  const cx = radius + 12;
  const cy = radius + 12;

  // Closed quarter disk: center → top edge → arc → right edge → back to center.
  const arc = arcPoints(cx, cy, radius, -Math.PI / 2, 0);

  return geo(width, height, [line([[cx, cy], ...arc, [cx, cy]])]);
}

function bracketDots(rows: number, cols: number, offsetX: number, offsetY: number, cell: number): ShapeDot[] {
  const dots: ShapeDot[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      dots.push({ x: offsetX + col * cell, y: offsetY + row * cell, r: DOT_R, color: DOT_COLOR, opacity: DOT_OPACITY });
    }
  }

  return dots;
}

function createMatrixGeometry(rows: number, cols: number): ShapeGeometry {
  const cell = 42;
  const width = cols * cell + 38;
  const height = rows * cell + 22;

  const leftBracket = line([[12, 4], [3, 4], [3, height - 4], [12, height - 4]], BRACKET);
  const rightBracket = line([[width - 12, 4], [width - 3, 4], [width - 3, height - 4], [width - 12, height - 4]], BRACKET);

  return geo(width, height, [leftBracket, rightBracket], bracketDots(rows, cols, 27, 20, cell));
}

function createDeterminantGeometry(rows: number, cols: number): ShapeGeometry {
  const cell = 38;
  const width = cols * cell + 32;
  const height = rows * cell + 18;

  const leftBar = line([[8, 4], [8, height - 4]], BRACKET);
  const rightBar = line([[width - 8, 4], [width - 8, height - 4]], BRACKET);

  return geo(width, height, [leftBar, rightBar], bracketDots(rows, cols, 24, 18, cell));
}

function createTableGeometry(rows: number, cols: number, width = 190): ShapeGeometry {
  const height = Math.max(64, rows * 32);
  const strokes: ShapePolyline[] = [];

  for (let row = 0; row <= rows; row += 1) {
    const y = (row * height) / rows;
    strokes.push(line([[0, y], [width, y]], row === 0 || row === rows ? BRACKET : LINE));
  }

  for (let col = 0; col <= cols; col += 1) {
    const x = (col * width) / cols;
    strokes.push(line([[x, 0], [x, height]], col === 0 || col === cols ? BRACKET : LINE));
  }

  return geo(width, height, strokes);
}

export function createShapeGeometry(element: NoteElement): ShapeGeometry {
  const rows = Math.round(clamp(element.rows ?? 3, 1, 8));
  const cols = Math.round(clamp(element.cols ?? 3, 1, 8));

  switch (element.kind) {
    case "normal_curve":
      return graphGeometry([sampleGraph((x) => Math.exp(-0.5 * ((x - 0.5) / 0.16) ** 2))]);
    case "hyperbola":
      return graphGeometry([
        sampleFunction(0, 45, (t) => -3 + t * 2.45, (x) => 1 / x, 42),
        sampleFunction(55, 100, (t) => 0.55 + t * 2.45, (x) => 1 / x, 42),
      ]);
    case "exp_decay":
      return graphGeometry([sampleGraph((x) => Math.exp(-4 * x))]);
    case "log_curve":
      return graphGeometry([sampleGraph((x) => Math.log(1 + x * 9) / Math.log(10))]);
    case "sin_curve":
      return graphGeometry([sampleFunction(0, 100, (t) => t * Math.PI * 2, (x) => Math.sin(x), 30)]);
    case "tan_curve":
      return createTanGeometry();
    case "semicircle":
      return createSemicircleGeometry(element.radius ?? 62);
    case "quadrant":
      return createQuadrantGeometry(element.radius ?? 68);
    case "matrix":
      return createMatrixGeometry(Math.min(rows, 6), Math.min(cols, 6));
    case "determinant":
      return createDeterminantGeometry(Math.min(rows, 6), Math.min(cols, 6));
    case "table":
      return createTableGeometry(rows, cols, element.length ?? 190);
    default:
      // Recognition-only kinds are dormant; fall back to a table so nothing crashes.
      return createTableGeometry(rows, cols, element.length ?? 190);
  }
}

export function withShapeGeometry(element: NoteElement): NoteElement {
  return {
    ...element,
    shapeGeo: createShapeGeometry(element),
  };
}

export function getShapeGeometry(element: NoteElement): ShapeGeometry {
  if (element.shapeGeo?.version === GEO_VERSION) {
    return element.shapeGeo;
  }

  return createShapeGeometry(element);
}

// Per-axis render scale. New directional resize writes scaleX/scaleY; older
// elements only have the uniform objectScale; default is 1.
export function getElementScale(element: NoteElement): { sx: number; sy: number } {
  const uniform = element.objectScale ?? 1;
  return { sx: element.scaleX ?? uniform, sy: element.scaleY ?? uniform };
}

// Hit test the eraser path against the shape's vector geometry. Works entirely
// in the shape's local coordinate space by mapping each eraser point into it.
export function elementIntersectsEraserPath(element: NoteElement, eraserPoints: InkPoint[], eraserRadius: number) {
  const shape = getShapeGeometry(element);
  const { sx, sy } = getElementScale(element);
  const minX = element.x - eraserRadius;
  const minY = element.y - eraserRadius;
  const maxX = element.x + shape.width * sx + eraserRadius;
  const maxY = element.y + shape.height * sy + eraserRadius;
  // Map the eraser radius into local space; use the larger axis factor so the
  // hit stays a little forgiving when one axis is compressed.
  const localRadius = eraserRadius / Math.min(sx, sy);

  for (const eraserPoint of eraserPoints) {
    if (eraserPoint.x < minX || eraserPoint.x > maxX || eraserPoint.y < minY || eraserPoint.y > maxY) {
      continue;
    }

    const local = { x: (eraserPoint.x - element.x) / sx, y: (eraserPoint.y - element.y) / sy };

    for (const stroke of shape.strokes) {
      const hitDistance = localRadius + (stroke.width ?? LINE) / 2;

      for (let index = 1; index < stroke.points.length; index += 1) {
        const a = { x: stroke.points[index - 1][0], y: stroke.points[index - 1][1] };
        const b = { x: stroke.points[index][0], y: stroke.points[index][1] };

        if (pointToSegmentDistance(local, a, b) <= hitDistance) {
          return true;
        }
      }
    }

    for (const dot of shape.dots ?? []) {
      if (distance(local, { x: dot.x, y: dot.y }) <= localRadius + dot.r) {
        return true;
      }
    }
  }

  return false;
}
