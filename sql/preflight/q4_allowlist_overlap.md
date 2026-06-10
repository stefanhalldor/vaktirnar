# Q4 — Allowlist overlap

**100% SELECT-only. No email output.**

Keyra í Supabase SQL Editor (service_role context).
Krefst service_role — `auth.users` er ekki aðgengilegt fyrir anon/authenticated.

## Tilgangur

Telur hversu margir legacy-umsækjendur eru einnig á `auth_mvp_allowlist` (Teskeið-aðgangslisti).
`auth.users.email` er lesið innanhúss til að gera joinið, en **engin netföng eru í output**.
`btrim()` á `auth.users.email` forðast rangt undercount ef dálkurinn hefur óvænt whitespace.

Upplýsingar einungis — engin staðfesting frá Stebba nauðsynleg.
Allowlist-staða hefur ekki áhrif á hverjir fá `legacy_access`:
allir Q1-umsækjendur að frádregnum Q3-útilokunum fá röð, óháð allowlist-stöðu.

## SQL

```sql
WITH legacy_candidates AS (
    SELECT DISTINCT parent_id AS user_id
    FROM   public.parent_child
)
SELECT
    COUNT(*)                   AS total_legacy_candidates,
    COUNT(al.email)            AS also_on_teskeid_allowlist,
    COUNT(*) - COUNT(al.email) AS not_on_teskeid_allowlist
FROM       legacy_candidates     lc
JOIN       auth.users            au ON au.id = lc.user_id
LEFT JOIN  public.auth_mvp_allowlist al
               ON lower(btrim(au.email)) = al.email;
```
