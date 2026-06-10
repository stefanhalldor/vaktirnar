# Q2 — Summary counts

**100% SELECT-only. No email output.**

Keyra í Supabase SQL Editor (service_role context).

## Tilgangur

Fljótleg heildarsamtala til að staðfesta stærðargráðu áður en Q1 er skoðað í einstökum línum.
Engin staðfesting frá Stebba nauðsynleg — upplýsingar einungis.

## SQL

```sql
SELECT
    COUNT(DISTINCT pc.parent_id)                                           AS total_legacy_candidates,
    COUNT(DISTINCT pc.child_id)                                            AS total_children_linked,
    COUNT(DISTINCT CASE WHEN pc.role = 'primary'  THEN pc.parent_id END)  AS distinct_primary_parents,
    COUNT(DISTINCT CASE WHEN pc.role = 'coparent' THEN pc.parent_id END)  AS distinct_coparents
FROM   public.parent_child pc;
```
