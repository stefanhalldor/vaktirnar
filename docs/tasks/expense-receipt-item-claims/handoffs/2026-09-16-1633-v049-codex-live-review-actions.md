# Raunskjár: tilbúnir takkar og tvöföld staðfesting

Date: 2026-09-16 16:33
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive issue: `516ec885-9521-4d84-8350-9219ac829695`

## Plan áfangans

Laga readiness-lit aðgerðatakka og færa tvöfalda staðfestingu á raunverulega
`SplitBoardV2` skjáinn sem localhost-skjámynd Stebba sýndi.

## Hvað var raunverulega gert

- Myndatakkinn er hvítur og disabled þar til gild JPG/PNG/WebP mynd, 1–10 MB,
  hefur verið valin; þá verður hann grænn og virkur.
- JSON-takkinn er hvítur og disabled þar til textaboxið inniheldur texta; þá
  verður hann grænn og virkur.
- `SplitBoardV2` sýnir confirm fyrir ofan „Liðir á kvittun“ og aftur eftir
  „Bæta við lið“.
- Báðir confirm-takkar deila mutation/pending-state og scrolla efst eftir
  farsælt svar, áður en route-gögn eru endurhlaðin.

## Skrár sem voru skoðaðar

- `WORKFLOW.md`, `Design.md`
- `components/receipt-split/SplitImport.tsx`
- `components/receipt-split/SplitBoardV2.tsx`
- nálæg UI-próf og fyrri v048 handoff

## Skrár sem voru breyttar

- `components/receipt-split/SplitImport.tsx`
- `components/receipt-split/SplitBoardV2.tsx`
- tvær viðeigandi UI-prófskrár
- canonical task og þessi handoff-skrá

## Skipanir og niðurstöður

- Focused Vitest: 2 skrár, 21/21 PASS, exit 0.
- Scoped ESLint: PASS, exit 0.
- Type-check: PASS, exit 0.

## Hvað mistókst eða var sleppt

Fyrri v048 breyting lenti í eldri expense-review component og sást því ekki á
screenshot-skjánum. Hún er samræmd sömu ósk en leysti ekki live v2 skjáinn.
Engin SQL-keyrsla, commit, push, deploy eða env-breyting var framkvæmd.

## Ákvarðanir

Hvít secondary-framsetning táknar ótilbúna aðgerð; grænt primary birtist aðeins
þegar eigin input leiðarinnar er gilt. Enginn sticky/floating takki var búinn til.
Þetta fylgir mobile-first og einni sterkri primary-aðgerð í `Design.md`.

## Áhætta sem er enn til staðar

Raunbrowser mobile röðun og scroll þarf localhost smoke. Sjálfvirku prófin verja
disabled/litastöðu, DOM-röð, eina mutation og success-scroll.

## Næsta skref og workflow-stopp

SQL185 read-only postflight er áfram næsta ytri gátt. Ekki endurkeyra migration.

## Spurningar fyrir rýni

Engin blocking spurning. Staðfesta live v2 skjáinn á localhost fyrir release.

## Supabase-áhrif

Engin frá þessari breytingu. SQL185 migration Success stendur; postflight er
enn ókeyrt.

## Breytingar á verkefnalýsingu

Canonical task skráir localhost-frávikið, live v2 lagfæringuna, readiness-litina
og grænt 21/21/type/lint evidence. SQL-gátt breyttist ekki.

## Localhost checks for Stebbi

1. Á upphafsskjá eiga báðir aðgerðatakkar að vera hvítir og óvirkir.
2. Velja gilda mynd: aðeins myndatakkinn verður grænn og virkur.
3. Fjarlægja mynd og setja texta í JSON-reit: aðeins neðri takkinn verður grænn.
4. Opna review með mörgum liðum: confirm sé beint fyrir ofan „Liðir á kvittun“
   og aftur fyrir neðan „Bæta við lið“.
5. Staðfesta með hvorum takka og búast við skiptingu efst á síðunni.

Prófa við 360/390/460 px með eigin eða synthetic reikningi; passa overflow,
pending-state og að villa scrolli ekki frá samhengi.

## Óvissa / þarf að staðfesta

Confidence er hátt á component/prófahegðun. Raunbrowser localhost smoke bíður.
