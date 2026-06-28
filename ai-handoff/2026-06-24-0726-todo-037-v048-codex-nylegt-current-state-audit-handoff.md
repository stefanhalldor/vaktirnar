# #37 v048 - `Ólesið` stöðurýni og lokaáætlun

**TODO:** #37 - `Nýlegt` sýni öll ólesin events og breytingasamhengi

**Agent:** Codex

**Staða:** #37 er enn opið í `TODO.md`, en stór hluti virðist þegar kominn í kóða. Claude Code á ekki að byrja á stórri endurútfærslu. Fyrsta skref er stöðurýni: staðfesta hvað er komið, finna hvort eitthvað vantar enn, og gera aðeins litlar breytingar ef raunveruleg vöntun finnst.

## Samhengi

`TODO.md` segir að #37 eigi að gera `Nýlegt` að raunverulegu ólesnu yfirliti:

- sýna öll ólesin events, það er atburði, ekki bara þrjú;
- sýna breytingasamhengi, til dæmis fyrra og nýtt gildi;
- halda mobile-first upplifun rólegri þótt mörg ólesin events séu til;
- passa að pending invitation events týnist ekki eða birtist tvisvar;
- passa að recipient email og önnur viðkvæm gögn leki ekki í client payload, UI eða logs.

Í þessu skjali eru ensk kóðaheiti látin standa þegar þau vísa beint í núverandi kóða, til dæmis `event`, `payload`, `viewHref`, `ack_at` og `recent_events`.

Codex las `Design.md` fyrir viðkomandi UI-reglur: mobile app-upplifun, heimaskjá innskráðra notenda, navigation feedback, controls og microcopy. Lausnin á að vera lítil og app-leg, ekki nýr stór inbox-skjár inni á heimaskjánum.

## Nýleg staða sem Codex fann

Þetta er ekki óunnið frá grunni:

- `lib/recent-events/helpers.server.ts` sækir nú öll ólesin events ef ekkert `limit` er sent. `getUnreadRecentEventsForUser(user.id)` í `app/auth-mvp/heim/page.tsx` notar ekki limit.
- `lib/__tests__/home-page.test.tsx` hefur próf fyrir 3, 4 og 6 ólesin events, og scroll-container fyrir fleiri en 5.
- `app/auth-mvp/heim/page.tsx` byggir `detailLines` úr `payload.changes` fyrir `item_name`, `loaned_at`, `due_at` og `note`.
- `lib/loans/event-diff.ts` reiknar breytingar fyrir `item_name`, `loaned_at`, `due_at` og `note`.
- `lib/loans/actions.ts` skráir `loan_updated` diff fyrir `updateLoanItemDetails` og sendir event á mótaðila ef `counterpart_user_id` er til og er ekki sami notandi og framkvæmdi breytinguna.
- `claimInvitation` og `declineInvitation` merkja `loans:invitation:<id>:received` sem lesið, svo sama pending boð haldist ekki ólesið eftir að notandi tekur afstöðu.
- #52 er lokið í `DONE.md`: pending og accepted loan-events úr `Ólesið` geta opnað rétta detail-síðu. `Skoða` er aftur til staðar í drawer fyrir events sem má opna og merkir eventið lesið án þess að tefja navigation.

## Mikilvægt: ekki enduropna leyst atriði

Claude Code á ekki að:

- setja aftur þriggja atriða hámark;
- fela `Skoða` aftur;
- endurbyggja `recent_events` grunninn;
- breyta SQL, RLS, grants eða policies í fyrsta skrefi;
- flytja #52 aftur í TODO;
- loka #38 eða #39 sem hluta af #37 nema Stebbi biðji sérstaklega um það.

## Markmið þessa handoff

Klára #37 með minnsta örugga skrefi:

1. Staðfesta hvað er þegar lokið.
2. Finna hvað vantar enn, ef eitthvað vantar.
3. Gera aðeins litlar kóða-, test- eða textabreytingar ef vöntun er staðfest.
4. Ef vöntunin krefst SQL, RPC-signature breytingar, RLS, auth, production data eða breiðari domain-ákvörðunar: stoppa og skila nýju plani til Stebba/Codex.

