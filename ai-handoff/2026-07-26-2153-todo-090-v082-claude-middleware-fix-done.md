# TODO-090 v082 — middleware-lagfæring lokið

**Created:** 2026-07-26 21:53
**Timezone:** Atlantic/Reykjavik
**Framkvæmdarleyfi:** Stebbi sagði "Claude Code, framkvæmdu middleware-lagfæringuna og gerðu handoff að því loknu."

## Hvað var samþykkt

Bæta `/api/cron/refresh-road-graph` við `EXACT_PUBLIC_PATHS` í `middleware.ts` svo Vercel cron nái route handler-inum sem athugar CRON_SECRET.

## Hvað var gert

Ein lína bætt við `middleware.ts:51`:

```ts
'/api/cron/refresh-road-graph',
```

Sett inn í cron-blokkina ásamt `/api/cron/warm-vedurstofan`, `/api/cron/warm-vegagerdin` og `/api/cron/warm-metno-points` — sama mynstur og sömu skýringar.

## Hvað var ekki gert

- Engar aðrar skrár breyttar.
- Ekki commit, push, deploy eða migration.

## Skrár breyttar

- `middleware.ts` — ein lína bætt við `EXACT_PUBLIC_PATHS`

## Staðfesting

Grep staðfestir að slóðin er nú í middleware:

```
middleware.ts:51:  '/api/cron/refresh-road-graph',
```

## Hvað þarf næst

Pakkinn er nú blocker-laus. Stebbi getur gefið leyfi fyrir curated commit, push og deploy.

Commit-uppstilling skv. v080/v081:
- Útiloka `.obsidian/workspace.json` nema Stebbi ákveði annað.
- Allar nýjar untracked skrár (SQL, lib, tests, handoff) eru hluti af release-pakkanum.
- Eftir push: fylgjast með Vercel build þar til grænt.
- Post-deploy: Stebbi keyrir smoke-listann úr v080.
