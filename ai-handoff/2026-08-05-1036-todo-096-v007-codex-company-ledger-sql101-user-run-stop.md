# TODO #96 v007 — Færslubók fyrirtækis / SQL101 user-run stop

## Plan áfangans

Útfæra fyrstu production-hæfu, flagg-vörðu heildarsneiðina fyrir fyrirtækjafærslur sem lifa ofan VSK-tímabila: sparse innhólf, einkafylgiskjöl, útgáfusaga, grófflokkun og formleg VSK-tenging með fyrir/eftir forskoðun. Stöðva áður en nokkuð er skrifað í Supabase eða gefið út.

## Hvað var raunverulega gert

- Skrifuð additive SQL101 migration með fimm default-deny töflum, tólf service-role-only RPCs og fjórum private helpers.
- Búinn til private `bookkeeping-private` Storage bucket, 15 MB hámark og JPEG/PNG/WebP/PDF allowlist.
- Útfært tveggja skrefa direct-upload flæði: signed upload, server download, MIME magic-byte/size/SHA-256 sannprófun, ready/rejected lifecycle og engin public URL.
- Útfærð sparse fyrirtækjafærsla óháð VSK-tímabili, CAS/idempotency, no-op update, óbreytanleg revision-saga, ógilding og leiðréttanlegt `not_applicable` VSK-val.
- Núverandi `bookkeeping_entries` og A–F/readiness/filing eru óbreytt. Aðeins atomic `bookkeeping_link_transaction_to_vat_entry` býr til venjulega VSK-færslu og immutable formal link.
- Bætt við entity-scoped listaflæði, síum með talningum, handvirkri skráningu, fylgiskjali, detail/edit/history og server-side VSK fyrir/eftir preview.
- Bætt við blocking `loading.tsx` á öllum nýjum route-segments og signed-download API sem sannreynir session, flagg og owner-aðild áður en 60 sekúndna slóð er mynduð.
- UI fylgir `Design.md`: mobile-first, 16px inputs, minnst 40/44px controls, engin föst breidd, overflow-safe síur/töflur og sýnileg pending/loading state.

## Skrár sem voru skoðaðar

- `AGENTS.md`, `WORKFLOW.md`, `Design.md`
- `sql/98_bookkeeping_vat_workbook.sql`, `sql/99_bookkeeping_entry_json_fix.sql`, `sql/100_bookkeeping_entry_settlement.sql`
- Núverandi `app/auth-mvp/bokhaldid/**`, `components/bookkeeping/**`, `lib/bookkeeping/**`, Supabase client/admin helpers og Bókhaldið-próf.

## Skrár sem voru breyttar eða búnar til

- `sql/101_bookkeeping_company_ledger_inbox.sql`
- `sql/validation/101-bookkeeping-company-ledger-inbox/{preflight.sql,postflight.sql,README.md}`
- `app/api/bookkeeping/attachments/[attachmentId]/route.ts`
- `app/auth-mvp/bokhaldid/einingar/[entityId]/faerslur/**`
- `components/bookkeeping/BookkeepingDashboard.tsx`
- `components/bookkeeping/BookkeepingAttachmentUpload.tsx`
- `components/bookkeeping/BookkeepingCompanyLedger.tsx`
- `components/bookkeeping/BookkeepingCompanyTransactionDetail.tsx`
- `components/bookkeeping/BookkeepingCompanyTransactionForm.tsx`
- `components/bookkeeping/BookkeepingVatLinkForm.tsx`
- `components/bookkeeping/__tests__/bookkeeping-company-ledger-ui.test.tsx`
- `lib/bookkeeping/{actions.ts,attachments.server.ts,constants.ts,repository.server.ts,types.ts,validation.ts}`
- `lib/__tests__/bookkeeping-{attachments,company-transaction-validation,sql101-migration}.test.ts`
- `messages/{is,en}.json`
- Þessi handoff-skrá.

