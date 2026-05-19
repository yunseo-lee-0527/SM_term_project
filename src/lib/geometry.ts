import { GRID_SPACING, PAPER_HEIGHT, PAPER_WIDTH } from "../constants/paper";
import type { InkPoint, Stroke } from "../types/ink";

export type StageSize = {
  width: number;
  height: number;
};

export type PaperFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

export type ViewTransform = {
  frame: PaperFrame;
  zoom: number;
  panX: number;
  panY: number;
};

export type GridLine = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function distance(a: Pick<InkPoint, "x" | "y">, b: Pick<InkPoint, "x" | "y">) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function fitPaperToStage(stage: StageSize, margin = 32): PaperFrame {
  const availableWidth = Math.max(stage.width - margin * 2, 1);
  const availableHeight = Math.max(stage.height - margin * 2, 1);
  const scale = Math.min(availableWidth / PAPER_WIDTH, availableHeight / PAPER_HEIGHT);
  const width = PAPER_WIDTH * scale;
  const height = PAPER_HEIGHT * scale;

  return {
    x: (stage.width - width) / 2,
    y: (stage.height - height) / 2,
    width,
    height,
    scale,
  };
}

export function screenToPage(
  x: number,
  y: number,
  transform: ViewTransform,
): InkPoint {
  const scale = transform.frame.scale * transform.zoom;

  return {
    x: (x - transform.frame.x - transform.panX) / scale,
    y: (y - transform.frame.y - transform.panY) / scale,
    time: Date.now(),
    pressure: 0.5,
  };
}

export function isInsidePaper(point: Pick<InkPoint, "x" | "y">, overshoot = 0) {
  return (
    point.x >= -overshoot &&
    point.y >= -overshoot &&
    point.x <= PAPER_WIDTH + overshoot &&
    point.y <= PAPER_HEIGHT + overshoot
  );
}

export function clampPointToPaper(point: InkPoint): InkPoint {
  return {
    ...point,
    x: clamp(point.x, 0, PAPER_WIDTH),
    y: clamp(point.y, 0, PAPER_HEIGHT),
  };
}

export function expandStrokePoints(points: InkPoint[], maxGap = 18) {
  if (points.length < 2) {
    return points;
  }

  const expanded: InkPoint[] = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const gap = distance(previous, current);
    const steps = Math.max(1, Math.ceil(gap / maxGap));

    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      expanded.push({
        ...current,
        x: previous.x + (current.x - previous.x) * t,
        y: previous.y + (current.y - previous.y) * t,
        pressure: previous.pressure + (current.pressure - previous.pressure) * t,
        time: previous.time + (current.time - previous.time) * t,
      });
    }
  }

  return expanded;
}

export function smoothStrokePoints(points: InkPoint[], alpha = 0.62) {
  if (points.length < 3) {
    return points;
  }

  const smoothed: InkPoint[] = [points[0]];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = smoothed[smoothed.length - 1];
    const current = points[index];

    smoothed.push({
      ...current,
      x: previous.x * (1 - alpha) + current.x * alpha,
      y: previous.y * (1 - alpha) + current.y * alpha,
      pressure: previous.pressure * 0.35 + current.pressure * 0.65,
    });
  }

  smoothed.push(points[points.length - 1]);
  return smoothed;
}

export function prepareStrokePoints(points: InkPoint[]) {
  return smoothStrokePoints(expandStrokePoints(points));
}

export function getStrokeWidthAt(stroke: Stroke, pointIndex: number) {
  if (stroke.tool === "highlighter" || stroke.tool === "eraser") {
    return stroke.baseWidth;
  }

  const point = stroke.points[pointIndex];
  const previous = stroke.points[Math.max(pointIndex - 1, 0)] ?? point;
  const elapsed = Math.max(point.time - previous.time, 8);
  const velocity = distance(point, previous) / elapsed;
  const pressureFactor = 0.55 + clamp(point.pressure, 0.12, 1) * 0.9;
  const speedFactor = clamp(1.22 - velocity * 0.16, 0.58, 1.1);

  return clamp(stroke.baseWidth * pressureFactor * speedFactor, stroke.baseWidth * 0.45, stroke.baseWidth * 1.65);
}

export function pointToSegmentDistance(
  point: Pick<InkPoint, "x" | "y">,
  segmentStart: Pick<InkPoint, "x" | "y">,
  segmentEnd: Pick<InkPoint, "x" | "y">,
) {
  const dx = segmentEnd.x - segmentStart.x;
  const dy = segmentEnd.y - segmentStart.y;
  const segmentLengthSquared = dx * dx + dy * dy;

  if (segmentLengthSquared === 0) {
    return distance(point, segmentStart);
  }

  const t = clamp(
    ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / segmentLengthSquared,
    0,
    1,
  );

  return distance(point, {
    x: segmentStart.x + t * dx,
    y: segmentStart.y + t * dy,
  });
}

export function strokeIntersectsEraserPath(stroke: Stroke, eraserPoints: InkPoint[], eraserRadius: number) {
  if (stroke.points.length === 0 || eraserPoints.length === 0) {
    return false;
  }

  const points = prepareStrokePoints(stroke.points);
  const radius = eraserRadius + stroke.baseWidth * 0.5;

  if (points.length === 1) {
    return eraserPoints.some((eraserPoint) => distance(eraserPoint, points[0]) <= radius);
  }

  for (const eraserPoint of eraserPoints) {
    for (let index = 1; index < points.length; index += 1) {
      if (pointToSegmentDistance(eraserPoint, points[index - 1], points[index]) <= radius) {
        return true;
      }
    }
  }

  return false;
}

export function createGridLines() {
  const lines: GridLine[] = [];

  for (let x = GRID_SPACING; x < PAPER_WIDTH; x += GRID_SPACING) {
    lines.push({ x1: x, y1: 0, x2: x, y2: PAPER_HEIGHT });
  }

  for (let y = GRID_SPACING; y < PAPER_HEIGHT; y += GRID_SPACING) {
    lines.push({ x1: 0, y1: y, x2: PAPER_WIDTH, y2: y });
  }

  return lines;
}
