export const ROUTE_OPTION_LABEL_MESSAGE_KEYS = {
  TESKEID_EXPERIMENTAL: 'roadMapPrototypeRouteLabelExperimental',
  TESKEID_DERIVED_DURATION: 'roadMapPrototypeRouteLabelDerivedDuration',
  TESKEID_ALTERNATIVE: 'roadMapPrototypeRouteLabelAlternative',
  TESKEID_GRAVEL: 'roadMapPrototypeRouteLabelGravel',
  TESKEID_MIXED_SURFACE: 'roadMapPrototypeRouteLabelMixedSurface',
  TESKEID_UNKNOWN_SURFACE: 'roadMapPrototypeRouteLabelUnknownSurface',
  TESKEID_LONG_SNAP: 'roadMapPrototypeRouteLabelLongSnap',
} as const

export type RouteOptionLabelMessageKey =
  typeof ROUTE_OPTION_LABEL_MESSAGE_KEYS[keyof typeof ROUTE_OPTION_LABEL_MESSAGE_KEYS]

/**
 * Maps internal route flags to user-facing message keys. Unknown/internal flags
 * deliberately return null so implementation constants never leak into cards.
 */
export function routeOptionLabelMessageKey(label: string): RouteOptionLabelMessageKey | null {
  return ROUTE_OPTION_LABEL_MESSAGE_KEYS[
    label as keyof typeof ROUTE_OPTION_LABEL_MESSAGE_KEYS
  ] ?? null
}
