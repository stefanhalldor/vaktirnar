/**
 * Explicit product-curated relations only. Runtime name parsing, postcode
 * arithmetic, and nearest-settlement guesses are intentionally not allowed.
 */
export type PostalAssessmentMapping = Readonly<{
  postalCode: string
  postalLocalitySourceId: string
  expectedPostalLocalityName: string
  expectedPostalLocalityClassification: string
  assessmentSettlementId: string
  expectedSettlementName: string
  provenance: 'stebbi_product_decision_2026_07_29'
}>

export type RuralPostalAssessmentMapping = PostalAssessmentMapping
export type UrbanPostalAssessmentMapping = PostalAssessmentMapping

/**
 * Explicit urban postcode identities used only after exact settlement
 * containment has failed. These are not nearest-place or name-based guesses:
 * every field is checked against the checked-in official directory at runtime.
 */
export const URBAN_POSTAL_ASSESSMENT_MAPPINGS = [
  {
    postalCode: '210',
    postalLocalitySourceId: 'e6b4bdfc-9fab-1237-49c4-15a90b99565f',
    expectedPostalLocalityName: 'Garðabær',
    expectedPostalLocalityClassification: 'Þéttbýli',
    assessmentSettlementId: 'is50v:1407fdee-3621-5c85-686f-8bd6a4316272',
    expectedSettlementName: 'Garðabær',
    provenance: 'stebbi_product_decision_2026_07_29',
  },
  {
    postalCode: '225',
    postalLocalitySourceId: 'b57a92df-8ed9-4603-6ab3-d0b5778be777',
    expectedPostalLocalityName: 'Garðabær',
    expectedPostalLocalityClassification: 'Þéttbýli',
    assessmentSettlementId: 'is50v:1407fdee-3621-5c85-686f-8bd6a4316272',
    expectedSettlementName: 'Garðabær',
    provenance: 'stebbi_product_decision_2026_07_29',
  },
] as const satisfies readonly UrbanPostalAssessmentMapping[]

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

const urbanMappingByPostalCode = new Map<string, UrbanPostalAssessmentMapping>(
  URBAN_POSTAL_ASSESSMENT_MAPPINGS.map(mapping => [mapping.postalCode, mapping]),
)

export function getUrbanPostalAssessmentMapping(
  postalCode: string | null | undefined,
): UrbanPostalAssessmentMapping | null {
  return postalCode ? urbanMappingByPostalCode.get(postalCode) ?? null : null
}

export function getRuralPostalAssessmentMapping(
  postalCode: string | null | undefined,
): RuralPostalAssessmentMapping | null {
  return postalCode ? mappingByPostalCode.get(postalCode) ?? null : null
}
