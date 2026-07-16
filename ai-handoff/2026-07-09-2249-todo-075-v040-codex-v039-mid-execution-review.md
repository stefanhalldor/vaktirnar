# Codex review: TODO #75 v039 - hviðuhreinsun stöðvuð mid-execution

Created: 2026-07-09 22:49
Timezone: Atlantic/Reykjavik
Rýnir á: `2026-07-09-2320-todo-075-v039-claude-gust-removal-mid-execution-handoff.md`
Tengist: TODO #75

## Findings

### Blocking: ekki halda áfram með núverandi stóra diff

Núverandi uncommitted breytingar eru stórar og ósamræmdar við nýjustu ákvörðun Stebba. `git diff --stat` sýnir:

```text
15 files changed, 184 insertions(+), 445 deletions(-)
```

Þetta er ekki lengur “klárum bara hviðuhreinsunina” verk. Forsendan breyttist: MET/Yr virðist hafa `wind_speed_of_gust`, en við treystum gæðunum/horizon ekki nógu vel enn. Þá er full eyðing úr types, parser, logic, tools, UI og tests of stór ákvörðun í þessu augnabliki.

**Ráðlegging:** Ekki committa eða deploya þetta diff. Stoppa hér.

### Blocking: v039 Leið A er ekki lengur besta sjálfgefna leiðin

v039 segir að Leið A, full hreinsun, sé enn rétt ef við höfum ekki trú á hviðugögnum. Ég er ósammála sem default eftir nýjustu upplýsingar.

Ef gögnin eru til en gæði/forecast horizon eru óljós, er betra að:

- vara notanda skýrt við og vísa á Vegagerðina;
- hætta við stóra structural cleanup í bili;
- skrá sér TODO um nákvæma meðhöndlun á hviðugögnum, t.d. “til”, “vantar”, “limited horizon”, “óáreiðanlegt fyrir ákvörðun”.

Að fjarlægja parsing og týpur alveg núna eykur líkurnar á rework þegar við tökum hviðugögnin aftur fyrir.

### Blocking: núverandi diff er líklega ekki type/test-ready

v039 segir sjálft að `travelAuditMap.helpers.test.ts` og `weather-tools.test.ts` séu ósnert og hafi TypeScript-villur. `rg` staðfestir líka enn margar gust/hviðu tilvísanir í testum:

- `lib/__tests__/travelAuditMap.helpers.test.ts`
- `lib/__tests__/weather-tools.test.ts`
- `lib/__tests__/weather-metno.test.ts`
- `lib/__tests__/weather-travel-api.test.ts`
- hlutar af `lib/__tests__/weather-forecast.test.ts`

Þetta má ekki fara áfram sem release diff nema Claude klári fulla test cleanup. En við eigum ekki að klára hana núna vegna breyttrar stefnu.

### High: besti næsti kúrsinn er “revert large diff, reapply tiny patch”

Þar sem ekkert er committað er einfaldasta örugga leiðin:

1. Claude Code stoppar og revert-ar stóra hviðuhreinsunar-diffið.
2. Claude Code endurinnleiðir aðeins lítinn patch:
   - nýja `weatherDisclaimer` textann í `messages/is.json` og `messages/en.json`;
   - birtingu disclaimer-textans inni í `Á leiðinni` boxinu sem hóflegt attention/info sub-row;
   - link á `https://umferdin.is/`.
3. Ekki fjarlægja hviður úr types, parser, thresholds, travel scoring, tools, drawer, comparison eða tests í þessum litla patch.
4. Búa til sér TODO/handoff um hviðugæði og fallback, ekki leysa það í þessu diffi.

Þetta passar best við núverandi ákvörðun Stebba: “setja bara þennan nýja disclaimer í Á leiðinni boxið og sleppa frekari breytingum í bili.”

### High: ekki keyra blind destructive restore ef aðrar breytingar leynast í sömu skrám

v039 segir að breytingarnar séu frá Claude og ócommittaðar. Samt þarf Claude að taka snapshot áður en revert er gert:

- `git diff --stat`
- `git diff --name-only`
- helst geyma diff í handoff eða local patch áður en það er hent

Síðan má revert-a með skýru leyfi Stebba. Þetta er destructive aðgerð á uncommitted changes, þannig að Claude á að fá skýrt framkvæmdarleyfi áður en hann gerir það.

### Medium: disclaimer placement er næstum rétt, en þarf að þrengja

Í núverandi diff birtist disclaimer inni í `Á leiðinni` section, en líka sem fallback fyrir utan þegar `Á leiðinni` section renderast ekki:

```tsx
{/* Disclaimer fallback — shown only when Á leiðinni section does not render */}
```

Stebbi sagði: “Setja í `Á leiðinni` boxið.” Ég myndi halda því þannig í v1:

- birta textann inni í `Á leiðinni` boxinu;
- ekki bæta nýjum fallback texta annars staðar nema Stebbi samþykki það sérstaklega;
- ef `Á leiðinni` section renderast ekki, þá er betra að sleppa textanum en að setja hann sem lausan footer og brjóta nýja summary-hönnun.

### Medium: halda hviðum í disclaimer, en ekki láta það fela að Teskeið sýni mögulega hviður annars staðar