## Phase 0 - stöðurýni fyrst

Claude Code skal fyrst gera stöðutöflu í handoff/closeout svari, að minnsta kosti fyrir þessi skilyrði:

| Krafa úr #37 | Staða núna | Sönnunargögn | Ákvörðun |
| --- | --- | --- | --- |
| Fleiri en þrjú ólesin events birtast | Líklega lokið | `getUnreadRecentEventsForUser` án limit + heimaskjápróf | Staðfesta með prófi |
| `Lesið` og `Allt lesið` merkja rétt events sem lesin | Líklega lokið | `ackRecentEventsForUser` síar á `user_id` + próf | Staðfesta með prófi |
| Breytt skiladagsetning sýnir fyrra og nýtt gildi | Kóða-stuðningur er til, UI-próf má styrkja | `buildDetailLines`, messages | Bæta prófi ef vantar |
| Fjarlægð skiladagsetning sýnir fyrra gildi | Kóða-stuðningur er til, UI-próf má styrkja | `eventDetailReturnDateRemoved` | Bæta prófi ef vantar |
| Note/item/loaned_at diff birtist rétt | Kóða-stuðningur er til, test coverage misjafnt | `computeLoanChanges`, drawer-próf | Bæta targeted tests ef vantar |
| Pending boð tvíteljast ekki eða týnast ekki | Að hluta lokið í #52 | `recordRecentEvent updateOnConflict:false`, `get_my_loans` guarantor | Staðfesta með núverandi prófum |
| Recipient email lekur ekki | Líklega í lagi, en þarf audit | payload notar `itemName`, engin email logs eiga að vera til | Staðfesta með code search |
| Mobile 360-460 px með mörg events | UI hefur max-h/scroll | `RecentSection` max-h-72 þegar >5 | Localhost pre-check |

Ef stöðurýni sýnir að allt #37 er í raun lokið skal Claude Code ekki finna upp vinnu. Þá skal skila closeout sem mælir með að færa #37 í DONE, með skýrri lýsingu, prófaniðurstöðum og localhost-checks.

## Leyfileg lítil framkvæmd ef eitthvað vantar

Claude Code má, innan þessa handoff, gera eftirfarandi afmarkaðar breytingar:

- bæta unit/component prófum fyrir `buildDetailLines` rendering í `lib/__tests__/home-page.test.tsx`;
- bæta prófum í `lib/__tests__/event-diff.test.ts` ef diff-helper hefur coverage holu;
- laga augljósa texta- eða formatting-villu í `messages/is.json` og `messages/en.json` ef próf sýnir rangan detail texta;
- laga litla UI overflow/wrapping villu í `app/auth-mvp/heim/RecentSection.tsx`, til dæmis ef detail lines brjótast ekki rétt;
- laga litla `viewHref` eða ack regression sem er innan núverandi samninga og krefst ekki SQL.

Ef breytingin snertir `lib/loans/actions.ts` má hún aðeins vera innan núverandi function contracts og prófa. Ekki bæta við nýjum DB return fields eða breyta RPC contracti án sérstaks plans.

## Líklegustu atriði sem þarf að skoða

### 1. Drawer detail-line coverage

Núverandi `home-page.test.tsx` virðist aðeins prófa drawer detail-line fyrir `item_name`.

Claude Code ætti að bæta targeted tests fyrir:

- `due_at` added;
- `due_at` changed;
- `due_at` removed;
- `loaned_at` changed;
- `note` added;
- `note` changed;
- `note` removed.

Ef öll prófin fara strax í gegn er það góð staðfesting á að #37 breytingasamhengi sé komið.

### 2. `updateLoan` vs `updateLoanItemDetails`

`updateLoanItemDetails` skráir event fyrir mótaðila. `updateLoan` skráir aðeins event fyrir notandann sem framkvæmir breytinguna og merkir það strax lesið með `initiallyRead: true`. `rg` sýndi ekki augljósa app-notkun á `updateLoan` utan prófa.

