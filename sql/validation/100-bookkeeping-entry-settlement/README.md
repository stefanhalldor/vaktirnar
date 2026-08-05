# SQL100: greiðslustaða bókhaldsfærslna

SQL100 er eingöngu keyrt af Stebba. Codex skrifar og static-prófar skrárnar en
keyrir aldrei SQL eða migration.

1. Veldu rétt Supabase production project og keyrðu `preflight.sql` í SQL Editor.
2. Stoppaðu ef `prerequisites_ok`, `sql99_fix_ok` eða
   `activity_constraint_compatible` er ekki `true`, eða ef einhver
   `existing_target_*`/`unexpected_*` tala er ekki `0`.
3. Keyrðu `sql/100_bookkeeping_entry_settlement.sql` einu sinni.
4. Keyrðu `postflight.sql`. Allir `*_ok` dálkar eiga að vera `true`, allir
   grant/overload/policy/violation dálkar `0` og talningar 11/18/41.

Migrationin stofnar default-deny töflu og eina service-role RPC. Hún breytir
ekki eldri færslum: engin staðaröð merkir `open` með útgáfu `0`. Hún breytir
hvorki VSK-fjárhæðum, A–F, readiness, tímabilsstöðu né filing snapshot.

Ekki keyra SQL98 eða SQL99 aftur eftir SQL100; postflight þeirra geymir
sögulegar talningar frá stöðunni fyrir SQL100.
