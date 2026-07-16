/**
 * Shared geographic constants used by both the curated route registry
 * (google.server.ts) and the route caution matcher (routeCautions.ts).
 *
 * Centralised here so that bounds/via-point definitions stay in sync when
 * caution rules and curated alternate routes are updated together.
 */

export type Bounds = { minLat: number; maxLat: number; minLon: number; maxLon: number }

// ── Iceland-wide bounds ───────────────────────────────────────────────────────

/** Generous bounding box covering the whole of Iceland. */
export const ICELAND_BOUNDS: Bounds = { minLat: 63.0, maxLat: 67.0, minLon: -26.0, maxLon: -13.0 }

// ── Northern Westfjords ───────────────────────────────────────────────────────

/**
 * Northern/western Westfjords destination area.
 * Covers Ísafjörður (66.07, -23.13), Bolungarvík (66.15, -23.26), Súðavík (66.03, -23.00).
 * Verify coverage on localhost before adding new destinations.
 */
export const WESTFJORDS_NORTH_BOUNDS: Bounds = { minLat: 65.80, maxLat: 66.50, minLon: -25.0, maxLon: -22.00 }

/**
 * Via-point on Route 61 through Hólmavík.
 * A route that passes within HOLMAVIK_PROXIMITY_M of this point is considered
 * to use the safer Hólmavík corridor (Route 61).
 * Verify visually on localhost before each release.
 */
export const HOLMAVIK_VIA = { lat: 65.703, lon: -21.685 }

/**
 * Proximity radius used to decide whether a route passes "near" Hólmavík.
 * Used both for caution detection (routeCautions.ts) and curated duplicate
 * suppression (google.server.ts) so the two systems stay consistent.
 */
export const HOLMAVIK_PROXIMITY_M = 8_000

// ── Öxi / Axarvegur 939 ───────────────────────────────────────────────────────

/**
 * Via-point for the Öxi-avoid curated route. Located in the Reyðarfjörður area.
 * Shapes a Google route to go around the eastern fjords instead of through
 * Öxi / Road 939.
 * Verify visually on localhost that the shaped route does not use Road 939.
 */
export const REYDARFJORDUR_VIA = { lat: 65.0317, lon: -14.2183 }
