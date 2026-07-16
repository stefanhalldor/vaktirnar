# Codex review: TODO #75 v041 - disclaimer patch done

Created: 2026-07-09 22:59
Timezone: Atlantic/Reykjavik
Rýnir á: `2026-07-09-2355-todo-075-v041-claude-disclaimer-patch-done.md`
Tengist: TODO #75

## Findings

### Medium: textinn er ekki í sér `attention`/info ham

Patchið breytir bara `messages/is.json` og `messages/en.json`. Núverandi rendering í `FerdalagidClient.tsx` er áfram einfalt:

```tsx
<p className="text-xs text-muted-foreground">
  {tf.rich('weatherDisclaimer', ...)}
</p>
```

Textinn er inni í `Á leiðinni` kaflanum, sem er gott. En fyrri pæling Stebba var að setja þetta í smá attention ham. Það er ekki komið.

Þetta er ekki release-blocker ef Stebbi vill bara fá copyið út núna. En ef markmiðið er að notandi taki sérstaklega eftir þessu, vantar lítinn UI-patch: t.d. compact amber/info sub-row með fíngerðri border/vinstri línu eða icon, samt áfram inni í `Á leiðinni`.

### Medium: fallback utan `Á leiðinni` er enn til

v041 segir rétt að disclaimer sé inni í `Á leiðinni`, en einnig sem fallback neðar í cardinu þegar `Á leiðinni` renderast ekki:

```tsx
{/* Disclaimer fallback — shown only when Á leiðinni section does not render */}
```

Stebbi sagði sérstaklega: “Setja í `Á leiðinni` boxið.” Ef það er bókstaflega krafan, ætti fallbackið að fara eða bíða sérstakrar samþykktar.

Þetta er ekki stórt tæknilegt vandamál, en það getur valdið ósamræmi í UX: sama texti birtist stundum sem hluti af structured summary og stundum sem laus texti.

### Low: v041 handoff vantar `Timezone`

Handoffið hefur `Created`, en ekki `Timezone: Atlantic/Reykjavik`. Þetta er workflow-frávik, ekki kóðavilla.

### Low: `Localhost checks` kaflinn notar ekki nákvæma skyldufyrirsögn

v041 notar `Localhost checks fyrir Stebbi`. `ai-handoff/README.md` krefst `Localhost checks for Stebbi`. Þetta er process-frávik, ekki release blocker.

## Staðfest gott

- Stóra hviðuhreinsunardiffið er farið úr working tree.
- Núverandi tracked diff er aðeins:

```text
messages/en.json | 2 +-
messages/is.json | 2 +-
```

- `git stash list --max-count=5` sýnir stashið:

```text
stash@{0}: On main: hviðuhreinsun-v035-v038-stöðvuð-v040
```

- Íslenski textinn er réttur:

```text
Athugaðu sérstaklega hviður og færð á <link>vef Vegagerðarinnar</link>. Þetta mat byggir á almennum spágögnum og kemur ekki í stað opinberra upplýsinga.
```

- `npm run type-check` var keyrt af Codex og er grænt.
- Engar SQL, Supabase, RLS, auth, secrets, commit, push eða deploy breytingar.

## Ráðlegging

Ef Stebbi vill gefa út minnstu öruggu útgáfuna núna: þetta er í lagi sem copy-only patch, með localhost-prófun.

Ef Stebbi vill að textinn verði meira sýnilegur áður en útgáfa fer út: biðja Claude Code um einn mjög lítinn UI-patch:

1. Breyta rendering `weatherDisclaimer` inni í `Á leiðinni` í compact attention/info sub-row.
2. Fjarlægja eða staðfesta sérstaklega fallbackið utan `Á leiðinni`.
3. Engar breytingar á gust logic, parser, thresholds, tests eða ForecastDrawer.

## Localhost checks for Stebbi

1. Opna `/auth-mvp/vedrid` sem innskráður notandi.
2. Reikna leið sem sýnir niðurstöðu og `Á leiðinni` kafla.
3. Staðfesta að textinn birtist inni í `Á leiðinni`:
   - “Athugaðu sérstaklega hviður og færð á vef Vegagerðarinnar. Þetta mat byggir á almennum spágögnum og kemur ekki í stað opinberra upplýsinga.”
4. Smella á `vef Vegagerðarinnar` og staðfesta að linkurinn fari á `https://umferdin.is`.
5. Prófa mobile 360-390 px:
   - textinn wrappar snyrtilega;
   - enginn horizontal overflow;
   - linkurinn er tappanlegur.
6. Prófa route þar sem `Á leiðinni` kafli birtist ekki, ef auðvelt er:
   - staðfesta hvort fallback textinn neðar í cardinu er ásættanlegur eða hvort hann eigi að fara.
7. Regression:
   - route calculation virkar;
   - scrubber virkar;
   - Forecast drawer opnast;
   - comparison strip/drawer brotnar ekki;
   - hviðuvirkni er óbreytt fyrir utan nýja disclaimer copyið.

## Commands run by Codex for this review

- `Get-Content -Encoding UTF8 WORKFLOW.md`
- `Get-Content -Encoding UTF8 ai-handoff/README.md`
- `Get-Content -Encoding UTF8 ai-handoff/2026-07-09-2355-todo-075-v041-claude-disclaimer-patch-done.md`
- `Get-Date -Format yyyy-MM-dd-HHmm`
- `git status --short --untracked-files=no`
- `git diff --stat`
- `git diff -- messages/is.json messages/en.json app/auth-mvp/vedrid/FerdalagidClient.tsx`
- `git stash list --max-count=5`
- `rg -n "weatherDisclaimer|sectionOnWay|sectionDestination" app/auth-mvp/vedrid/FerdalagidClient.tsx messages/is.json messages/en.json`
- Read relevant `FerdalagidClient.tsx` snippets around `weatherDisclaimer`
- `npm run type-check`

