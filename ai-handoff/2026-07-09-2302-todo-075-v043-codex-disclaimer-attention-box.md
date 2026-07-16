# Codex handoff: TODO #75 v043 - gera Vegagerðar-disclaimer að varúðarboxi

Created: 2026-07-09 23:02
Timezone: Atlantic/Reykjavik
Tengist: TODO #75, v041/v042 disclaimer patch

## Markmið

Stebbi samþykkti nýjan disclaimer texta:

> Athugaðu sérstaklega hviður og færð á <link>vef Vegagerðarinnar</link>. Þetta mat byggir á almennum spágögnum og kemur ekki í stað opinberra upplýsinga.

Textinn er núna kominn inn, en hann birtist sem venjulegur langur `text-xs text-muted-foreground` paragraph. Í viðmótinu lítur hann út eins og langur texti sem auðvelt er að skima framhjá.

Markmið v043 er að gera þetta að litlu, læsilegu varúðar-/attention boxi inni í `Á leiðinni` kaflanum.

## Scope

### In scope

- Aðeins UI framsetning á `weatherDisclaimer` í `app/auth-mvp/vedrid/FerdalagidClient.tsx`.
- Halda textanum úr `messages/is.json` og `messages/en.json` óbreyttum nema augljós þýðingarvilla finnist.
- Varúðarboxið á að vera inni í `Á leiðinni` structured summary kaflanum.
- Linkurinn `vef Vegagerðarinnar` á áfram að fara á `https://umferdin.is/`.

### Out of scope

- Engar breytingar á hviðugögnum, parser, `wind_speed_of_gust`, thresholds, travel logic, ForecastDrawer, comparison strip eða tests.
- Ekki nota stashið `hviðuhreinsun-v035-v038-stöðvuð-v040`.
- Engar SQL, Supabase, RLS, auth, secrets, commit, push eða deploy breytingar.

## UI leiðbeining

Fylgja `Design.md`:

- Þetta er structured summary panel, ekki kort inni í korti.
- Nota compact row/box, ekki stórt nested card.
- Amber/attention má nota fyrir varúð, en ekki rauða villu.
- Status-litur má ekki vera eina merkingin.
- Mobile-first: textinn má ekki valda horizontal overflowi á 360-390 px.

Tillaga að framsetningu:

- Lítið `div` undir vind/úrkomu/hita línunni í `Á leiðinni`.
- `rounded-md` eða sambærilegt, ekki stórt kort.
- Hlýr ljós amber eða neutral bakgrunnur.
- Fíngerð border eða vinstri lína.
- Icon má vera `AlertTriangle`, `Info` eða sambærilegt lucide icon ef það passar við núverandi imports. Ef það kallar á of mikið import-rask, má sleppa iconi.
- Texti `text-xs` eða `text-[11px]`, með link undirstrikuðum og læsilegum.

Dæmi um útlit, ekki skylda nákvæm kóði:

```tsx
<div className="mt-2 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-relaxed text-amber-950">
  {tf.rich('weatherDisclaimer', {
    link: (chunks) => (
      <a href="https://umferdin.is/" target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
        {chunks}
      </a>
    ),
  })}
</div>
```

Ef dark mode er notað í þessum hluta þarf að bæta við mildum `dark:` klösum. Ef appið notar semantic tokens frekar en amber classes, velja þá nálægustu existing attention-token leiðina.

## Fallback utan `Á leiðinni`

Núna er `weatherDisclaimer` líka renderað sem fallback neðar í cardinu þegar `Á leiðinni` section renderast ekki.

Stebbi sagði að þetta eigi að fara í `Á leiðinni` boxið. Ráðlegging:

- Ekki gera fallbackið meira áberandi núna.
- Annaðhvort:
  1. fjarlægja fallbackið; eða
  2. láta fallbackið vera óbreytt ef Claude vill forðast hegðunarbreytingu.

Ef fallbackið er látið vera, nefna það skýrt í handoff að textinn getur enn birtst sem laus paragraph í edge case þegar `Á leiðinni` section renderast ekki.

Mín ráðlegging er að fjarlægja fallbackið til að fylgja ósk Stebba nákvæmlega, nema Claude Code sjái augljóst tilfelli þar sem öryggistextinn myndi annars aldrei birtast í venjulegu niðurstöðuflæði.

## Acceptance criteria

- `weatherDisclaimer` birtist í varúðarboxi inni í `Á leiðinni` kaflanum.
- Boxið er læsilegt og skimanlegt, ekki langur laus texti.
- Boxið er hóflegt attention/info, ekki rauð villa.
- Linkurinn fer á `https://umferdin.is/`.
- Textinn wrappar snyrtilega á mobile.
- Engar breytingar á hviðulogic eða veðurútreikningi.
- `npm run type-check` og helst `npm run build` græn.

## Localhost checks for Stebbi

1. Opna `/auth-mvp/vedrid` sem innskráður notandi.
2. Reikna leið sem sýnir `Á leiðinni`, t.d. Egilsstaðir -> Garðabær eða Garðabær -> Akranes.
3. Staðfesta að disclaimerinn birtist sem lítið varúðarbox inni í `Á leiðinni`, undir línunni með vindi/úrkomu/hita.
4. Staðfesta að boxið sé fallegra og auðlesnara en langur paragraph.
5. Smella á `vef Vegagerðarinnar` og staðfesta að linkurinn fari á `https://umferdin.is/`.
6. Prófa mobile 360-390 px:
   - enginn horizontal overflow;
   - textinn wrappar snyrtilega;
   - linkurinn er tappanlegur;
   - `Á leiðinni`, `Áfangastaður` og comparison-kaflinn halda skýrri röð.
7. Regression:
   - route calculation virkar;
   - scrubber virkar;
   - Forecast drawer opnast;
   - comparison strip/drawer brotnar ekki;
   - hviðuvirkni er óbreytt fyrir utan disclaimer copy/framsetningu.

Ekki þarf SQL, Supabase, RLS, auth, secrets eða production gögn. Ekki keyra migration. Ekki deploya fyrr en Stebbi hefur prófað localhost.

## Commands run by Codex

- `Get-Date -Format 'yyyy-MM-dd-HHmm'`
- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- `rg -n "weatherDisclaimer|sectionOnWay" app/auth-mvp/vedrid/FerdalagidClient.tsx messages/is.json messages/en.json`

