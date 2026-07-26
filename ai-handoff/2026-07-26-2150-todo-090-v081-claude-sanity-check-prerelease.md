# TODO-090 v081 — Sanity check fyrir loka prerelease (Claude Code)

**Created:** 2026-07-26 21:50
**Timezone:** Atlantic/Reykjavik
**Byggir á:** v080 (Codex loka prerelease-staðfesting), v022 (Claude Code code review)

Þetta er rýni/sanity check — ekki framkvæmdarleyfi.

---

## Niðurstaða

V080 er að mestu vandlega unnin. Einn **óleystur blocker** er enn til staðar sem v080 sér ekki — nightly cron refresh keyrir aldrei í production án einnar lagfæringar.

---

## BLOCKER (óleystur frá v022)

### `/api/cron/refresh-road-graph` vantar í `EXACT_PUBLIC_PATHS` í middleware.ts

**Staðfest tvívegis:** Grep á `middleware.ts` í vinnusvæðinu skilar engu. Git diff sýnir líka ekkert um þessa slóð.

```
$ grep "refresh-road-graph" middleware.ts
# engar niðurstöður
```

`EXACT_PUBLIC_PATHS` inniheldur:
```ts
'/api/cron/warm-vedurstofan',
'/api/cron/warm-vegagerdin',
'/api/cron/warm-metno-points',   // bætt við í þessum pakka
// refresh-road-graph: VANTAR
```

Vercel cron sendir GET á `/api/cron/refresh-road-graph` án Supabase-session. Middleware-inn finnur `user=null`, slóðin er ekki public, skilar `{ error: 'Unauthorized' }` HTTP 401. Route handler sem athugar `CRON_SECRET` kemst aldrei af stað.

**Afleiðing:** Öll dagleg vegagrafsamskipti mistekjast í production. `TESKEID_ROAD_GRAPH_REFRESH_ENABLED` og `isTeskeidRouteCandidateEnabled()` skipta engu máli þar sem route handler keyrir aldrei.

**Lagfæring:** Bæta einni línu við `EXACT_PUBLIC_PATHS` í `middleware.ts`:
```ts
'/api/cron/refresh-road-graph',
```
Sama mynstur og hinar cron-slóðirnar. Route handler er fail-closed (krefst gilda CRON_SECRET).

**Þarf framkvæmdarleyfi Stebba.**

---

## Athugasemdir um v080

V080 tiltekur v022 sem "leiðrétt localhost-röð" í fyrirsögn. V022 var kóðarýni (ekki localhost-röð) sem greindi þennan blocker. Codex virðist hafa túlkað v022 rangt eða ekki lesið hana fyrir v080 var skrifuð. Blocker fór því í gegnum v080-rýnina án þess að vera tekinn.

V080 segir "enginn release-blocking kóðagalli fannst" — þetta er rangt hvað cron-refresh varðar. Allt annað í v080 er rétt og vandlegt.

---

## `/api/place/search` — nýr opin endpoint (viðbót við v022)

Þessi endpoint var ekki í v022-rýni. Hann er í `EXACT_PUBLIC_PATHS` sem nýlægasta diff-breyting.

**Jákvætt:**
- Tvöfalt hlið: `AUTH_MVP_ENABLED` + `getWeatherEnabledMode()`.
- `resolveWeatherBaseAccess` blocker fyrir blocked-mode.
- In-memory rate limit (30 req/60s per IP), best-effort.
- `validateIcelandicCoords` síar niðurstöður — aðeins Íslandsstaðir fara til baka.
- Query-lengd: 2–100 stafir. Reasonable.
- Engar niðurstöður geymdar í DB — process-level cache eingöngu.

**Athugasemdir (ekki blockers):**

1. **`'unknown'` sem IP-fallback:** Ef bæði `x-forwarded-for` og `x-real-ip` vantar, deila allir slíkir notendur einni rate-limit-færslu. Í Vercel-umhverfi ætti þetta aldrei að gerast (Vercel setur alltaf `x-forwarded-for`) en er öruggt.

2. **`ipTimestamps` Map vex að eilífu:** Entries sem eru orðnar gamlar eru aldrei deleteaðar úr Map-inu (aðeins gamlar timestamps innan entry eru fjarlægðar). Í skammlífum Vercel-ferlum er þetta harmless — ferlið restartast reglulega.

3. **Google Place IDs í svari:** `placeId: c.placeId` er sent til client. Place IDs eru ekki leynilegar (þær eru notaðar í client-code), en það er gott að vera meðvituð.

**Niðurstaða á `/api/place/search`:** Öruggt og nógu girt. Engar blockers.

---

## SQL 93 unique constraint — enn óstaðfest

V080 staðfestir "SQL 92 og SQL 93 keyrð" og "met.no warmup hafður staðfest 43/43." 43/43 líklegur til að þýða að upsert-ið virkar og constraintinn er til, en þetta er óbeint sönnun. Beint: ef upsert myndi bila vegna vantar constraint, myndi warmup skila villu. 43/43 er því gott merki.

**Confidence:** medium-high að constraint sé til. Ef Stebbi sér tækifæri, er þess virði að staðfesta með read-only SQL — en þetta er ekki blocker.

---

## Samanburður við v022

| Finding | V022 | V080 | Núverandi |
|---|---|---|---|
| Cron middleware blocker | BLOCKER | Ekki nefnt | **ÓLEYSTUR BLOCKER** |
| SQL 93 unique constraint | Þarf staðfestingu | Óbein staðfesting (43/43) | Medium-high confidence |
| SQL 93 REVOKE/GRANT | Þarf staðfestingu | Staðfest keyrt | OK |
| stageRoadGraphSnapshot gap | Medium | Ekki nefnt | Skráð, ekki blocker |
| pruneRoadGraphSnapshotHistory return | Medium | Ekki nefnt | Skráð, ekki blocker |
| `/api/place/search` | Ekki í scope | "Bounds staðfestir" | OK eftir þessa rýni |

---

## Hvað þarf áður en commit/push/deploy

**Eitt:** Bæta `/api/cron/refresh-road-graph` við `EXACT_PUBLIC_PATHS` í `middleware.ts`.

Þar á eftir er pakkinn tilbúinn til curated commit með þeirri einni lagfæringu.

Commit-uppstilling skv. v080 gildir áfram:
- Útiloka `.obsidian/workspace.json` nema Stebbi ákveði annað.
- Allar nýjar untracked skrár (SQL, lib, tests, handoff) eru hluti af pakkanum og eiga heima í commit.
- Eftir commit og push: fylgjast með Vercel build þar til grænt.
- Post-deploy: Stebbi keyrir smoke-listann úr v080.

---

## Óvissa / þarf að staðfesta

- SQL 93 unique constraint (medium-high confidence — líklega OK).
- Production mobile/Safari og Vercel cold-start: staðfest eftir deploy eins og v080 segir.

**Confidence:** Blocker #1 er verified fact — ekki assumption.
