# TODO-091 v074 — localhost stöðumat á met.no spásögu

**Created:** 2026-07-26 18:48  
**Timezone:** Atlantic/Reykjavik  
**Fyrra handoff:** `2026-07-26-1814-todo-091-v073-codex-metno-history-range-prerelease.md`

## Niðurstaða

Skjámynd Stebba er samræmanleg væntri stöðu og sýnir ekki að v073-breytingarnar hafi tapast við VS Code restart.

- Taflan hefur opnað eldra samfellt bil, 15.–19. júlí.
- Veðurstofustaðirnir eiga vistuð gildi fyrir þetta bil.
- Yr/met.no-staðirnir sýna `–` vegna þess að met.no history var ekki til þegar þessar eldri spálotur voru gefnar út og vistaðar.
- SQL 84 og SQL 93 voru staðfest keyrð 26. júlí og admin warmup tókst 43/43 sama dag.
- Warmup vistar núverandi spálotu og framtíðar forecast rows. Hann getur ekki búið til sanna eldri spálotu afturvirkt fyrir 15.–19. júlí.

Þetta er því fyrst og fremst data-age/bootstrapping staða, ekki staðfest ný kóðavilla.

## Hvar verkið stendur

- v072 djúprýni og lagfæringar eru áfram ócommittaðar í vinnusvæðinu.
- v073 lagaði að current met.no lazy-load keyri samhliða history og breytti eldri sögu í samfellt bil.
- SQL 84 → SQL 93 og 43/43 met.no warmup voru staðfest af Stebba í v073.
- Engin commit, push eða deploy hefur farið fram samkvæmt handoffunum og núverandi `git status` sýnir prerelease-pakkann enn sem local breytingar.
- SQL 92/LKG road-graph bootstrap er enn ekki staðfest í þessum þræði, en það skýrir ekki auðu met.no-reitina á skjámyndinni.

## Hvað þarf að staðfesta næst

1. Á deginum í dag og í framtíðardögum eiga Yr/met.no-raðir að fá current/future gildi eftir v073-fixið.
2. Eldri met.no-gildi birtast aðeins fyrir forecast-daga sem snapshot-söfnunin hefur raunverulega náð að vista. Saga byggist því upp með cron/warmup yfir tíma.
3. Ef Yr/met.no er líka tómt fyrir daginn í dag eða framtíðina er það regression eða runtime/API-vandamál sem þarf að greina sérstaklega í Network/Console.

## Áhætta og mörk niðurstöðunnar

Codex las handoff, kóða og worktree en las ekki Supabase production/local gögn beint. Niðurstaðan byggir því á staðfestingu Stebba í v073 um SQL 84/93 og 43/43 warmup. Confidence er hátt fyrir skýringuna á 15.–19. júlí, en runtime þarf browser-staðfestingu fyrir current/future met.no.

Engum kóða, SQL, Supabase-gögnum, env, auth eða production var breytt við þetta stöðumat. Aðeins þessi review/handoff skrá var búin til.

## Localhost checks for Stebbi

**Slóð:** sama veðurflæði og á skjámyndinni, helst `/auth-mvp/vedrid`.

1. Veldu einn Yr/met.no-stað, til dæmis Egilsstaði, og tímann `12`.
2. Farðu fyrst á daginn í dag og næstu daga.
3. Vænt: Yr/met.no sýnir current/future spágildi. Ef þau eru líka `–`, opnaðu Network og athugaðu sérstaklega met.no point-beiðnina og forecast-history-beiðnina; skráðu status code og response án secrets.
4. Ýttu síðan á `Skoða eldri spár`.
5. Vænt fyrir daga fyrir fyrstu söfnun 26. júlí: Veðurstofan getur átt gildi en Yr/met.no má heiðarlega sýna `–`.
6. Eftir að kerfið hefur safnað snapshotum yfir tíma á Yr/met.no að birtast á þeim eldri forecast-dögum sem voru raunverulega vistaðir. Ekki keyra afturvirk SQL `DELETE`, breyta retention eða prófa production/env kæruleysislega; slíkt krefst sérstaks leyfis.

## Tillaga að næsta skrefi

Stebbi staðfestir fyrst hvort Yr/met.no sýni gildi fyrir daginn í dag og framtíðina. Ef já er skjámyndin vænt bootstrapping-hegðun og hægt er að halda áfram með prerelease-rýni. Ef nei þarf Claude Code eða Codex afmarkað runtime-diagnostic út frá Network/Console niðurstöðunum áður en commit/deploy er metið.
