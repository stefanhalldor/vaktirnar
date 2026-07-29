/**
 * Explicit product-curated relations only. Runtime name parsing, postcode
 * arithmetic, and nearest-settlement guesses are intentionally not allowed.
 */
export type RuralPostalAssessmentMapping = Readonly<{
  postalCode: string
  postalLocalitySourceId: string
  expectedPostalLocalityName: string
  expectedPostalLocalityClassification: string
  assessmentSettlementId: string
  expectedSettlementName: string
  provenance: 'stebbi_product_decision_2026_07_29'
}>

export const RURAL_POSTAL_ASSESSMENT_MAPPINGS = [
  {
    postalCode: '851',
    postalLocalitySourceId: '453b1695-1c60-4a6e-3a69-fd9620c3adb0',
    expectedPostalLocalityName: 'Hella, dreifbýli',
    expectedPostalLocalityClassification: 'Dreifbýli',
    assessmentSettlementId: 'hagstofa:1120',
    expectedSettlementName: 'Hella',
    provenance: 'stebbi_product_decision_2026_07_29',
  },
] as const satisfies readonly RuralPostalAssessmentMapping[]

const mappingByPostalCode = new Map<string, RuralPostalAssessmentMapping>(
  RURAL_POSTAL_ASSESSMENT_MAPPINGS.map(mapping => [mapping.postalCode, mapping]),
)

export function getRuralPostalAssessmentMapping(
  postalCode: string | null | undefined,
): RuralPostalAssessmentMapping | null {
  return postalCode ? mappingByPostalCode.get(postalCode) ?? null : null
}
