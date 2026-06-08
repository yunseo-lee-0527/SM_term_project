// A/B experiment variants (design doc §5–6). The app ships as one binary and
// switches behaviour at runtime from the session condition picked in the
// SessionSetupModal, so the same participant can run both arms (counterbalancing).
//
//   A (baseline)  — no shape insertion.
//   B (improved)  — shape insertion enabled.
// Both arms share the same discrete multi-page canvas.

export type AppVariant = "A" | "B";

export type FeatureFlags = {
  // Insert STEM shape objects (ShapePanel + Shapes tool).
  shapes: boolean;
  // Discrete rectangular pages with the left-hand PageStrip.
  multiPage: boolean;
};

const FEATURES: Record<AppVariant, FeatureFlags> = {
  A: { shapes: false, multiPage: true },
  B: { shapes: true, multiPage: true },
};

export const DEFAULT_VARIANT: AppVariant = "A";

export function featuresForVariant(variant: AppVariant): FeatureFlags {
  return FEATURES[variant] ?? FEATURES[DEFAULT_VARIANT];
}

// Map a free-form session condition string ("A" / "B" / "베이스라인" …) to a variant.
export function variantFromCondition(condition: string | undefined): AppVariant {
  return condition?.trim().toUpperCase().startsWith("B") ? "B" : "A";
}
