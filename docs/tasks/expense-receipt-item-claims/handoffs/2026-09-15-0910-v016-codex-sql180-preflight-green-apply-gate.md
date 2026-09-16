# SQL180 preflight GREEN — reviewed apply gate

## Mannamálsniðurstaða

Production preflight staðfesti nákvæma SQL179 predecessor-stöðu:
`PREDECESSOR_READY` og `operator_state_ok=true`. SQL180 er ekki þegar uppsett.
Næsta skref er ein handvirk keyrsla Stebba á reviewed SQL180 apply. Codex
keyrði ekkert SQL.

## Staðfest preflight output

Öll þessi gates voru `true`: executor, prerequisites, `service_role`,
predecessor functions, relations, trigger absence, bucket, predecessor
constraint, predecessor catalog og sameinað predecessor state. Öll SQL180
target gates voru `false`, eins og vænst er fyrir `PREDECESSOR_READY`.

## Exact apply

- Path: `sql/180_expense_receipt_zero_total_review.sql`
- SHA-256: `681d415f667a866099244415ce088906a1e89f69813d36d5c9dee5549d505a47`
- Bytes: `72.577`
- Lines: `1.631`, með final newline
- Óháð exact-byte lokarýni: GREEN.

Apply endurtekur fulla predecessor-vörn inni í transaction áður en DDL hefst.
Hún breytir einu check-constrainti, sex function bodies og setur SQL180 catalog
seal. Hún breytir ekki grants, RLS, policies eða Production gögnum.

## Næsta gate

Stebbi afritar alla apply-skrána óbreytta í tóman Production Supabase SQL
Editor og keyrir hana einu sinni. Stoppa skal á villu eða óljósri niðurstöðu.
Ef keyrslan lýkur án villu verður reviewed read-only postflight næsta skref.

## Localhost checks for Stebbi

Engin localhost-prófun í þessu gate. Fyrst þarf apply og síðan postflight að
staðfesta exact installed SQL180. App-prófun hefst aðeins þegar schema og
samhæfur app-candidate eru í sama staðfesta umhverfi.
