# v033 — SQL-frír localhost-prófskjár og v2 undirbúningur

Created: 2026-09-15 23:50 Atlantic/Reykjavik. Writer: Codex.
Task: expense-receipt-item-claims. Base: 57a57d33c093a89ef38dd087acfa2b789897435d.
Candidate: C:/Users/Lenovo/AppData/Local/Temp/teskeid-task-expense-receipt-item-claims-20260913-v2.

## Mannamál og current gate

Prófskjár með brotavali, tveimur heildum, liðabreytingum, skýringum og
Eftir/Búið flokkun er tilbúinn á http://localhost:3004/preview/splitt-v032.
Hann notar aðeins sýnigögn í minni. Endurhleðsla endurstillir þau.
Vélræn UI-próf og þrjár vafrabreiddir hafa staðist; Stebbi þarf nú að prófa
framsetningu og snertilyklaborð á sínum síma áður en UI-áfanganum er lokað.
Framkvæmdarleyfi liggur þegar fyrir og er ekki beðið aftur um það.

**NEI — EKKI KEYRA SQL NÚNA.** Nýr gagnagrunnspakki hefur ekki verið skrifaður
eða afhentur. Eftir localhost UI-sannprófun heldur Codex sjálfkrafa áfram í
heimilaðan gagnasamnings-/SQL-undirbúning. SQL182/183 haldast óbreytt uppsett.

## Umboð og reglur

Stebbi samþykkti v032 með ítarlegum ákvörðunum í viðhengi ae387898-4dfe-429a-9e16-326c0a596a0e/pasted-text.txt.
Það heimilar framkvæmd fyrst á SQL-fríum localhost og síðan undirbúning SQL;
ekki SQL-keyrslu eða release. Sameiginlegt C:/Users/Lenovo/Documents/WORKFLOW.md
v8 gildir, ásamt verkefnisreglum og Design.md. WORKFLOW heldur nauðsynlegu
notendaprófi sem gátt; hér vantar raunverulega mobile-upplifun, ekki nýtt leyfi.
GoLive task er in_progress, Codex writer. Enginn annar agent var ræstur.

## Breytingar á verkefnalýsingu

- Fyrri texti „í rýni / engin framkvæmd heimiluð“ tekinn út: skýrt leyfi er komið.
- Læst standalone scale=3000 og ×3 legacy boundary, enginn Expense-scale flutningur.
- Læstar aðskildar heildir, engin mismunarhindrun, append breytir ekki kvittunarviðmiði.
- Owner-only edit, stable item/claim identity, varðveitt einingamagn, revision/lock/idempotency.
- Núllverðsregla leiðrétt frá tillögu v032: hafna núllverði meðan claims eru til.
- Eftir/Búið, pillusía utan lokaðrar skúffu, focus/draft/open-state og 8s poll skráð.
- Skýringar varðveita upprunalegt heiti, optional JSON/myndreitir, textabirting,
  review flag og engin sjálfvirk provider-köll.
- Greint skýrt milli samþykkts v2-markmiðs, tilbúins sýnigagnaskjás og enn virks v1.
- Bætt beinni prófslóð, evidence, næstu framkvæmdarskrefum og þessum handoff-hlekk.
- Stöðugt fjárhæðasnið skráð í stað server/client Intl placement ósamræmis.

## Plan og raunveruleg framkvæmd

Fyrsti áfangi samkvæmt fyrirmælum var SQL-frí UI-útfærsla. Hann inniheldur:

- Dev-only/noindex route með canonical loading.tsx; production/test fá notFound.
- Þriðjunga, hálfa og fjórðunga nákvæma, auk heilla eininga og stuðnings við önnur
  nákvæmlega geymanleg gildi. Flýtival setur magn; 1/7 og ógeymsluhæf tugabrot hafnað.
- Stebbi/Anna/Björn sýnigögn, wine/coffee/beer/water/zero-price cake. Engin raunauðkenni.
- Kvittunarviðmið 100 EUR, línusumma 96 EUR, sýnileg vöntun 4 EUR í upphafi.
- Owner edit á magni/verði/heiti/skýringu og reference total. Add hækkar aðeins línusummu.
- Val varðveitir item identity og magn. Undirboð valins magns/núllverð með claims hafnað.
- Collapsed drawer, canonical multi-select pillur, focus/draft pin við endurflokkun.
- Sýnd remote aðgerð og 8s/focus refresh. Engin raunveruleg nettenging eða realtime push.
- „Nýr sýnireikningur í yfirferð“ sannar að mismunur hindrar ekki upphaf skiptingar.
- Skýrt prófunarmerki; ekkert loforð um varanlega vistun eða Production-tengingu.

