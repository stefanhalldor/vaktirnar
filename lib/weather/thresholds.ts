export const WEATHER_THRESHOLDS = {
  caravan: {
    cautionWindMs: 13,
    redWindMs: 18,
    redGustMs: 25,
    cautionCrosswindMs: 10, // context only in Phase 1, does not affect stada
    redCrosswindMs: 15,     // context only in Phase 1, does not affect stada
  },
  golf: {
    discomfortWindMs: 13,
    hardWindMs: 17,
    eighteenHolesHours: 4.5,
  },
  dry: {
    maxPrecipMmPerHour: 0.1,
  },
  grill: {
    tooWindyMs: 8,
  },
  laundry: {
    goodDryHours: 4,
    helpfulWindMs: 3,
  },
  painting: {
    goodDryHours: 6,
  },
} as const
