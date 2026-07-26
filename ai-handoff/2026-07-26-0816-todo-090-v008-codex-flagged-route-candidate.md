# TODO 090 — Flaggaður Teskeið route candidate samhliða Google

Created: 2026-07-26 08:16  
Timezone: Atlantic/Reykjavik  
Agent: Codex

## Samþykkt umfang

Stebbi samþykkti að Codex tengdi Teskeiðarleið samhliða núverandi Google-leið
undir nýju server-side prófunarflaggi. Google átti að vera áfram sjálfgefið,
Teskeið skýrt merkt tilraun, og timeout/bilun að vera fail-closed. Samþykkið
náði ekki til commit, push, deploy, production-flags, Supabase eða migration.

## Niðurstaða

`TESKEID_ROUTE_CANDIDATE_ENABLED=true` bætir nú einni sjálfvirkri
Teskeiðarleið aftast við núverandi Google-leiðaval í Akstur/Ferðalaginu.

- Google-leiðir eru áfram raðaðar fyrst og fyrsta Google-leið sjálfvalin.
- Teskeið er merkt „Tilraun“, með skýrum texta um að Google sé aðalviðmið og
  Teskeiðartími/vegaval enn í prófun.
- Skráð malarslitlag fær sýnilega textaviðvörun með iconi; litur einn miðlar
  ekki stöðunni.
- Sameiginlegur server-helper endurreiknar candidate bæði í leiðavalinu og í
  final travel submit. Teskeið-ID er því aldrei ranglega leitað upp hjá Google.
- Flagg-off er no-op. Graph/source-villa, no-route eða 8 sekúndna timeout skilar
  `null`; aðeins Teskeiðarleiðin hverfur og Google-response helst óbreytt.
- Valin Teskeiðarleið sem er ekki lengur tiltæk failar með núverandi
  `selected_route_unavailable` flæði í stað þess að skipta hljóðlega um leið.

## Breyttar/nýjar skrár í þessum áfanga

- `.env.example`
- `IcelandRoadmap.md`
- `app/api/teskeid/weather/travel/routes/route.ts`
- `app/api/teskeid/weather/travel/route.ts`
- `components/weather/RouteSelectionStep.tsx`
- `lib/weather/provider.types.ts`
- `lib/iceland-routes/roadGraphCandidate.server.ts` (ný)
- `lib/iceland-routes/README.md`
- `lib/__tests__/road-graph-candidate.test.ts` (ný)
- `lib/__tests__/weather-routes-api.test.ts`
- `lib/__tests__/weather-travel-api.test.ts`
- `messages/is.json`
- `messages/en.json`

Fyrri ócommittaðar TODO 090/091 breytingar í sameiginlega worktree voru
varðveittar. `.obsidian/workspace.json` var ekki snert af Codex í þessum áfanga.

## Design.md check

- Núverandi route-card og route-map componentar eru endurnýttir; enginn nýr
  skjár eða nested-card pattern var búinn til.
- Mobile-first breidd, 52 px touch target, focus-visible og núverandi loader
  haldast óbreytt.
- Semantic primary/muted/amber litir eru notaðir og tilraun/möl eru einnig
  merkt með texta.
- Allur nýr notendatexti er í íslensku og ensku message-skránum.
- Engin input-, keyboard-, navigation- eða scroll-hegðun breyttist.

## Route intelligence check

- Snertir allar íslenskar frá/til leiðir sem sjálfvirka grafið getur tengt.
- Reusable provider-neutral candidate helper er í `lib/iceland-routes/`, en
  Weather UI er áfram aðeins consumer.
- Google er provider/default/fallback og raw Google geometry er ekki vistað.
- Engin raw heimilisföng, hnit, GPS-ferill eða geometry fara í telemetry/logs.
- Route-memory fær aðeins fyrirliggjandi normalized staðalykla, route variant
  key og provider-station röð; engin geometry er persist-uð.
- `IcelandRoadmap.md` og route README eru uppfærð með v0.8 stöðu og blockers.

## Prófanir og skipanir