Sjálfstæður v2 undirbúningur sem bíður tengingar:

- Strict versioned JSON boundary; legacy milli×3, gamla JSON án skýringa áfram gilt.
- Read-only legacy session adapter varðveitir auðkenni, claims og stored total.
  Hann merkir uppruna total sem legacy_stored_total og býr ekki til upprunalega heild.
  Vantar authoritative item revisions í v1; canWriteV2=false, revision=null.
  Hann veitir því ekki heimild til að senda v2 mutations byggt á gömlu snapshoti.
- V2 edit/claim envelope krefst version/scale/revision og bannar client actor field.

## Skrár breyttar í þessum áfanga

Nýjar:

- app/preview/splitt-v032/page.tsx
- app/preview/splitt-v032/loading.tsx
- components/receipt-split/preview/SplitPreview.tsx
- lib/receipt-split/quantity-v2.ts
- lib/receipt-split/preview-model.ts
- lib/receipt-split/contracts-v2.ts
- lib/receipt-split/session-v2.ts
- components/receipt-split/__tests__/standalone-receipt-preview-ui.test.tsx
- lib/__tests__/standalone-receipt-preview.test.ts
- lib/__tests__/standalone-receipt-preview-boundary.test.ts
- lib/__tests__/standalone-receipt-v2-compatibility.test.ts
- lib/__tests__/standalone-receipt-session-v2.test.ts
- Þetta handoff.

Breyttar:

- messages/is.json og messages/en.json: ein ný receiptSplitPreview namespace.
- lib/receipt-split/format.ts: stöðugt tungumáls-/myntsnið með BigInt.
  Þetta hefur einnig áhrif á framsetningu í v1. Upphæðir og gögn breytast ekki.
- docs/tasks/expense-receipt-item-claims/expense-receipt-item-claims.md.

Staðbundin óútgefin prófsgögn í .tmp: check-split-preview.cjs, receipt-preview-is.json,
split-preview-390.png og sér headless-browser profiles. Ekki notendaprófílar.
Önnur fyrirliggjandi candidate/main-workspace dirty gögn voru ekki afturkölluð.

## Skoðað samhengi

Canonical WORKFLOW og repository WORKFLOW/AGENTS/Design, task-lýsing og v032,
fyrri SQL182/183 og artifacts, contracts/actions/server/format fyrir standalone,
sameiginleg receipt allocation/input-money, núverandi SplitBoard og generic pillur,
messages og fyrri standalone/Expense/auth/middleware próf. GoLive-lýsing var lesin
aftur fyrir uppfærslu; verkefnisstaða og priority eru óbreytt.

## Prófanir og skipanir

- npm.cmd run test:run -- middleware.test standalone-receipt expense-receipt
  expense-sql180-zero-total-review teskeid-launcher.test login-next teskeid-multi-select-pill-filter
  → 286/286 próf í 19 skrám PASS, exit 0, 23:43. Þetta var fyrir session-adapter viðbót.
- npm.cmd run test:run -- standalone-receipt-session-v2 standalone-receipt-v2-compatibility
  → 8/8 PASS í tveimur skrám, exit 0, 23:50. Þrjú eru ný session-próf.
  Samtals 289 mismunandi próf hafa staðist; ekki fullyrt að þau hafi öll keyrt í einum lokahring.
- npm.cmd run type-check → PASS, exit 0 eftir UI/contract breytingar.
- Afmarkað next lint á preview route/UI/model/quantity og síðan
  contracts-v2/session-v2/format/compatibility tests → PASS, exit 0.
  Aðeins almenn Next lint deprecation tilkynning.
- git -c core.safecrlf=false diff --check á scoped skrám → PASS.
- HTTP preview → 200. Isolated headless Edge/CDP, engin user-profile eða auth-session:
  360/390/460px: scrollWidth=innerWidth; sýnileg input/select 16px; touch controls
  að minnsta kosti um 40px; engin console/hydration villa eftir leiðréttingu.
- 390px screenshot var skoðað sjónrænt. Enginn láréttur flótti/overlap fannst.
- SQL182/183 migration SHA-256 eru óbreytt frá fyrri afhendingu.

## Leiðréttingar og mörk sannana

