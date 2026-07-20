# Follow-up: v234 release — eftirstandandi atriði

Created: 2026-07-20 12:15
Timezone: Atlantic/Reykjavik
Agent: Claude Code
Relevant TODO: 086
Type: Post-release follow-up

## Samhengi

TODO 086 gefið út (commit á meðan þetta skjal er skrifað). Þessi skrá skráir hvað fór EKKI í útgáfuna og þarf að fylgja eftir.

## 1. Óinnleitt: unauthenticated `Nánar` → login → vista preference

**Núverandi hegðun:**
- `WeatherOverviewClient.tsx:141–155`: `statusFilterMode` vistast í localStorage og í DB þegar `menuVariant === 'authenticated'`.
- Óinnskráðir notendur geta skipt á milli `Einfalt` og `Nánar` — local state virkar — en preference vistast aldrei í DB.

**Það sem vantar:**
- Ef óinnskráður notandi smellir á `Nánar` (eða `Einfalt`) og skráir sig síðan inn:
  - Pending `statusFilterMode` geymist í sessionStorage.
  - `/auth-mvp/vedrid` les pending gildi eftir innskráningu og sendir PUT á `/api/teskeid/weather/preferences/thresholds`.

**Hvernig þetta á að líkjast:**
- Eins og pending/default wind-threshold flæðið sem er nú þegar til.
- Sjá `WeatherOverviewClient.tsx` fyrir wind-threshold pending-save pattern.

**Aðvörun:**
- Codex benti á þetta sem product-scope val, ekki tæknilegan bug. Ef Stebbi ákveður að þetta þurfi ekki, má loka þessum lið.

---

## 2. Low: hardcoded `#2563eb` í InfoWindow

**Staðsetning:** `components/weather/IcelandOverviewMap.tsx` — lína þar sem `linkEl.style.cssText = 'color:#2563eb;text-decoration:underline'` er sett.

**Vandinn:** InfoWindow link-liturinn notar hardcoded hex í stað Teskeið semantic tokens. Þar sem þetta er DOM content utan React/Tailwind er það erfiðara að nota tokens beint.

**Mögulegar lausnir:**
- Lesa CSS custom property gildi af `document.documentElement` við renderingu og nota það sem fallback.
- Nota `--primary` CSS variable ef það er til staðar í Teskeið design tokens.
- Lágmarks-lausn: skipta `#2563eb` yfir í Tailwind primary hex frá Design.md.

**Forgangur:** lágur — aðeins sjúnar vandamál, engin hegðun brotnar.

---

## 3. Athugasemd: `.obsidian/workspace.json`

Þessi skrá er breytt í working tree og var vísvitandi sleppt úr release commit. Hún er editor-state og á ekki að fara í repo nema sérstaklega er óskað eftir því. Ef Stebbi vill commit-a hana, gera það sérstaklega.

---

## Næstu skref (ef á við)

1. Ef pending-preference flæðið á að útfærast: skoða wind-threshold sessionStorage pattern í `WeatherOverviewClient.tsx` sem fyrirmynd.
2. Hardcoded link color: lágmarksbót — breyta `#2563eb` í réttan Design.md primary hex.
3. `.obsidian` breytingar: sleppa eða commit-a sérstaklega eftir þörfum.
