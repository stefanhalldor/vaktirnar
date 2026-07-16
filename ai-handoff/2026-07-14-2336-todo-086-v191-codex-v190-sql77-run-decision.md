# TODO 086 v191 - Codex SQL77 run decision

Created: 2026-07-14 23:36
Timezone: Atlantic/Reykjavik

Mode:
- Rýni og run-decision only.
- Engin SQL keyrð, engar kóðabreytingar, ekkert commit/push/deploy.
- Skoðað: `2026-07-14-2330-todo-086-v190-claude-v189-done-prerelease.md`, `sql/77_vedurstofan_forecasts_history.sql`, static SQL test block og stakir relevant code references.

## Stutt svar til Stebba

Ekki keyra SQL77 alveg strax eins og það stendur núna.

Migration-in sjálf er í réttri átt og virðist ekki opna anon/authenticated aðgang. En Codex vill laga eitt lítið schema hygiene / safety atriði áður en hún fer í Supabase:

- SQL77 býr til `CREATE OR REPLACE FUNCTION public.set_updated_at()`.
- Það er of almennt function-nafn.
- Repo-ið á nú þegar `public.teskeid_set_updated_at()` sem aðrar töflur nota.
- `CREATE OR REPLACE` á generic nafni gæti óvart yfirskrifað function í production ef eitthvað annað hefur búið hana til utan repo-sögu.

Þetta er ekki stórt vandamál, en það er óþarfi að taka þann séns.

## Finding

### Medium - SQL77 ætti ekki að búa til generic `public.set_updated_at()`

Í `sql/77_vedurstofan_forecasts_history.sql`:

```sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
```

Betri lausn:

1. Endurnýta núverandi function:

```sql
FOR EACH ROW EXECUTE FUNCTION public.teskeid_set_updated_at();
```

eða:

2. Ef Claude Code vill ekki treysta á eldri function, búa til sértækt nafn:

```sql
public.vedurstofan_forecasts_history_set_updated_at()
```

Codex kýs leið 1 ef `sql/04_teskeid_schema.sql` hefur örugglega verið keyrt í production, sem virðist vera forsenda fyrir mörgum öðrum migrations. Leið 2 er líka ásættanleg ef Claude vill hafa SQL77 sjálfstæðari.

## Hvað er annars í lagi

SQL77 er annars í góðu formi miðað við fljóta rýni:

- `BEGIN` / `COMMIT`.
- `CREATE TABLE IF NOT EXISTS`.
- PK `(station_id, atime, forecast_time)`.
- FK í `vedurstofan_stations`.
- RLS enabled.
- `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
- `GRANT ... TO service_role`.
- Index fyrir station/atime lookup.
- Index fyrir retention cleanup.
- Engin user data.
- Engin anon/authenticated policies.

## Hvað þarf að vera satt áður en SQL77 er keyrt

Áður en Stebbi keyrir SQL77:

1. SQL74 þarf að vera keyrt í Supabase, því SQL77 vísar í `public.vedurstofan_stations`.
2. SQL75 og SQL76 mega vera keyrð eins og Stebbi staðfesti fyrr.
3. Claude Code þarf að laga function-nafnið í SQL77.
4. Helst keyra relevant tests aftur eftir breytinguna:
   - `sql-migration.test.ts`
   - `weather-vedurstofan-projector.test.ts`
   - `weather-vedurstofan-product-reader.test.ts`
   - typecheck ef tími er.

## Suggested copy/paste to Claude Code

```text
Claude Code, áður en Stebbi keyrir SQL77: lagaðu `sql/77_vedurstofan_forecasts_history.sql` þannig að migration búi ekki til generic `public.set_updated_at()`.

Codex mælir með að endurnýta núverandi `public.teskeid_set_updated_at()` trigger function ef það er örugglega production dependency nú þegar. Annars notaðu sértækt function-nafn, t.d. `public.vedurstofan_forecasts_history_set_updated_at()`.

Markmið:
- forðast `CREATE OR REPLACE FUNCTION public.set_updated_at()`
- halda RLS/grants óbreyttum
- halda SQL77 idempotent
- uppfæra static SQL testið ef það er að assert-a gamla trigger-function patternið
- keyra viðeigandi tests/typecheck

Ekki keyra migration, ekki commit-a, ekki push-a eða deploya nema Stebbi biðji sérstaklega um það.
```

## Localhost checks for Stebbi

Þessi rýni er um hvort eigi að keyra SQL77, ekki user-visible virkni.

Eftir að SQL77 hefur verið lagað og keyrt síðar:

1. Keyra manual eða cron refresh fyrir Veðurstofu forecast.
2. Opna ferðaveður með Veðurstofu-provider flaggi.
3. Prófa route nálægt Hellisheiði/Sandskeiði.
4. Velja tíma þar sem ETA lendir á milli forecast slots.
5. Staðfesta að Veðurstofu-spjald sýni prev/used/next úr sömu `Spá gefin út kl.` cycle.
6. Staðfesta að met.no only hegðun breytist ekki þegar Veðurstofan er slökkt.

Ekki keyra production SQL aftur og aftur til að prófa. SQL migration á að keyra einu sinni þegar hún er tilbúin.