Browser-próf fann raunverulegt hydration ósamræmi: Node Intl raðaði mynt öðruvísi
en Edge. Sameiginlegt stöðugt format lagaði það; allar þrjár breiddir endurprófaðar.
Unicode spilltist fyrst við PowerShell pipeline í nýju þýðingunum; UTF8 skrif og
regression-próf laga það. Test typing galli í RTL role options var lagaður.
Fyrsta headless keyrsla í sandbox tafðist; sérstakur headless Edge utan sandbox
með tómu tímabundnu profile keyrði rétt. Aðeins sá spawned process var lokaður.
GoLive PowerShell wrapper krafðist process-local ExecutionPolicy Bypass eins og
fyrri keyrslur. Engri varanlegri Windows-stillingu var breytt.

Ekkert full build keyrt til að trufla ekki dev .next. Engin raunveruleg auth-, DB-,
RLS- eða multi-client concurrency keyrsla í þessum áfanga. Synthetic model/próf
sanna ekki SQL locks/permissions. Raunverulegur sími, skjálesari og Safari eru
óprófuð. Keyboard/focus semantics eru prófuð í DOM og stærðir í Edge.
Demo allocation inniheldur venjulega jákvæða liði og núllverð, ekki tax/tip/discount.
Næsti áfangi verður að prófa þær leiðréttingar gagnvart aðskildri línusummu.

## Næsti þegar heimilaði framkvæmdaráfangi

Eftir localhost UI-sannprófun, án nýrrar almennrar leyfisbeiðni:

1. Fullgera v2 read/command samning og standalone extraction skýringareiti.
   Server sannar session actor eins og nú; aðeins service-role RPC og private schema.
   Client tekur aldrei actor ID. Provider helst aðeins á explicit myndlestraraðgerð.
2. Útfæra v2 application/server breytingascope og backward compatibility.
   Gömul sessions mega lesa/adaptast nákvæmlega; stale v1 write má ekki skipta
   3000 einingum fyrir 1000 eða sleppa revision-vörn. Adapter einn leysir það ekki.
3. Velja additive rollout áður en SQL er afhent: v1 má ekki fá nýtt qty undir sama
   heiti né skrifa gegn v2 splitti. Sama parent lock á upgrade/edit/claim. Ekki
   breyta immutable SQL182/183; nýtt númer og migration/preflight/postflight.
   Stored total er byrjunarviðmið eldri gagna, ekki ágiskuð söguleg original total.
4. Prófa sameiginlega idempotency, revision og authorization: owner edit á móti claim,
   tvö síðustu brot, retry sömu request/different payload, stale device, núllverð,
   magn undir samtals valið, mixed-version höfnun, permissions og delete states.
5. BigInt allocation með óskiptum hluta og tax/discount/tip: claimed+unclaimed=line sum,
   án þess að jafna við receipt reference. Exact þriðjungar og deterministic cents.
6. Static SQL/PLpgSQL parse og rýni, exact pre/postflight catalog/ACL/seal/hashes,
   drift hafnað. Engin SQL-keyrsla agents, hvorki local né Production.
7. Næsta SQL-eigendagátt afhendir nákvæma skrá og skýrt JÁ/NEI-merki. Ekkert SQL
   telst tilbúið til keyrslu af því að þessi áætlun er til.

Þetta handoff lýkur aðeins UI-afhendingu, ekki öllum v2-framkvæmdaráfanganum.

## Localhost checks for Stebbi

Slóð: http://localhost:3004/preview/splitt-v032. Engin innskráning nauðsynleg.
Notar tilbúin sýnigögn; engin Supabase-, provider-, skuldar- eða notendagagnaáhrif.
Ekki endurræsa server; hann keyrir þegar á staðfestum candidate/porti.

1. Veldu ½ eða ⅓ rauðvín og vistaðu; prófaðu mínus/plús. Endurtekið ½ á að
   halda hálfri flösku, ekki bæta annarri við. Magn og fjárhæð eigin hlutar sjást.
2. Opnaðu „Búið að skipta“ og veldu þátttakandapillu. Fullskiptir liðir sjást
   í síunni þótt skúffan hafi verið lokuð. Hálfskiptir liðir eru enn í Eftir.
3. Breyttu magni/verði sem eigandi og prófaðu innslátt á síma. Kvittunarviðmið
   helst, línusumma/mismunur uppfærast. „Nýr sýnireikningur í yfirferð“ gerir
   kleift að hefja skiptingu með mismun. Endurhleðsla endurstillir sýnigögn.

Design.md: canonical pillur/loader, 16px input, mobile breiddir og touch controls,
pending/error feedback, focus varðveitt. Skjálesarapróf er enn eftir; engin vottun
á fullu aðgengi er gefin. Engar Production-, SQL-, boða- eða eyðingarprófanir hér.
