# TODO 086 v065 - Codex review: v064 architecture and data-source separation

Created: 2026-07-13 07:21
Timezone: Atlantic/Reykjavik
Agent: Codex
Input: `2026-07-13-0820-todo-086-v064-claude-v062-v063-done-prerelease.md`

## Findings

### P1 - Cache-first er nú lagað fyrir Elta veðrið, en ekki project-wide ferðaveðurflæðið

v064 gerir rétta breytingu fyrir station explorer: `app/api/teskeid/weather/vedurstofan/stations/route.ts` les nú `readVedurstofanCacheForStations(...)` og gerir ekki live Veðurstofan fetch í page-load request path.

En þetta má ekki túlka sem að öll Veðurstofan-notkun í appinu sé orðin cache-only. `app/api/teskeid/weather/travel/route.ts:262-278` notar enn `fetchVedurstofanForecastsForStations(...)` í user-facing ferðaveður request path, með 1.5s per-batch timeout og 2s global budget.

Það er fail-open og líklega ásættanlegt sem núverandi enrichment, en það er ekki endanlega cache-first arkitektúrinn sem Stebbi er að lýsa. Áður en `elta-vedrid` og `vedrid` verða eitt flæði þarf næsti áfangi að færa Veðurstofan enrichment í ferðaveðri yfir í cached/background-updated gögn líka.

### P2 - `weather_cache` er gott cache-lag, en ekki besta langtíma "Excel-taflan"

Núverandi `weather_cache` er server-only key/value JSONB cache (`sql/67_weather_cache.sql`). Það er gott sem lágmarks cache-lag:

- `metno:...` lyklar fyrir MET/Yr
- `vedurstofan:...` lyklar fyrir Veðurstofuna
- service-role only
- TTL/fetched timestamps

En sem langtíma gagnagrunnur fyrir sannprófun, stöðvalista, nútímamælingar, hviður, spágildi, mapping status og UI-síun er hann ekki nógu "töflulegur". Hann er meira eins og geymsla fyrir API responses heldur en vörugagnalíkan.

Ef markmiðið er að Stebbi geti hugsað þetta eins og Excel, yfirfarið stöðvar, séð vöntun, borið saman gildi og byggt framtíðarflæði ofan á þessu, þá er dedicated Supabase tafla eða töflusett betri framtíðarlausn.

## Svar við spurningu Stebba

Já, við eigum áfram að passa að vera með sitthvort veðurkerfið:

- MET/Yr annars vegar: grid/coordinate forecast source. Í kóða er þetta helst `metno`, en notendamegin tölum við oft um Yr.
- Veðurstofan hins vegar: station-based gögn, bæði `type=forec` spár og síðar `type=obs` nútímamælingar/hviður.

Þau mega deila sameiginlegum cache/backfill innviðum, en þau mega ekki verða eitt óskýrt gagnasull. Það þarf alltaf að vera sýnilegt í gagnalíkani og UI:

- hvaða source gildi kemur frá
- hvort þetta er grid-punktur eða veðurstöð
- hvort þetta er spá eða observation
- hvenær gögn voru mæld/spáð/sótt
- hvort gögnin eru fresh, stale eða missing

## Tæknilegt mat Codex á Supabase-leiðinni

Codex er sammála Excel-instinctinu hjá Stebba fyrir Veðurstofuna.

Besta future-proof leiðin er:

1. Halda `weather_cache` sem low-level provider cache.
2. Bæta síðar við dedicated Supabase töflum fyrir queryable Veðurstofugögn.
3. Láta user-facing UI lesa úr þessum töflum eða server API sem les þær.
4. Láta scheduled/background worker fylla og uppfæra töflurnar.

Mögulegt gagnalíkan síðar:

- `weather_stations` eða `vedurstofan_stations`: station registry, metadata, mapping status, official source URL.
- `vedurstofan_observations_latest`: nýjasta `type=obs` mæling per station, með F/D/FX/FG/T/W/V/R og tímum.
- `vedurstofan_forecasts_latest`: nýjustu `type=forec` raðir per station og forecast time.
- `weather_fetch_runs`: hvenær job keyrði, hversu margar stöðvar tókst/mistókst, error summary.
- Optional history síðar ef við viljum trends, auditing eða greiningu.

Ef við viljum gera þetta enn almennara má nota `source` dálk (`metno`, `vedurstofan`) í sumum töflum, en station-based Veðurstofugögn og MET/Yr grid-gögn ættu samt ekki að fara í nákvæmlega sömu "allt-veður" töflu nema schema-ið sé mjög meðvitað um `source_type = station | grid`.

## Ráðlegging fyrir næsta Claude Code skref

Claude Code ætti ekki að byrja á migration í blindni.

Næsta örugga skref er plan/handoff fyrir cache warmer og Supabase-gagnalíkan:

1. Skilgreina nákvæmlega hvaða user-facing request paths mega gera live Veðurstofan fetch og hver ekki.
2. Mæla með að Elta veðrið og framtíðar sameinað ferðaveður lesi Veðurstofugögn cache/database-only.
3. Skilgreina töflur fyrir station registry, latest observations, latest forecasts og fetch runs.
4. Skýra RLS/grants: líklega server-only/API-read fyrst, ekki client direct reads.
5. Skýra hvort `weather_cache` verður áfram raw/cache layer og nýjar töflur verða product layer.
6. Skýra hvernig MET/Yr og Veðurstofan verða aðskilin í types, API response og UI.

Ekki skrifa eða keyra migration fyrr en Stebbi biður sérstaklega um það.

## Localhost checks for Stebbi

Fyrir v064 sem stendur:

1. Opna `/auth-mvp/vedrid/elta-vedrid` með notanda sem hefur `vedrid` og `elta-vedrid`.
2. Staðfesta að station explorer hleðst hratt og sýnir station registry þótt cache sé tómt.
3. Staðfesta að detail card sýnir Veðurstofu metadata og að gögn eru merkt `ok`, `stale` eða `unavailable`.
4. Opna venjulega `/auth-mvp/vedrid` ferðaveðrið og staðfesta að það virkar áfram.
5. Ekki túlka það sem staðfestingu á nýja framtíðararkitektúrnum ef ferðaveðrið virkar, því travel API notar enn live Veðurstofan enrichment í request path.

Ekki prófa Supabase migrations, cron eða production refresh án sér samþykkis.

## Bottom line

v064 er rétt skref fyrir Elta veðrið: cache-only page load og allur 280-stöðva registry í UI.

Næsta stóra arkitektúrregla þarf að vera: Veðurstofan og MET/Yr eru sitthvor source-línan, en með sameiginlegu status/age/quality contract-i. Veðurstofugögn eiga til framtíðar heima í Supabase sem queryable product tables, ekki bara sem raw JSON cache, en `weather_cache` má áfram vera undirliggjandi cache-lag.
