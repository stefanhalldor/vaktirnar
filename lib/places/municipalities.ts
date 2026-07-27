import type { MunicipalityNameMap } from './types'

export const HAGSTOFA_MUNICIPALITY_API_URL =
  'https://px.hagstofa.is/pxis/api/v1/is/Ibuar/mannfjoldi/2_byggdir/sveitarfelog/MAN02005.px'

/**
 * Division into municipalities as of 1 January 2026, from Hagstofa MAN02005.
 * This is a last-known-good fallback for HMS imports when PxWeb is unavailable.
 */
export const MUNICIPALITY_NAMES_2026: MunicipalityNameMap = Object.freeze({
  '0000': 'Reykjavíkurborg',
  '1000': 'Kópavogsbær',
  '1100': 'Seltjarnarnesbær',
  '1300': 'Garðabær',
  '1400': 'Hafnarfjarðarkaupstaður',
  '1604': 'Mosfellsbær',
  '1606': 'Kjósarhreppur',
  '2000': 'Reykjanesbær',
  '2300': 'Grindavíkurbær',
  '2506': 'Sveitarfélagið Vogar',
  '2510': 'Suðurnesjabær',
  '3000': 'Akraneskaupstaður',
  '3506': 'Skorradalshreppur',
  '3511': 'Hvalfjarðarsveit',
  '3609': 'Borgarbyggð',
  '3709': 'Grundarfjarðarbær',
  '3713': 'Eyja- og Miklaholtshreppur',
  '3714': 'Snæfellsbær',
  '3716': 'Sveitarfélagið Stykkishólmur',
  '3811': 'Dalabyggð',
  '4100': 'Bolungarvíkurkaupstaður',
  '4200': 'Ísafjarðarbær',
  '4502': 'Reykhólahreppur',
  '4604': 'Vesturbyggð',
  '4803': 'Súðavíkurhreppur',
  '4901': 'Árneshreppur',
  '4902': 'Kaldrananeshreppur',
  '4911': 'Strandabyggð',
  '5508': 'Húnaþing vestra',
  '5609': 'Sveitarfélagið Skagaströnd',
  '5613': 'Húnabyggð',
  '5716': 'Skagafjörður',
  '6000': 'Akureyrarbær',
  '6100': 'Norðurþing',
  '6250': 'Fjallabyggð',
  '6400': 'Dalvíkurbyggð',
  '6513': 'Eyjafjarðarsveit',
  '6515': 'Hörgársveit',
  '6601': 'Svalbarðsstrandarhreppur',
  '6602': 'Grýtubakkahreppur',
  '6611': 'Tjörneshreppur',
  '6613': 'Þingeyjarsveit',
  '6710': 'Langanesbyggð',
  '7300': 'Fjarðabyggð',
  '7400': 'Múlaþing',
  '7502': 'Vopnafjarðarhreppur',
  '7505': 'Fljótsdalshreppur',
  '8000': 'Vestmannaeyjabær',
  '8200': 'Sveitarfélagið Árborg',
  '8401': 'Sveitarfélagið Hornafjörður',
  '8508': 'Mýrdalshreppur',
  '8509': 'Skaftárhreppur',
  '8610': 'Ásahreppur',
  '8613': 'Rangárþing eystra',
  '8614': 'Rangárþing ytra',
  '8710': 'Hrunamannahreppur',
  '8716': 'Hveragerðisbær',
  '8717': 'Sveitarfélagið Ölfus',
  '8719': 'Grímsnes- og Grafningshreppur',
  '8720': 'Skeiða- og Gnúpverjahreppur',
  '8721': 'Bláskógabyggð',
  '8722': 'Flóahreppur',
})

type PxVariable = {
  code?: unknown
  values?: unknown
  valueTexts?: unknown
}
export function parseHagstofaMunicipalityMetadata(raw: unknown): MunicipalityNameMap | null {
  if (!raw || typeof raw !== 'object') return null
  const variables = (raw as { variables?: unknown }).variables
  if (!Array.isArray(variables)) return null
  const municipality = variables.find((value): value is PxVariable => (
    Boolean(value) && typeof value === 'object' && (value as PxVariable).code === 'Sveitarfélag'
  ))
  if (!municipality || !Array.isArray(municipality.values) || !Array.isArray(municipality.valueTexts)) {
    return null
  }
  if (municipality.values.length !== municipality.valueTexts.length) return null

  const names: Record<string, string> = {}
  for (let index = 0; index < municipality.values.length; index += 1) {
    const code = municipality.values[index]
    const name = municipality.valueTexts[index]
    if (typeof code !== 'string' || !/^\d{4}$/.test(code) || code === '9999') continue
    if (typeof name !== 'string' || !name.trim() || name.trim() === 'Alls') continue
    names[code] = name.trim()
  }

  // Reject partial or structurally wrong metadata and use the checked-in LKG.
  if (Object.keys(names).length < 50 || !names['0000'] || !names['7300']) return null
  return Object.freeze(names)
}

export type MunicipalityDirectoryResult = {
  names: MunicipalityNameMap
  source: 'hagstofa' | 'static'
}

export async function loadMunicipalityNames(options: {
  timeoutMs?: number
  fetchImpl?: typeof fetch
} = {}): Promise<MunicipalityDirectoryResult> {
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 8_000, 1_000), 30_000)
  const fetchImpl = options.fetchImpl ?? fetch
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(HAGSTOFA_MUNICIPALITY_API_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) return { names: MUNICIPALITY_NAMES_2026, source: 'static' }
    const parsed = parseHagstofaMunicipalityMetadata(await response.json())
    return parsed
      ? { names: parsed, source: 'hagstofa' }
      : { names: MUNICIPALITY_NAMES_2026, source: 'static' }
  } catch {
    return { names: MUNICIPALITY_NAMES_2026, source: 'static' }
  } finally {
    clearTimeout(timeout)
  }
}