Ef við revert-um stóra diffið mun núverandi baseline líklega enn sýna hviður í einhverjum UI hlutum. Það er ekki fullkomið, en er betra en hálfkláraður structural removal.

Þetta þarf að skrá sem opið TODO:

- Meta hvort hviðugildi úr MET/Yr eigi að birtast yfirhöfuð.
- Ef birt: sýna að þau séu “takmörkuð/óviss” og aðeins þar sem gögn eru raunverulega til.
- Ekki fallback-a vantar hviður í meðalvind án þess að merkja það.
- Ákveða hvort hviður mega ráða ferðamati eða aðeins birtast sem contextual warning.

## Verdict

Ekki velja Leið A núna.

Ég mæli með þessari leið:

> Revert-a stóra uncommitted hviðuhreinsunar-diffið og gera lítinn nýjan patch sem setur aðeins samþykktan disclaimer-texta inn í `Á leiðinni` boxið.

Ef Stebbi vill örlítið meiri tæknilega öryggisbreytingu samhliða disclaimer, þá er næsta minnsta mál:

> Fjarlægja bara fallbackið `wind_speed_of_gust ?? wind_speed` þannig að vantar hviður verði ekki falskar hviður.

En ég myndi gera það sem sér pínulítinn patch eða nýtt TODO, ekki blanda því við þessa fullu hreinsun.

## Copy/paste fyrir Claude Code

```md
Stoppaðu fulla hviðuhreinsun hér. Ný ákvörðun: við ætlum ekki að fjarlægja allt hviðutengt í bili.

Ráðlegging Codex v040:

1. Ekki committa eða deploya núverandi diff.
2. Taktu snapshot af núverandi diff í handoff/status.
3. Með skýru leyfi Stebba: revert-aðu stóra uncommitted hviðuhreinsunar-diffið.
4. Endurinnleiddu aðeins lítinn patch:
   - `weatherDisclaimer` í `messages/is.json`:
     “Athugaðu sérstaklega hviður og færð á <link>vef Vegagerðarinnar</link>. Þetta mat byggir á almennum spágögnum og kemur ekki í stað opinberra upplýsinga.”
   - eðlilega enska samsvörun í `messages/en.json`.
   - Birta textann inni í `Á leiðinni` boxinu sem hóflegt attention/info sub-row.
   - Linkurinn fer á `https://umferdin.is/`.
5. Ekki fjarlægja hviður úr types, parser, thresholds, travel logic, tools, drawer, comparison eða tests í þessu patchi.
6. Búa til TODO/handoff um hviðugæði og `wind_speed_of_gust ?? wind_speed` fallback síðar.
7. Keyra type-check/build eftir litla patchið.
8. Skila handoff með skrám, diff-samantekt, prófum og localhost checks.
```

## Localhost checks for Stebbi

Eftir litla disclaimer-only patchið:

1. Opna `/auth-mvp/vedrid` sem innskráður notandi.
2. Reikna leið sem skilar niðurstöðu og `Á leiðinni` kafla, t.d. Garðabær -> Akranes eða Akureyri -> Garðabær.
3. Í summary card:
   - `Á leiðinni` kaflinn á að innihalda attention/info textann:
     “Athugaðu sérstaklega hviður og færð á vef Vegagerðarinnar. Þetta mat byggir á almennum spágögnum og kemur ekki í stað opinberra upplýsinga.”
   - “vef Vegagerðarinnar” á að vera linkur á `https://umferdin.is/`.
   - Textinn á að vera inni í `Á leiðinni` boxinu, ekki laus neðst í cardinu.
   - Útlit á að vera hóflegt attention/info, ekki rauð villa.
4. Prófa mobile breidd 360-390 px:
   - enginn horizontal overflow;
   - textinn wrappar snyrtilega;
   - linkurinn er tappanlegur;
   - summary kaflarnir halda skýrri röð.
5. Regression:
   - Route calculation virkar enn.
   - Scrubber virkar enn.
   - Forecast drawer opnast enn.
   - Comparison strip/drawer er óbrotinn.
   - Núverandi hviðuvirkni breytist ekki í þessum patchi nema Stebbi samþykki það sérstaklega.

Ekki þarf SQL, Supabase, RLS, auth, secrets eða production gögn. Ekki keyra migration. Ekki deploya fyrr en Stebbi hefur prófað localhost.

## Commands run by Codex for this review

- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- `Get-Content -Encoding UTF8 ai-handoff/2026-07-09-2320-todo-075-v039-claude-gust-removal-mid-execution-handoff.md`
- `Get-Date -Format yyyy-MM-dd-HHmm`
- `git status --short --untracked-files=no`
- `git diff --stat`
- `rg -n "weatherDisclaimer|wind_speed_of_gust|windGustMs|redGustMs|metricGust|hvið|gust" app components lib messages --glob '!node_modules'`
- `git diff -- messages/is.json messages/en.json`
- `git diff -- lib/weather/forecast.ts app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `git diff -- app/api/teskeid/weather/travel/route.ts lib/weather/types.ts lib/weather/thresholds.ts lib/weather/travel.ts`
- `git diff -- components/weather/ForecastDrawer.tsx components/weather/DepartureHeatmap.tsx components/weather/travelAuditMap.helpers.ts components/weather/TravelAuditMap.tsx`
- `Get-Content -Encoding UTF8 TODO.md | Select-Object -First 220`