Claude Code skal:

- staðfesta hvort `updateLoan` er legacy export eða notað í route sem notandi getur enn opnað;
- ef það er legacy/dead code, ekki breyta;
- ef það er notað í virku UI þar sem mótaðili ætti að fá event, stoppa og skila plani, því það gæti krafist nýs return-field úr RPC, til dæmis `counterpart_user_id`, eða annarrar heimildarlogik.

### 3. `loan_returned` / `loan_return_undone` samhengi

#37 nefndi `skilað/óskilað state`. Nú eru sérstök event labels til fyrir returned/return-undone, en ekki diff payload með before/after state.

Claude Code skal meta hvort núverandi labels teljist nægt samhengi fyrir #37. Codex telur líklega já fyrir þennan áfanga, nema Stebbi vilji sérstaka drawer detail-línu eins og "Staða: skilað". Ekki bæta state-diff við án product ákvörðunar.

### 4. Decline/accepted invitation

`claimInvitation` og `declineInvitation` skrá accepted/declined events fyrir þann sem bjó boðið til og merkja received event hjá viðtakanda sem lesið. Þetta tengist #38 og #27, en #38 er enn opið í TODO.

Claude Code má nota þessa hegðun sem staðfestingu fyrir #37, en á ekki að færa #38 í DONE í þessu skrefi nema Stebbi biðji um það.

## Öryggi og Supabase

Fyrsta skref á ekki að þurfa SQL.

Ekki keyra SQL. Ekki breyta:

- `sql/46_recent_events.sql`;
- `sql/47_fix_href_constraint.sql`;
- RLS policies;
- grants;
- auth/session guards;
- feature gates;
- production data;
- Supabase functions/RPC signatures.

Ef stöðurýni leiðir í SQL/RPC þörf skal stoppa. Skila nýju handoffi með:

- nákvæmri migration-skrá;
- hvort migration breytir schema, gögnum, functions, grants eða RLS;
- idempotency og rollback/recovery plan;
- production impact;
- explicit approval text fyrir Stebba.

## Tillaga að framkvæmdarröð

1. Keyra leit til að staðfesta stöðuna:
   - `rg -n "getUnreadRecentEventsForUser|recordRecentEvent|ackRecentEventByKey|buildDetailLines|changes|recent-list|viewHref" app/auth-mvp/heim lib/recent-events lib/loans lib/__tests__`
   - `rg -n "updateLoan\\(|updateLoanItemDetails\\(" app components lib`
2. Keyra afmörkuð baseline-próf:
   - `npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/event-diff.test.ts lib/__tests__/mark-recent-read-action.test.ts lib/__tests__/record-recent-event.test.ts`
3. Bæta aðeins prófum sem vantar fyrir staðfest #37 atriði.
4. Laga aðeins ef próf eða skoðun sýna raunverulega núverandi villu.
5. Keyra:
   - `npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/event-diff.test.ts lib/__tests__/mark-recent-read-action.test.ts lib/__tests__/record-recent-event.test.ts`
   - `npm run type-check`
6. Ef `lib/loans/actions.ts` var snert, keyra líka:
   - `npm run test:run -- lib/__tests__/actions.test.ts`

Ekki ræsa eða endurræsa localhost/dev server. Stebbi sér sjálfur um localhost.

## Handvirk forprófun áður en framkvæmd hefst

Stebbi getur prófað þetta áður en Claude Code breytir nokkru, ef það hjálpar:

1. Skrá inn notanda með `LOANS_ENABLED=true`.
2. Opna `/auth-mvp/heim`.
3. Ef notandi er með fleiri en 5 ólesin events, staðfesta að `Ólesið` scrolli inni í listanum og sprengi ekki fyrsta skjáinn.
4. Opna ólesið `Breytt: ...` event.
5. Staðfesta að drawer sýni detail-línur fyrir breytingar ef slíkt event er til.
6. Smella á `Skoða` á event sem má opna og staðfesta að rétt `Lánað og skilað` detail-síða eða fallback/highlight leið opnist.
7. Nota `Lesið` fyrir eitt event og `Allt lesið` fyrir öll events; staðfesta að aðeins rétt ólesin atriði hverfi.

