# SQL182 — sjálfstætt splitt með Teskeiðarinnskráningu

## Núverandi handvirka gátt

**NEI — EKKI KEYRA SQL NÚNA (v025).** Preflight skilaði READY,
migration skilaði „Success. No rows returned“ og postflight Stebba er
EXACT_INSTALLED með öllum átta gates=true. SQL-gáttinni er lokið.
Stebbi hefur endurræst localhost:3004 úr task-candidate. Codex staðfesti
beint HTTP 200 og privacy-hausana eftir middleware-leiðréttingu (v026).
Næst er innskráð notendaprófun samkvæmt checklist. Codex keyrir ekkert SQL.

Eftirfarandi lýsir lokinni SQL-gátt, ekki nýrri keyrslubeiðni.
Réttur SQL Editor, staðfestur í fyrri SQL179/180 afhendingum þessa verkefnis:
https://supabase.com/dashboard/project/bpjwgutpzsifjaucvkbk/sql/new

1. Opna postflight.sql og keyra alla skrána sem postgres.
2. Hún les aðeins catalog og bucket-stillingar; engin business-gögn, notendur,
   netföng, myndir, kvittunarlínur eða hlekkjatoken eru lesin. SET search_path
   breytir aðeins nafnavali í session SQL Editor.
3. Vænt ein röð: operator_state=EXACT_INSTALLED, öll átta boolean gates=true.
4. Senda alla niðurstöðuröðina til Codex. STOP eða villa krefst greiningar,
   ekki endurkeyrslu eða breytinga til að sleppa gate.
5. Ekki endurkeyra migration eða keyra SQL181. App-próf bíða exact postflight.

SHA-256 og byte-stærðir við afhendingu eru í task-handoffinu.

## Pakkinn eftir staðfest READY

- 182_standalone_receipt_splits.sql: ein transaction; afmarkað nýtt schema,
  fimm forced-RLS töflur, tveir private helpers, tveir service-role-only RPC,
  nýr private bucket og ein restrictive storage-policy.
- postflight.sql: catalog-only samanburður við seal sem migration skráði og
  exact body-hashes fjögurra yfirfarinna routines. SET search_path snertir aðeins
  session-stillingu SQL Editor; engin business-mutation er framkvæmd.
  Vænt ein röð: EXACT_INSTALLED og öll átta gates=true.
- scripts/receipt-split-sql-artifacts.py: býr til seal/postflight úr candidate;
  keyrir aldrei SQL. Ekki endurskrifa afhent eða uppsett artifact án nýrra hashes.

Nýja schemað er óháð Expense-private-drafts, greiðendum, ledger, entitlement og
finalizer. SQL179/180, eldri kvittanir og fjárhagsfærslur breytast ekki.
SQL181 er áfram ókeyrt HOLD; það er ekki dependency SQL182 og á ekki að keyra.

## Aðgangur og gögn

- Server staðfestir auth.getUser; enginn browser-payload má velja actor/member.
- SQL sannreynir tilvist staðfests, óeydds og óbannaðs reiknings.
- Innskráning ein veitir ekki lesaðgang: eigandi eða aðili viðkomandi splitts
  þarf að eiga membership. Nöfn eru frá server-owned profile, aldrei netföng.
- Gildur 30 daga bearer-hlekkur veitir innskráðum viðtakanda aðild að einu splitti.
  Token fer í URL fragment, er hreinsað og geymt í sessionStorage fyrir login.
  Engin analytics á lendingarsíðu eða login sem kemur þaðan. Owner getur
  endurnýjað token; það afturkallar eldri hlekk en ekki núverandi aðild.
- Private schema hefur engin client-grants/policies. Public RPC hafa eingöngu
  service-role execute. Þessi service-samningur byggir á session-bindingu appisins;
  almenn service-role credential er ekki afhent client.
- Signed upload/download eru gefin eiganda eingöngu. Restrictive policy á nýjum
  bucket kemur í veg fyrir að eldri broad permissive storage-policy opni hann.
  Aðrir bucket-ar fá sömu policy-niðurstöðu og áður.
- JSON skapar engin storage-gögn eða provider-kall. Myndgreining fær aðeins
  eina lease-færslu og gerir ekki sjálfvirkt retry; JSON er endurheimtarleiðin.

## Vistun og samtímis aðgerðir

