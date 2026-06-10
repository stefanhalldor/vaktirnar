# Q1 — Legacy user candidate list

**100% SELECT-only. No email output.**

Keyra í Supabase SQL Editor (service_role context).

## Skilgreining

Sérhver notandi með a.m.k. eina röð í `parent_child` er Krakkavaktin legacy notandi.
Þetta eru notendur sem skráðu eða gengu í hóp með a.m.k. eitt barn í kerfinu.

## Staðfesting (nauðsynleg áður en sql/40 er skrifað)

> "Allir notendur með ≥1 row í `parent_child` eru réttir Krakkavaktin legacy notendur
> og eiga að fá aðgang í `legacy_access` backfill."

Ef einhver notandi í þessum lista á **ekki** að fá aðgang, staðfestu það í Q3.

## SQL

```sql
SELECT
    p.id                                                              AS user_id,
    p.display_name,
    COUNT(DISTINCT pc.child_id)                                       AS child_count,
    COUNT(DISTINCT CASE WHEN pc.role = 'primary'  THEN pc.child_id END)
                                                                      AS primary_children,
    COUNT(DISTINCT CASE WHEN pc.role = 'coparent' THEN pc.child_id END)
                                                                      AS coparent_children,
    p.created_at::date                                                AS profile_created
FROM   public.profiles     p
JOIN   public.parent_child pc ON pc.parent_id = p.id
GROUP  BY p.id, p.display_name, p.created_at
ORDER  BY p.created_at;
```
