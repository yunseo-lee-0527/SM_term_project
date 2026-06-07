import { describe, expect, it } from "vitest";

import type { InkPoint, NoteElement } from "../types/ink";
import { createShapeGeometry, elementIntersectsEraserPath, getElementScale, getShapeGeometry } from "./shapePresets";

const makeElement = (overrides: Partial<NoteElement>): NoteElement => ({
  id: "test",
  kind: "normal_curve",
  x: 0,
  y: 0,
  color: "#111827",
  objectScale: 1,
  ...overrides,
});

const eraserPoint = (x: number, y: number): InkPoint => ({ x, y, time: 0, pressure: 0.5 });

describe("createShapeGeometry", () => {
  it("produces non-empty vector strokes with positive bounds for a curve", () => {
    const geo = createShapeGeometry(makeElement({ kind: "normal_curve" }));

    expect(geo.width).toBeGreaterThan(0);
    expect(geo.height).toBeGreaterThan(0);
    expect(geo.strokes.length).toBeGreaterThan(0);
    expect(geo.strokes[0].points.length).toBeGreaterThan(2);
  });

  it("draws only the principal tan branch, kept inside the box", () => {
    const geo = createShapeGeometry(makeElement({ kind: "tan_curve" }));

    // -π/2…π/2 → a single S-curve branch.
    expect(geo.strokes).toHaveLength(1);
    expect(geo.strokes[0].points.length).toBeGreaterThan(2);

    for (const [x, y] of geo.strokes[0].points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(geo.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(geo.height);
    }
  });

  it("emits one dot per cell plus two brackets for a matrix", () => {
    const geo = createShapeGeometry(makeElement({ kind: "matrix", rows: 2, cols: 3 }));

    expect(geo.strokes).toHaveLength(2);
    expect(geo.dots ?? []).toHaveLength(6);
  });

  it("regenerates geometry when the cached version is stale", () => {
    const element = makeElement({ kind: "normal_curve", shapeGeo: { width: 1, height: 1, version: 0, strokes: [] } });

    // Stale cached geometry (version 0) must be ignored and rebuilt.
    expect(getShapeGeometry(element).strokes.length).toBeGreaterThan(0);
  });
});

describe("elementIntersectsEraserPath", () => {
  it("hits when the eraser passes over the shape outline (with offset)", () => {
    const element = makeElement({ kind: "normal_curve", x: 100, y: 100 });
    const geo = getShapeGeometry(element);
    const localPoint = geo.strokes[0].points[Math.floor(geo.strokes[0].points.length / 2)];
    const pagePoint = eraserPoint(element.x + localPoint[0], element.y + localPoint[1]);

    expect(elementIntersectsEraserPath(element, [pagePoint], 4)).toBe(true);
  });

  it("misses when the eraser is far from the shape", () => {
    const element = makeElement({ kind: "normal_curve", x: 100, y: 100 });

    expect(elementIntersectsEraserPath(element, [eraserPoint(900, 900)], 4)).toBe(false);
  });

  it("respects objectScale when mapping eraser points into local space", () => {
    const element = makeElement({ kind: "matrix", rows: 2, cols: 2, x: 50, y: 60, objectScale: 2 });
    const geo = getShapeGeometry(element);
    const dot = (geo.dots ?? [])[0];
    const pagePoint = eraserPoint(element.x + dot.x * 2, element.y + dot.y * 2);

    expect(elementIntersectsEraserPath(element, [pagePoint], 3)).toBe(true);
  });

  it("respects independent scaleX/scaleY (horizontal compression)", () => {
    const element = makeElement({ kind: "matrix", rows: 2, cols: 2, x: 50, y: 60, scaleX: 0.5, scaleY: 1.5 });
    const geo = getShapeGeometry(element);
    const dot = (geo.dots ?? [])[0];
    const pagePoint = eraserPoint(element.x + dot.x * 0.5, element.y + dot.y * 1.5);

    expect(elementIntersectsEraserPath(element, [pagePoint], 3)).toBe(true);
  });
});

describe("getElementScale", () => {
  it("defaults to 1 on both axes", () => {
    expect(getElementScale(makeElement({ objectScale: undefined }))).toEqual({ sx: 1, sy: 1 });
  });

  it("falls back to the uniform objectScale when per-axis scale is unset", () => {
    expect(getElementScale(makeElement({ objectScale: 1.5 }))).toEqual({ sx: 1.5, sy: 1.5 });
  });

  it("prefers explicit scaleX/scaleY over objectScale", () => {
    expect(getElementScale(makeElement({ objectScale: 2, scaleX: 0.5, scaleY: 3 }))).toEqual({ sx: 0.5, sy: 3 });
  });
});