## Skipanir og niðurstöður

- `npm.cmd run type-check` — exit 0.
- Markpróf SQL101/domain/storage/UI — 18 passed, exit 0.
- `npm.cmd run test:run` — 282 test files passed, 1 skipped; 5235 tests passed, 28 skipped, 8 todo; exit 0.
- `npm.cmd run build` — production build, type/lint og 124 static pages grænt; exit 0. Aðeins fyrirliggjandi warnings utan þessa breytingasviðs.
- JSON parse fyrir `messages/is.json` og `messages/en.json` — grænt.
- Nýi `bookkeeping.ledger` namespace: 68/68 lyklar í báðum tungumálum, engin vöntun.
- Global locale parity fann fyrirliggjandi, ótengdan `teskeid.hero` mismun; honum var ekki breytt.
- `git diff --check` — exit 0; aðeins line-ending warnings í fyrirliggjandi dirty skrám.

## Hvað var ekki gert

- SQL101, preflight og postflight voru aðeins skrifuð. Þau voru aldrei keyrð.
- Engin Supabase/Storage fyrirspurn eða skrif voru framkvæmd af Codex.
- Enginn dev server var ræstur eða endurræstur og ekkert browserpróf var keyrt.
- Ekkert commit, push, Vercel deployment, production env-breyting eða feature activation var gert.
- `TODO.md` og `DONE.md` voru ekki snert.
- Ótengdar dirty/untracked breytingar voru varðveittar.

## Ákvarðanir

- `bookkeeping_transactions` er canonical company-level record; VSK-færsla er áfram period-bound projection.
- Sparse handvirk færsla þarf lýsingu. Upload-only færsla verður aðeins sýnileg þegar ready attachment er til.
- Færslur utan VSK hafa engin áhrif á A–F/readiness/filing og blokka ekki skil.
- Formal link geymir source transaction version. Seinni breyting sýnir drift en breytir VSK-færslu aldrei sjálfkrafa.
- Fylgiskjalabinary fer í private Storage; DB geymir aðeins metadata/hash/path/status. Object path er random og inniheldur ekkert nafn, user ID eða business texta.
- SQL write-authority er áfram eingöngu hjá Stebba.

## Áhætta sem er enn til staðar

- SQL101 hefur aðeins farið í static regression tests og build; raunverulegur PostgreSQL parser/runtime verður fyrst sannreyndur þegar Stebbi keyrir preflight/migration/postflight.
- Localhost app-flæðið getur ekki virkað fyrr en SQL101 hefur verið keyrt í gagnagrunninum sem `.env.local` vísar á.
- Ef `.env.local` vísar á production mun localhost-prófun búa til raunverulegar production færslur og private Storage objects. Nota skal greinilega merkt prófunargögn og ógilda þau eftir próf; ekki hlaða upp viðkvæmu frumgagni í fyrsta smoke-prófi.
- Pending upload getur staðið eftir ef browser lokast milli prepare og upload/finalize. Hann er default-deny og ósýnilegur en sjálfvirk garbage collection er ekki hluti af þessum áfanga.

## Næsta skref

Stebbi keyrir einn SQL101 preflight, migration og postflight samkvæmt README. Codex sannreynir niðurstöðurnar read-only úr pasted result, síðan prófar Stebbi localhost. Nýtt, afmarkað leyfi þarf áður en commit/push/deploy er gert.

## Spurningar sem Codex á sérstaklega að rýna

- Eru öll postflight `*_ok` true og row counts 0?
- Eru exact counts 16 bookkeeping tables, 30 service-role RPC grants og 57 bookkeeping functions?
- Virkar upload → verification → detail með raunverulegu Supabase Storage signed-upload flæði?
- Sýnir VSK preview rétt fyrir/eftir A–F og breytist ekkert fyrr en staðfest er?

## Supabase

