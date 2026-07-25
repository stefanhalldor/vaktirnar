# TODO #091 — Sticky comparison-header occlusion fix

Created: 2026-07-25 10:29  
Timezone: Atlantic/Reykjavik

## Finding

Sticky station/date headers notuðu `bg-background/95` og blur. Scrolluð
veðurgildi sáust því í gegnum hálfgegnsæjan hausinn, eins og þau væru fyrir
ofan eða inni í sticky röðinni.

## Samþykkt

Stebbi gaf Codex skýrt leyfi til að framkvæma sticky-lagfæringuna.

Ekki samþykkt: commit, push, deploy, migration eða production.

## Hvað var gert

- Sticky haus fyrir töflur með allt að þrjár stöðvar notar nú fullkomlega
  ógegnsæjan `bg-background`.
- `backdrop-blur` og 95% opacity voru fjarlægð.
- `isolate` og léttur shadow skilja sticky lagið skýrt frá scrolluðu efni.
- Sama occlusion-lagfæring var sett á top-left og date headers í breiðu
  töflunni svo bæði responsive table variants hegði sér eins.

## Skrár breyttar

- `components/weather/WeatherChasePanel.tsx`
- Þessi handoff-skrá

## Check

```text
git diff --check -- components/weather/WeatherChasePanel.tsx
Exit code: 0
```

Engin test suite, build eða dev-server aðgerð var keyrð fyrir þessa
class-only breytingu. V036 inniheldur nýjasta type-check; v035 inniheldur
græna fulla suite og production build.

## Design.md

Ógegnsær sticky haus varðveitir skýra hierarchy og kemur í veg fyrir
sjónrænt overlap á mobile. Engin input-, navigation- eða zoom-hegðun
breyttist.

## Localhost checks for Stebbi

Á public Akstursskjánum:

1. Velja 1–3 stöðvar og scrolla samanburðartöflunni niður.
2. Vænt: stöðvanöfn/provider badges sitja sticky.
3. Vænt: hitastig, vindur og úrkoma sem scrolla undir hausinn sjást ekki í
   gegn eða fyrir ofan hann.
4. Prófa einnig 4+ stöðvar og lárétt/vertical scroll.
5. Vænt: date header og top-left horn eru einnig ógegnsæ.
6. Prófa ljós og dökk litastef ef dark mode er tiltækt.

## Release guidance fyrir Claude Code

Þetta handoff kemur á eftir v035 og v036. Claude Code skal taka þessa
`WeatherChasePanel.tsx` breytingu með í sama release candidate, útiloka
`.obsidian/workspace.json` og fylgja release/Vercel workflow úr v035.

## Route intelligence check

Þetta er eingöngu CSS presentation á samanburðartöflu. Engin route-, station-,
provider-, auth-, RLS- eða Supabase-lógík breyttist.

