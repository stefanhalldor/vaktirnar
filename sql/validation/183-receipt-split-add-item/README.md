# SQL183 — Viðbótarliðir eftir að skipting hefst

## Núverandi gátt

NEI — EKKI KEYRA SQL NÚNA (v031). SQL183-gátt lokið.
SQL Editor sem Stebbi notaði:
https://supabase.com/dashboard/project/bpjwgutpzsifjaucvkbk/sql/new

Stebbi hefur skilað operator_state=READY og öllum 10 boolean gates=true.
SQL183 migration skilaði Success. No rows returned hjá Stebba.
Stebbi skilaði postflight EXACT_INSTALLED og öllum 9 boolean gates=true,
þar á meðal addition_ok. Ekki endurkeyra migration.
Næst er innskráð synthetic localhost-prófun samkvæmt checklist að neðan.
HTTP /splitt og innskráningarvörn einkasíðu voru endurstaðfest 22:14.

Preflight og postflight lesa eingöngu catalog og stillingar eins storage-bucket.
Engar kvittanir, notendur, nöfn, netföng, myndir eða deilihlekkir eru lesin.
SET search_path snertir aðeins SQL Editor session. Codex keyrir ekkert SQL.

## Hvað migration gerir síðar

Eitt nýtt public SECURITY DEFINER RPC, postgres-owned, tómt search_path,
eingöngu service_role EXECUTE. Staðfestur actor kemur úr server-session.
RPC krefst eiganda og sharing-state; bætir aðeins við nýjum jákvæðum item,
hækkar heild og version, skráir hash/idempotency-result. Fyrri claims/items
eru ekki uppfærð eða eytt. Row-lock og request-lock samræmast SQL182.

Engin table/RLS-policy/grants-breyting á eldri hlutum, engin auth-,
Expense/ÚL-, storage-, provider- eða gagnamigration. SQL182 er óbreytt.
SQL183 er ekki blindt endurkeyranlegt: nýtt nafn verður að vera ónotað.

## Eftir READY

Codex afhendir exact migration og hashes. Stebbi keyrir hana í transaction.
Við Success afhendir Codex postflight; vænt EXACT_INSTALLED, 8 eldri
gates og addition_ok=true. Engin release eða gagnaprófun er sönnuð af catalog.

## Localhost checks for Stebbi

Fyrir SQL183 má prófa viðbót í yfirferð; hún notar núverandi vistun.
Eftir exact postflight má eigandi bæta nýjum lið í synthetic deilt splitt.
Prófa magn 2 og línufjárhæð 8: nýr liður óskiptur, heild hækkar um 8,
fyrra 1-af-4 espresso val helst. Viðtakandi sér viðbót við focus eða innan
8 sekúndna og getur tekið til sín nýja liðinn.

Tveir owner-gluggar bæta við ólíkum liðum samtímis: báðir eiga að vistast
án þess að heild eða ordinal tapist. Aðrir þátttakendur hafa ekki viðbótarhnapp
og RPC hafnar þeim. Retry sama request má ekki tvískrá. Ekki prófa þetta með
raunverulegum reikningum; aðeins eigin synthetic gögn og samþykkjandi aðilar.

Full mobile/auth checklist er áfram í task-handoffum v026–v028.