- `npm run type-check`: exit 0.
- Targeted candidate/routes/travel API suite: exit 0; 61 próf standast.
- `npm run test:run`: exit 0; 144 files passed, 1 skipped; 3.674 tests passed,
  28 skipped, 8 todo.
- `npm run build`: exit 0; production compile, lint/type validation og static
  generation kláruð.
- `git diff --check`: exit 0; aðeins fyrirliggjandi CRLF/LF warnings.

Build sýnir fyrirliggjandi hook/img warnings í öðrum skrám. Engin ný warning
vísar í þennan breytingapakka.

## Hvað var ekki gert

- Codex breytti ekki `.env.local` og kveikti því ekki sjálfur á flagginu.
- Enginn dev server var ræstur, stöðvaður eða endurræstur.
- Engin browserprófun var keyrð af Codex.
- Ekkert commit, push, deploy, Vercel/production env, Supabase, SQL eða migration.

## Localhost checks for Stebbi

Slóð: `http://localhost:3004/vedrid/ferdalagid` eða sama path á portinu sem
Stebbi keyrir. Canonical `/vedrid` Akstur-flæðið má einnig nota.

Forsendur:

1. Setja `TESKEID_ROUTE_CANDIDATE_ENABLED=true` í `.env.local`.
2. Stebbi þarf sjálfur að endurræsa localhost dev server svo server env lesist.
3. Núverandi Google/Places og weather env þurfa að virka.

Prófun:

1. Velja Reykjavík → Akureyri. Google-leið á að birtast fyrst og vera sjálfvalin.
2. Teskeiðarleið á að birtast aftast sem „Tilraun“ og segja að tími/vegaval sé
   enn í prófun.
3. Velja Teskeiðarleið. Valin lína á korti og route-card eiga að uppfærast án
   layout shift; „Nota þessa leið“ á að klára final ferðaveðursútreikning.
4. Prófa Reykjavík → Ísafjörður. Teskeiðarleið með skráðu malarslitlagi á að
   sýna textaviðvörun, ekki aðeins amber lit.
5. Prófa Reykjavík → Akureyri, Höfn og minni stað. Ef candidate finnst ekki eða
   tekur of langan tíma eiga Google-leiðir samt að birtast án Teskeiðarvillu.
6. Slökkva aftur á flagginu, endurræsa dev server og endurtaka. UI á þá að vera
   eins og fyrir breytingu: aðeins Google-leiðir og engin Teskeiðarmerking.
7. Athuga 360, 390 og 460 px: enginn horizontal overflow; löng tilraunamerking
   wrappar innan cards; controls halda minnst 40 px touch target.
8. Prófa íslensku og ensku, keyboard/focus-visible og back/forward/session
   restore eftir að bæði Google- og Teskeiðarleið hafa verið valdar.

Ekki setja flaggið í Vercel eða production án sérstaks leyfis Stebba. Þetta
flagg er globalt þegar það er virkt; það er ekki per-user allowlist.

## Eftirstandandi áhætta

- Fyrsta candidate-beiðni eftir cold start getur beðið í allt að 8 sekúndur.
- Timeout hættir að bíða en getur ekki stöðvað undirliggjandi shared graph fetch;
  fetchið má klárast í bakgrunni og nýtast næstu beiðni.
- ETA er afleitt, ekki official speed-limit ETA.
- Lokanir, færð, turn restrictions, off-route rerouting, vehicle limits og
  production-ready graph artifact/cache eru ekki komin.
- Global flagg sýnir candidate öllum eligible weather-notendum ef það er sett í
  production. Per-user rollout krefst sérstaks aðgangslags og nýs samþykkis.

## Næsta skref

Stebbi prófar localhost-flæðið. Codex rýnir skjámyndir/villur ef einhverjar
koma upp. Commit, push eða production rollout bíður sérstaks leyfis.

## Óvissa / þarf að staðfesta

Confidence er high fyrir flagg-off no-op, Google-first röðun, shared
recalculation, timeout/fallback og sjálfvirk próf. Confidence er medium fyrir
raunverulegt mobile/browser UX þar sem Stebbi stýrir dev server og browserprófi.