- SQL-skrá: `sql/101_bookkeeping_company_ledger_inbox.sql`.
- Staða: aðeins skrifuð, aldrei keyrð.
- Gögn: engin backfill; postflight krefst 0 transaction/attachment/link rows fyrir fyrstu notkun.
- RLS/grants: RLS + FORCE RLS á öllum fimm töflum; engar policies eða direct table grants; aðeins nákvæm service-role execute grants á app-facing RPCs.
- Auth: membership og beta access eru sannreynd í hverri RPC; auth FK eru nullable `ON DELETE SET NULL`.
- Storage: eitt private bucket, engar public policies/slóðir.
- Núverandi VSK: SQL98–100 töflur, A–F, readiness, filing snapshots og settlement eru ekki breytt.

## Localhost checks for Stebbi

### Fyrst: SQL sem aðeins Stebbi keyrir

1. Veldu rétta Supabase projectið og opnaðu SQL editor.
2. Keyrðu `sql/validation/101-bookkeeping-company-ledger-inbox/preflight.sql`.
3. Haltu aðeins áfram ef `prerequisites_ok=true`, `storage_prerequisites_ok=true`, target arrays eru tómar, gömlu transactions eru 0 og grunnfjöldar eru 11/18/41.
4. Keyrðu `sql/101_bookkeeping_company_ledger_inbox.sql` einu sinni.
5. Keyrðu `sql/validation/101-bookkeeping-company-ledger-inbox/postflight.sql`.
6. Sendu Codex alla einu result-röðina. Allir `*_ok` reitir eiga að vera true, row counts 0 og exact totals 16/30/57.

### Síðan: localhost sem Stebbi ræsir sjálfur

Forsendur: `BOOKKEEPING_ENABLED=true` localt, innskráður sem flaggaður eigandi að „Gott vibe“, SQL101 postflight grænt.

1. Opna `/auth-mvp/bokhaldid` og ýta á „Opna færslubók“ á Gott vibe.
2. Prófa á 360, 390 og 460px viewport: enginn horizontal page overflow/zoom; filterröðin má scrolla lárétt; controls eru auðveld í snertingu.
3. Stofna sparse handvirka færslu með aðeins lýsingu. Vænt: hún birtist í „Allar“ og „Óflokkaðar“, án áhrifa á nokkurt VSK-tímabil.
4. Stofna aðra færslu með JPEG/PNG/WebP eða PDF undir 15 MB. Vænt: pending/loading feedback, síðan detail með private „Opna“ fylgiskjalstengli; URL er tímabundin, ekki public.
5. Breyta direction, dagsetningu, fjárhæð með þúsundapunktum, mótaðila/kind og grófflokki. Vænt: ný revision/version; no-op save býr ekki til nýja revision.
6. Merkja færslu „á ekki við VSK“, staðfesta rétta síu/talningu og setja hana aftur í VSK-flokkun.
7. Opna „Flokka og taka með í VSK-tímabil“, velja opið draft/review tímabil og VSK-meðferð. Vænt: fyrir/eftir A–F og blocker-count birtist áður en nokkuð vistast.
8. Hætta við preview. Vænt: engin VSK-færsla eða linkur verður til.
9. Endurtaka og staðfesta. Vænt: atomic VSK-færsla + formleg tenging, period opnast og A–F stemma við preview.
10. Breyta upprunalegu fyrirtækjafærslunni eftir tengingu. Vænt: drift-warning; VSK-færslan og filing data breytast ekki sjálfkrafa.
11. Ógilda ólinkað prófunaratriði. Vænt: það færist í „Ógildar“ og revision-sagan varðveitist.

Öryggisvarúð: ef localhost vísar á production eru skref 3–11 raunveruleg production skrif. Ekki nota viðkvæmt fylgiskjal í fyrsta prófi. Ekki reyna að keyra SQL101 aftur ef postflight er þegar grænt; stöðva og senda Codex niðurstöðuna ef nokkur check er false.
