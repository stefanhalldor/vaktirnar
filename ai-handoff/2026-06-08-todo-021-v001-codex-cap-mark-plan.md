# TODO #21 - Codex plan fyrir derhúfumerkingu `10,5`

Dagsetning: 2026-06-08
Agent: Codex
Tengt TODO: #21 - Derhúfumerking verði `10,5`
Tengd atriði: #8, #5

## Niðurstaða Codex

TODO #21 er ekki einföld textabreyting. Canonical Teskeið-lógóið er generated
SVG path úr `feedback/images/teskeid-final-logo-reference.png`, ekki lifandi
textalag sem hægt er að skipta úr `A/10` eða `A&10` yfir í `10,5`.

Claude Code á því ekki að loka #21 með því að breyta bara preview-labelinu
`A&10 derhúfa`. Það væri rangt, því visualið sjálft væri enn óbreytt.

## Findings

### P2 - Production logo path inniheldur derhúfutextann sem vector shapes

Skrár:
- `components/teskeid/TeskeidLogo.tsx`
- `components/teskeid/teskeidLogoPaths.ts`
- `scripts/trace-teskeid-logo.mjs`

`teskeidLogoPaths.ts` er generated úr mynd. Merkingin er hluti af stórum
path-strengjum, ekki JSX texti.

### P3 - Preview/favicons vísa enn í `A&10`

Skrár:
- `app/preview/favicons/codex/page.tsx:21-24`
- `scripts/generate-teskeid-favicon-options.mjs:43-45`
- `public/favicon-options/cap-mark.svg` ef generated preview er til staðar

Preview-labelið má uppfæra, en aðeins eftir að visual/source hefur verið
uppfært.

## Örugg framkvæmdarröð

### Skref 1 - Finna öll visual source targets

Claude Code skal kortleggja:

- `feedback/images/teskeid-final-logo-reference.png`
- `feedback/images/teskeid-loader-and-cap-mark-reference.png`
- `components/teskeid/teskeidLogoPaths.ts`
- `public/teskeid-logo*.svg`
- `public/favicon-options/*.svg`
- `app/icon.svg`, `public/icon-192.png`, `public/icon-512.png`
- preview síður undir `app/preview/teskeid-logo/` og `app/preview/favicons/`

Athuga sérstaklega hvort untracked preview/assets séu til staðar og hvort þau
eigi að fara í commit eða vera áfram vinnugögn.

### Skref 2 - Velja aðferð áður en production logo er snert

Codex sér þrjár mögulegar leiðir:

1. **Best:** Búa til eða fá nýtt samþykkt source logo/reference þar sem derhúfan
   er `10,5`, og rekja/generate-a canonical paths aftur.
2. **Mögulegt preview-first:** Búa til local preview útgáfu með overlay eða
   nýrri vector-teikningu fyrir `10,5`, sýna Stebba og bíða samþykkis áður en
   production `TeskeidLogo` breytist.
3. **Ekki mælt með sem final:** Covera gamla path-textann með cream shape og
   setja `<text>10,5</text>` ofan á í production SVG. Þetta er fljótlegt en getur
   orðið font-dependent og brothætt í brand asseti.

### Skref 3 - Ef Claude Code gerir breytingu

- Breyta visualinu sjálfu, ekki aðeins label/copy.
- Halda stærð, andliti, hring, skeið, litum og öðrum formum óbreyttum eins mikið
  og hægt er.
- Tryggja læsileika við mobile logo stærðir og í favicon/cap preview.
- Uppfæra preview-label úr `A&10 derhúfa` í `10,5 derhúfa` þegar visualið er
  raunverulega breytt.
- Endurgenerate-a favicon options ef source paths breytast.

## Prófanir og staðfesting

Keyra:

```text
npm run type-check
npm run test:run -- teskeid-logo
npm run build
```

Ef preview/assets eru generated:

```text
node scripts/generate-teskeid-favicon-options.mjs
```

Athuga að `node scripts/generate-teskeid-favicon-options.mjs` skrifar í
`public/favicon-options/`, `app/icon.svg`, `public/icon-192.png` og
`public/icon-512.png`. Það er ekki read-only.

## Manual visual check

Stebbi eða Claude Code ætti að skoða:

- `/preview/teskeid-logo/codex`
- `/preview/favicons/codex`
- `/innskraning`
- `/auth-mvp/heim`
- eina `Lánað og skilað` síðu með bottom logo

Athuga sérstaklega 140 px, 160 px, 200 px, 16 px, 24 px og 32 px stærðir.

## Codex recommendation

Ekki loka #21 fyrr en Stebbi hefur séð visual preview með raunverulegu `10,5`.
Ef Stebbi vill hraða niðurstöðu núna, láta Claude Code fyrst gera preview-only
tillögu og bíða með production logo þar til hún er samþykkt.
