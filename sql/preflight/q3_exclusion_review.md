# Q3 — Potential exclusion review list

**100% SELECT-only. No email output.**

Keyra í Supabase SQL Editor (service_role context).

## Mikilvægt

Þetta er **review-listi, ekki sjálfvirk útilokun.**
Enginn user_id er útilokaður úr backfill nema Stebbi staðfesti það sérstaklega
eftir að hafa skoðað þennan lista.

## Tilgangur

Sýnir legacy-umsækjendur sem eru merktir til skoðunar í tveimur flokkum:

| Flag | Þýðing |
|------|---------|
| `empty_display_name` | Profile var aldrei sett upp rétt — líklega prufureikningur eða yfirgefinn reikningur. |
| `recently_created` | Profile búinn til eftir 2025-01-01 — gæti verið prufureikningur eftir production-launch. Breyttu dagsetningunni ef þú veist nákvæmari launch-dagsetningu. |

## Staðfesting (nauðsynleg áður en sql/40 er skrifað)

Farðu í gegnum listann og skilaðu nákvæmum lista yfir `user_id` sem á að útiloka.
Listi getur verið tómur ef engir eru til að útiloka.

Sérhver `user_id` sem er í Q1 en er **ekki** sérstaklega staðfestur til útilokunar hér
mun vera innifalinn í sql/40 backfill.

## SQL

```sql
WITH legacy_candidates AS (
    SELECT DISTINCT parent_id AS user_id
    FROM   public.parent_child
)
SELECT
    p.id                                AS user_id,
    p.display_name,
    COUNT(DISTINCT pc.child_id)         AS child_count,
    p.created_at::date                  AS profile_created,
    CASE
        WHEN trim(p.display_name) = ''          THEN 'empty_display_name'
        WHEN p.created_at >= '2025-01-01'::date THEN 'recently_created'
        ELSE                                         'review'
    END                                 AS flag
FROM   public.profiles     p
JOIN   public.parent_child pc ON pc.parent_id = p.id
JOIN   legacy_candidates   lc ON lc.user_id   = p.id
WHERE
    trim(p.display_name) = ''
    OR p.created_at >= '2025-01-01'::date
GROUP  BY p.id, p.display_name, p.created_at
ORDER  BY flag, p.created_at;
```
