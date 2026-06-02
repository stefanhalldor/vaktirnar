const ICELANDIC_MAP: Record<string, string> = {
  á: 'a', Á: 'a',
  é: 'e', É: 'e',
  í: 'i', Í: 'i',
  ó: 'o', Ó: 'o',
  ú: 'u', Ú: 'u',
  ý: 'y', Ý: 'y',
  ð: 'd', Ð: 'd',
  þ: 'th', Þ: 'th',
  æ: 'ae', Æ: 'ae',
  ö: 'o', Ö: 'o',
}

export function slugify(text: string): string {
  return text
    .split('')
    .map((char) => ICELANDIC_MAP[char] ?? char)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

