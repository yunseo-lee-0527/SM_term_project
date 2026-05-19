import { describe, expect, it } from "vitest";

import { PAPER_HEIGHT, PAPER_WIDTH } from "../constants/paper";
import type { InkPoint, Stroke } from "../types/ink";
import {
  fitPaperToStage,
  getStrokeWidthAt,
  pointToSegmentDistance,
  screenToPage,
  strokeIntersectsEraserPath,
} from "./geometry";

const point = (x: number, y: number, pressure = 0.5, time = 0): InkPoint => ({
  x,
  y,
  pressure,
  time,
});

const stroke = (points: InkPoint[]): Stroke => ({
  id: "stroke-1",
  tool: "pen",
  color: "#111827",
  baseWidth: 8,
  opacity: 1,
  points,
});

describe("geometry", () => {
  it("fits paper inside a stage without distorting the aspect ratio", () => {
    const frame = fitPaperToStage({ width: 1200, height: 900 }, 24);

    expect(frame.width / frame.height).toBeCloseTo(PAPER_WIDTH / PAPER_HEIGHT, 4);
    expect(frame.width).toBeLessThanOrEqual(1200);
    expect(frame.height).toBeLessThanOrEqual(900);
  });

  it("converts stage coordinates back into page coordinates", () => {
    const frame = fitPaperToStage({ width: 1000, height: 1200 }, 0);
    const transformed = screenToPage(frame.x + frame.width / 2 + 24, frame.y + frame.height / 2 + 12, {
      frame,
      zoom: 1,
      panX: 24,
      panY: 12,
    });

    expect(transformed.x).toBeCloseTo(PAPER_WIDTH / 2);
    expect(transformed.y).toBeCloseTo(PAPER_HEIGHT / 2);
  });

  it("measures distance from a point to a stroke segment", () => {
    expect(pointToSegmentDistance(point(5, 4), point(0, 0), point(10, 0))).toBeCloseTo(4);
    expect(pointToSegmentDistance(point(-4, 0), point(0, 0), point(10, 0))).toBeCloseTo(4);
  });

  it("detects whole-stroke eraser hits", () => {
    const inkStroke = stroke([point(10, 10), point(200, 10)]);

    expect(strokeIntersectsEraserPath(inkStroke, [point(80, 17)], 10)).toBe(true);
    expect(strokeIntersectsEraserPath(inkStroke, [point(80, 90)], 10)).toBe(false);
  });

  it("uses pressure when calculating pen width", () => {
    const lightStroke = stroke([point(0, 0, 0.2, 0), point(12, 0, 0.2, 16)]);
    const heavyStroke = stroke([point(0, 0, 1, 0), point(12, 0, 1, 16)]);

    expect(getStrokeWidthAt(heavyStroke, 1)).toBeGreaterThan(getStrokeWidthAt(lightStroke, 1));
  });
});
