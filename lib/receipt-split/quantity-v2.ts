/** Standalone v2 only. The shared Expense/JSON milli contract stays at 1000. */
export const SPLIT_QUANTITY_VERSION = 2 as const
export const SPLIT_QUANTITY_SCALE = 3000 as const
export const MAX_SPLIT_QUANTITY_UNITS = 3_000_000

export function legacyMilliToUnits(milli: number): number {
  if (!Number.isSafeInteger(milli) || milli < 0 || milli > 1_000_000) throw new Error('invalid_quantity')
  return milli * 3
}

/** No float rounding. Accept exactly representable decimals or simple fractions. */
export function parseQuantityUnits(raw: string): number | null {
  const value = raw.trim().replace(',', '.')
  if (value.length > 40) return null
  let numerator: bigint
  let denominator: bigint
  const fraction = /^(\d+)\s*\/\s*(\d+)$/.exec(value)
  const decimal = /^(\d+)(?:\.(\d+))?$/.exec(value)
  if (fraction) {
    numerator = BigInt(fraction[1]); denominator = BigInt(fraction[2])
  } else if (decimal) {
    const tail = decimal[2] ?? ''
    denominator = BigInt(10) ** BigInt(tail.length)
    numerator = BigInt(decimal[1]) * denominator + BigInt(tail || '0')
  } else return null
  if (denominator === BigInt(0)) return null
  const scaled = numerator * BigInt(SPLIT_QUANTITY_SCALE)
  if (scaled % denominator !== BigInt(0)) return null
  const result = scaled / denominator
  return result <= BigInt(MAX_SPLIT_QUANTITY_UNITS) ? Number(result) : null
}

function gcd(a: number, b: number): number {
  while (b) { const next = a % b; a = b; b = next }
  return a
}
export function quantityInput(units: number): string {
  if (!Number.isSafeInteger(units) || units < 0 || units > MAX_SPLIT_QUANTITY_UNITS) throw new Error('invalid_quantity')
  if (units % 3 === 0) {
    const milli = units / 3
    const tail = String(milli % 1000).padStart(3, '0').replace(/0+$/, '')
    return String(Math.floor(milli / 1000)) + (tail ? '.' + tail : '')
  }
  const divisor = gcd(units, SPLIT_QUANTITY_SCALE)
  return (units / divisor) + '/' + (SPLIT_QUANTITY_SCALE / divisor)
}
export function formatQuantity(units: number): string {
  const whole = Math.floor(units / SPLIT_QUANTITY_SCALE)
  const remainder = units % SPLIT_QUANTITY_SCALE
  const glyph = ({ 750: '¼', 1000: '⅓', 1500: '½', 2000: '⅔', 2250: '¾' } as Record<number, string>)[remainder]
  return glyph ? (whole ? String(whole) : '') + glyph : quantityInput(units)
}
export function stepQuantity(units: number, direction: -1 | 1, maximum: number): number {
  const steps = [0, 750, 1000, 1500]
  for (let n = SPLIT_QUANTITY_SCALE; n <= maximum; n += SPLIT_QUANTITY_SCALE) steps.push(n)
  if (!steps.includes(maximum)) steps.push(maximum)
  const allowed = steps.filter(n => n <= maximum).sort((a, b) => a - b)
  return direction === 1 ? allowed.find(n => n > units) ?? maximum
    : [...allowed].reverse().find(n => n < units) ?? 0
}