Ef núverandi localhost-hegðun er þegar rétt og engin prófagöt skipta máli getur Stebbi ákveðið að #37 eigi einfaldlega að fara í DONE eftir stöðurýni.

## Localhost checks for Stebbi

Eftir vinnu Claude Code skal Stebbi prófa:

1. `/auth-mvp/heim` sem innskráður notandi með `Lánað og skilað` virkt.
2. Stöðu með að minnsta kosti 4 ólesnum events. Vænt niðurstaða: öll 4 eru sýnileg eða aðgengileg í `Ólesið`; gamla 3ja atriða hámarkið er ekki til staðar.
3. Stöðu með 6+ ólesnum events. Vænt niðurstaða: `Ólesið` notar afmarkað scroll-svæði, enginn láréttur overflow, ekkert overlap, og restin af heimaskjánum er nothæf í 360-460 px mobile breidd.
4. Breyta láni sem hefur mótaðila, til dæmis heiti eða athugasemd. Vænt niðurstaða fyrir mótaðila: `Ólesið` sýnir `Breytt: <hlutur>` og drawer sýnir fyrra/nýtt samhengi.
5. Breyta skiladegi, sérstaklega fjarlægja skiladag. Vænt niðurstaða: drawer segir að skiladagur hafi verið fjarlægður og sýnir fyrri dagsetningu.
6. `Skoða` á venjulegu loan event. Vænt niðurstaða: opnar `/auth-mvp/lanad-og-skilad/<loan_id>` með route loading feedback.
7. `Skoða` á pending invitation event. Vænt niðurstaða: opnar rétta detail-síðu ef matching loan finnst, annars fallback á `?invitation=<id>` highlight.
8. `Lesið` á einu event. Vænt niðurstaða: aðeins það event hverfur.
9. `Allt lesið`. Vænt niðurstaða: öll birt ólesin events hverfa og done banner birtist.
10. Regression: recipient email má ekki birtast í `Ólesið` labels, drawer details, UI, eða console logs.

Ekki prófa production gagnabreytingar eða Supabase SQL kæruleysislega. Ef check krefst raunverulegra production notenda eða gagna skal stoppa og biðja Stebba um sérstakt samþykki og öruggt prófaplan.

## Handoff back from Claude Code should include

1. Hvort #37 sé enn opið, að hluta lokið, eða tilbúið í DONE.
2. Stöðutöflu með sönnunargögnum.
3. Skrár sem voru skoðaðar.
4. Skrár sem voru breyttar.
5. Skipanir sem voru keyrðar, exit codes og mikilvægt output.
6. Hvað var viljandi ekki breytt.
7. Hvort SQL/Supabase/auth/RLS/grants/functions voru snert. Vænt svar fyrir þetta handoff: nei.
8. `Localhost checks for Stebbi` með nákvæmum væntum niðurstöðum.
9. Óvissu eða product-ákvörðun sem Stebbi/Codex þarf að taka.

## Óvissa / þarf að staðfesta

- Codex keyrði ekki browser/manual localhost check. Núverandi mat byggir á lestri á kóða, prófum, `TODO.md`, `DONE.md` og nýlegum handoffum.
- `updateLoan` virðist ekki vera notað af app/components miðað við `rg`, en Claude Code þarf að staðfesta það áður en það er merkt legacy/dead code.
- Það er product-ákvörðun hvort returned/return-undone labels séu nóg samhengi fyrir `skilað/óskilað state` í #37, eða hvort Stebbi vilji sérstakar drawer detail-línur.
- #38 og #39 skarast við event-pakkann en eiga að vera áfram sér TODO nema Stebbi biðji sérstaklega um að loka þeim eða sameina þau.