- Private yfirferð þarf vistun og heildarsummustaðfestingu áður en deiling opnast.
- Núllkrónulínur varðveitast. Jákvæð fjárhæð virkjar venjulega magnskiptingu.
- Splitt-row lock ver breytingu á magni; client sendir fyrra eigið magn svo
  annað tæki sama notanda yfirskrifi ekki nýrra val. Engin yfirúthlutun.
- Request UUID + actor + command + payload-hash ver endurtekningu og breytta
  merkingu sama request. Journal geymir ekki JSON-línur eða hlekkjatoken.
- Eyðing lokar aðgangi áður en mynd er fjarlægð og hefur endurheimtanlega
  deleting-stöðu. Við fulla eyðingu fara línur, claims og membership; lágmarks
  tombstone/request metadata halda retry-samningi. Myndaeyðing ein heldur línum.

## Recovery og takmarkanir

Migration skrifar ekkert yfir fyrirliggjandi namespace: ef eigin objects eru
þegar til þá STOP. Þetta er fail-closed replay, ekki blind enduruppsetning.
Fyrir COMMIT rúllast transaction aftur við villu. Eftir COMMIT skal ekki drop-a
schema, breyta grants eða veikja RLS; nota postflight, afmarkaða greiningu og
yfirfarna forward-fix. Engin sjálfvirk recovery-mutation er heimiluð.

Ekki setja appið í útgáfu fyrr en postflight og runtime/localhost-próf hafa
staðist. Parser-, type-, mock- og static-próf sanna ekki runtime/concurrency/RLS.
Dev server er ekki ræstur eða stöðvaður af Codex.

Signed download getur gilt í 60 sekúndur eftir útgáfu. Fyrirliggjandi signed
upload-token frá Storage getur lifað eftir eyðingarbeiðni; síðbúin upload getur
skilið eftir óaðgengilegan blob. Nýjan URL er ekki hægt að sækja fyrir eytt
splitt. Enginn sjálfvirkur storage-sweep er innifalinn eða heimilaður hér.
Þetta þarf að taka með í runtime/storage-rýni áður en almenn útgáfa er samþykkt.

Supabase signed-upload samningur: https://supabase.com/docs/reference/javascript/file-buckets-uploadtosignedurl

## Localhost checks for Stebbi

Eftir schema-gates, í candidate á localhost:3004 og með eigin synthetic gögnum:

1. Innskráður eigandi, JSON án myndar: drög vistast og birtast eftir refresh.
2. Núllkrónulína: sérstakur fjárhæðarreitur; 4,50 virkar fyrir EUR; óbreytt 0 varðveitist.
3. Vista yfirferð, síðan staðfesta. Röng summa stöðvar staðfestingu.
4. Afrita hlekk: opna í öðrum browser/incognito, skrá inn annan Teskeiðarnotanda
   án ÚL-flags; afturkoma lendir á sama splitti.
5. Taka 1 af 4 espresso: nafn/1 birtist, 3 eftir, fjárhæð aðeins einn fjórði.
6. Aðrir sjá uppfærslu innan 8 sekúndna eða við focus/refresh.
7. Tvö tæki taka síðasta eintak samtímis: aðeins eitt fær það.
8. Pillur sía magn og línufjárhæðir; fjölval OR og hreinsun sýnir alla aftur.
9. Brot eins og 0,5, oddatölur í centum, þjórfé/afsláttur og óskiptur hluti
   halda réttri heildarsummu.
10. Aðili án membership opnar split-ID beint: engin gögn. Meðlimur má ekki
    yfirfara, staðfesta, eyða eða skoða private upprunamynd eiganda.
11. Myndleið með synthetic mynd: eitt provider-kall við skýrt Lesa-val; failure
    býður JSON-innlestur í sama splitt. Þessi prófun getur notað API-inneign.
12. Eyðing á eigin synthetic splitti/mynd: prófa storage failure og endurkomu,
    aðeins á gögnum sem má eyða og innan samþykkts prófunarscopes.
13. Gamalt óbirt eigandadrög-ID: skýr afritun innlesinna lína, ekki skuldafærsla;
    eldri mynd og kvittun eru óbreytt. Published/finalized Expense er ekki afritað.
14. Mobile 360/390/460px: 16px inputs, engin zoom/overflow, langt nafn, keyboard,
    sýnileg villuskil við claim-takka, rétt loading meðan leið er að opnast.
