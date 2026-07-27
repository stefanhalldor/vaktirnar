# TODO-090 v102 + TODO-093 v004 — HMS attribution framkvæmd

**Created:** 2026-07-27 11:36  
**Timezone:** Atlantic/Reykjavik  
**Agent:** Codex  
**Staða:** Afmörkuð framkvæmd lokið; targeted próf, type-check og lint græn.

## Skilningur á samþykki

Stebbi samþykkti að Codex bætti HMS-attribution við canonical skjöl/kóða og
staðaleitar-UI og keyrði targeted próf, type-check og lint. Samþykkið náði ekki
til commit, push, deploy, SQL, migration-keyrslu, Supabase eða production.

## Hvað var gert

- Bætt var við canonical HMS provenance object með provider, dataset, source
  og terms URL.
- Staðaleitin sýnir nú tengda og þýdda upprunatilvísun aðeins þegar opinn
  niðurstöðulisti inniheldur sýnilega HMS-niðurstöðu.
- Tilvísunin er fyrir utan ARIA `listbox`, svo aðeins raunverulegar niðurstöður
  halda `option` hlutverki og keyboard/combobox contract helst óbreytt.
- Attribution hverfur þegar listinn lokast eða niðurstöður koma ekki frá HMS.
- Íslenskur og enskur texti var settur í message-skrár, ekki hardcode-aður í JSX.
- `DataLicenses.md` skráir HMS-notkun, canonical orðalag, opinberar heimildir,
  attribution-skyldu, ábyrgðarfyrirvara og vikulegt LKG refresh-mynstur.
- UI-próf staðfestir sýnileika, link-contract og að attribution leki ekki yfir
  á static niðurstöður.

Canonical íslenskt orðalag:

`Byggir á upplýsingum úr Staðfangaskrá HMS.`

## Skrár breyttar

- `DataLicenses.md`
- `components/weather/PlaceSearch.tsx`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/place-search-ui.test.tsx`
- `lib/places/hmsAttribution.ts` (ný)

## Skipanir og niðurstöður

1. `npm.cmd run test:run -- lib/__tests__/place-search-ui.test.tsx`
   - Exit 0
   - 1 test file, 6/6 próf græn
2. PowerShell `ConvertFrom-Json` á `messages/is.json` og `messages/en.json`
   - Exit 0
3. `npm.cmd run type-check`
   - Exit 0
4. `npm.cmd run lint -- --file components/weather/PlaceSearch.tsx --file lib/places/hmsAttribution.ts --file lib/__tests__/place-search-ui.test.tsx`
   - Exit 0
   - Engar ESLint villur eða viðvaranir; aðeins almenn Next.js 16 deprecation
     tilkynning um `next lint`
5. `git diff --check`
   - Exit 0
   - Engin whitespace-villa; fyrirliggjandi LF→CRLF viðvaranir á Windows

## Design.md samræmi

- Núverandi 16 px search input, focus og combobox hegðun var ekki breytt.
- Attribution er stutt, wrappanleg og inni í `min-w-0` flex wrapper; hún bætir
  ekki við láréttum overflow-hætti.
- Linkurinn hefur sýnilegt focus ring og opnast sem venjulegur utanaðkomandi
  heimildatengill.
- Breytingin bætir ekki við navigation-pending þörf inni í appinu.

## Supabase, SQL og production

- SQL keyrð: nei.
- Migration keyrð: nei.
- Supabase lesið/skrifað: nei.
- Env eða secrets breytt: nei.
- Commit/push/deploy: nei.
- Production-breyting: engin.

## Eftirstandandi áhætta

- Attribution hefur verið component-prófuð en ekki enn séð með raunverulegum
  HMS-niðurstöðum í browser, því HMS migration/import hefur ekki verið keyrt.
- Stóri dirty worktree-inn er óbreyttur; næsta commit þarf afmarkaða yfirferð á
  heildarscope TODO-090/093.
- Full suite/build var ekki endurtekin samkvæmt afmörkuðu leyfi; þau voru græn í
  næsta fyrra prerelease-áfanga og þessi breyting fór í targeted checks.

## Næsta skref

Stebbi staðfestir attribution sjónrænt á localhost þegar HMS-gögn eru tiltæk.
Því næst þarf sérstakt leyfi fyrir commit, síðan sérstakt leyfi fyrir push og
Vercel/deploy. Fyrsti deploy á áfram að halda HMS search og refresh óvirku þar
til production migration og controlled import hafa verið keyrð.

## Localhost checks for Stebbi

### Núna, áður en HMS migration/import er keyrt

1. Opna `/auth-mvp/vedrid` innskráður.
2. Staðfesta að staðaleitin, saved places og mobile-only
   „Nota núverandi staðsetningu“ líti óbreytt út.
3. Leita að stað sem kemur frá static eða tímabundnu Google fallbacki.
4. Vænt niðurstaða: enginn HMS-attribution texti birtist, því engin HMS-gögn
   eru í sýnilegum niðurstöðum.

### Eftir controlled HMS import með sérstöku leyfi

1. Local env: `HMS_PLACE_SEARCH_ENABLED=true` og
   `PLACE_SEARCH_GOOGLE_FALLBACK_ENABLED=false`.
2. Leita að `Melás` eða `Melás 8`.
3. Vænt niðurstaða: undir opna niðurstöðulistanum birtist
   „Byggir á upplýsingum úr Staðfangaskrá HMS.“
4. Smella eða tabba á tengilinn. Hann á að hafa focus ring og opna opinber
   lýsigögn HMS í nýjum flipa.
5. Ýta á Escape. Bæði niðurstöðulisti og attribution eiga að hverfa.
6. Prófa við 360, 390, 460 og 768 px breidd. Textinn má wrap-a en ekki valda
   láréttu overflowi, mobile zoomi eða missa input úr fókus.

**Varúð:** Ekki keyra `sql/94`, HMS import, production env breytingu eða deploy
sem hluta af þessum localhost-checks án sértæks leyfis. Aðeins production
Supabase er til og slík skref geta breytt schema/gögnum eða valdið DB-álagi.

