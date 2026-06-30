# DONE

Saga kláraðra og staðfestra atriða.

---

## #62 - Breyta hvort ég lánaði eða fékk lánað

**Lokið:** 2026-06-28  
**Staðfesting:** Claude Code post-release handoff segir að þetta sé komið í
production og að ekkert sé opið frá #62.

Notandi getur nú leiðrétt hvort hann sé lánveitandi eða lántaki á láni sem var
stofnað öfugt. Aðgerðin virkar í báðar áttir, skráir `Saga hlutarins` /
`Ólesið` event og treystir server-side stöðu frekar en client-sendu hlutverki.

Helstu niðurstöður:
- Actual party notar edit-flæðið og sér `Leiðrétta í: Ég lánaði` eða
  `Leiðrétta í: Ég fékk lánað` fyrir ofan formið.
- Pending recipient sér `Leiðrétta hlutverk` á lánaspjaldinu, kemst í
  afmarkað edit-route og sér þar aðeins role-switch aðgerð, ekki item-edit form.
- `switchLoanRole` kallar `switch_loan_role` RPC og sækir `newRole` úr
  gagnagrunni eftir swap; client input ræður ekki nýju hlutverki.
- Pending invitation er uppfært án þess að senda nýjan tölvupóst.
- History sýnir samþykkt product-orðalag:
  `Hlutverki breytt: Ég lánaði` eða `Hlutverki breytt: Ég fékk lánað`.

Skrár og samhengi:
- `sql/63_switch_loan_role.sql` - `switch_loan_role` og
  `get_loan_for_pending_recipient`.
- `sql/64_fix_switch_loan_role_ambiguous_status.sql` - patch á ambiguous
  `status` í `switch_loan_role`.
- `lib/loans/actions.ts` - `switchLoanRole` server action og event-skráning.
- `lib/loans/types.ts` - `canSwitchRole` og control visibility.
- `components/loans/SwitchRoleButton.tsx` - role-switch action.
- `components/loans/LoanCard.tsx` - pending recipient link.
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx` - edit-route með pending
  fallback.
- `lib/loans/history.server.ts`, `messages/is.json` og `messages/en.json` -
  history/event textar.
- `lib/__tests__/actions.test.ts`, `lib/__tests__/loans.test.ts`,
  `lib/__tests__/loan-card.test.tsx`, `lib/__tests__/loan-pages.test.tsx` og
  `lib/__tests__/history-server.test.ts` - regression-próf.

Release og staðfesting:
- Claude Code post-release handoff:
  `ai-handoff/2026-06-28-2217-todo-062-v028-claude-post-release.md`.
- Codex loka-rýni:
  `ai-handoff/2026-06-28-2205-todo-062-v026-codex-v025-review.md`.
- Commit `0d390ed` á `main`, Vercel Ready í production samkvæmt handoff.
- Prófanir í handoff: 1358 tests passing og TypeScript án villna.

Supabase/rollout:
- SQL63 var keyrt á Supabase samkvæmt post-release handoff.
- SQL64 var keyrt á Supabase samkvæmt post-release handoff.
- PostgREST schema cache var reloadað samkvæmt post-release handoff.
- `switch_loan_role` og `get_loan_for_pending_recipient` eru service-role RPCs
  og eiga ekki að veikja RLS eða gefa `anon`/`authenticated` beinan DB-aðgang.
- Codex keyrði ekki SQL63/SQL64 og staðfesti ekki Vercel build-log sjálfstætt.

Eftir í TODO:
- #61 - Aðila-flæði birtist í sögu hlutar.
- #38 - Event þegar lánaboði er hafnað.
- #39 - Gera samþykktan hlut óvirkan við eyðingu.
- #59 - Deilanlegur hlekkur á lánadetail.

---

## #60 - Spjall sem hluti af sögu hlutar

**Lokið:** 2026-06-28  
**Staðfesting:** Stebbi staðfesti í samtali að #60 væri komið og bað Codex að
færa atriðið í DONE.

Spjall á lánahlut er nú hluti af `Saga hlutarins` á detail-síðu hlutarins.
Skilaboð birtast sem history-röð innan um önnur loan-events í stað þess að vera
alveg aðskilið spjall.

Helstu niðurstöður:
- `loan_chat_messages` geymir skilaboð per lán.
- `create_loan_chat_message` RPC stofnar skilaboð með server-side access check.
- `get_loan_event_history` sameinar venjuleg loan-events og chat rows í sömu
  tímaröð.
- Chat rows eru aðgreind með `row_kind = 'chat'` og `chat_message_id`.
- `loan_chat_message` recent-events eru notuð fyrir tilkynningar en síuð úr
  history-event query svo skilaboð birtist ekki tvöfalt.
- Spjallformið er á detail-síðu og sendir skilaboð án þess að leka milli lána.

Skrár og samhengi:
- `sql/61_loan_chat_messages_in_history.sql` - tafla, send-RPC og útvíkkað
  history RPC.
- `sql/62_fix_loan_event_history_chat_union_ambiguity.sql` - patch á ambiguous
  column references í history UNION.
- `lib/loans/actions.ts` - `createLoanChatMessage`/send action og unread event
  fyrir mótaðila.
- `lib/loans/history.server.ts` - formatter fyrir event rows og chat rows.
- `components/loans/LoanHistory.tsx` - history og chat UI.
- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx` - detail-síða birtir history og
  spjall.
- `messages/is.json` og `messages/en.json` - history/chat textar.

Supabase/rollout:
- SQL61 og SQL62 þurfa að vera keyrð á Supabase og schema cache reloadað til að
  chat/history return shape sé rétt.
- `loan_chat_messages` er RLS-varið og beinn aðgangur er ekki veittur
  `PUBLIC`, `anon` eða `authenticated`.
- Codex keyrði ekki SQL61/SQL62 sjálfur og staðfesti ekki production/Vercel
  build-log sjálfstætt.

Eftir í TODO:
- #61 - Aðila-flæði birtist í sögu hlutar.
- #38 - Event þegar lánaboði er hafnað.
- #39 - Gera samþykktan hlut óvirkan við eyðingu.
- #59 - Deilanlegur hlekkur á lánadetail.

---

## #58 - Saga hlutarins á detail-síðu

**Lokið:** 2026-06-27  
**Staðfesting:** Claude Code post-release handoff segir að þetta hafi verið
keyrt á localhost og virkað.

Detail-síða láns sýnir nú `Saga hlutarins` undir lánaspjaldinu. Þar birtast
loan-events í tímaröð með label, timestamp og actor-línu fyrir ný events þar sem
framkvæmdaaðili er þekktur, til dæmis `Framkvæmt af Stefáni`.

Helstu niðurstöður:
- `Saga hlutarins` birtist á `/auth-mvp/lanad-og-skilad/[id]`.
- Events eru de-duplicate-uð eftir `event_key` og birt í tímaröð.
- Ný events fá `actorUserId` í payload og history sýnir display-nafn actor.
- Gömul events án actor metadata halda áfram að birtast án actor-línu.
- Pending invitation viðtakandi getur séð history áður en hann samþykkir boðið.
- History section var pússuð sjónrænt og er nú rólegur rammi undir lánaspjaldi.

Skrár og samhengi:
- `sql/59_get_loan_event_history.sql` - upphaflegt history RPC.
- `sql/60_get_loan_event_history_pending_access.sql` - pending access og
  `actor_display_name`.
- `lib/recent-events/types.ts` og `lib/recent-events/helpers.server.ts` -
  `actorUserId` í event payload.
- `lib/loans/actions.ts` - actor metadata sett á loan events.
- `lib/loans/history.server.ts` - history formatting og `actorLabel`.
- `components/loans/LoanHistory.tsx` - `Saga hlutarins` UI.
- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx` - detail-síða sækir og birtir
  history.
- `messages/is.json` og `messages/en.json` - history textar.

Release og staðfesting:
- Claude Code post-release handoff:
  `ai-handoff/2026-06-27-1121-todo-058-v006-claude-post-release.md`.
- Tveir commits á `main` samkvæmt handoff:
  `4bbee0d feat: loan history section on detail page (#58)` og
  `46e1f92 feat: actor attribution and Saga section in loan history (#58)`.
- SQL60 var keyrt á Supabase samkvæmt Claude Code post-release handoff.
- Prófanir í handoff: `npm run type-check` og `npm run test:run` fóru í gegn,
  42 test files, 1309 passed, 22 skipped, 8 todo.

Supabase/rollout:
- SQL60 breytir `get_loan_event_history` með `CREATE OR REPLACE`.
- Engar gagnabreytingar fylgdu SQL60 samkvæmt handoff.
- Execute er áfram aðeins fyrir `service_role`; ekki fyrir `PUBLIC`, `anon` eða
  `authenticated`.
- Codex keyrði ekki SQL60 og staðfesti ekki production/Vercel build-log
  sjálfstætt.

Eftir í TODO:
- #38 - Event þegar lánaboði er hafnað.
- #39 - Gera samþykktan hlut óvirkan við eyðingu.
- #59 - Deilanlegur hlekkur á lánadetail.

---

## #56 - Breyta lánsdagsetningu og skiladegi á samþykktum lánum

**Lokið:** 2026-06-27  
**Staðfest af Stebba:** já, 2026-06-27

Báðir aðilar að samþykktu láni geta nú breytt nafni, athugasemd,
lánsdagsetningu og skiladegi í sama edit-flæði. Breytingar á
`loaned_at` og `due_at` birtast í `Ólesið` hjá mótaðila með sértækum
event-labels, til dæmis `Breytt lánsdagsetning` og `Breyttur skiladagur`.

Helstu niðurstöður:
- `LoanItemDetailsForm` sýnir nú `Lánað` og `Skila fyrir` fyrir samþykkt lán.
- `EditLoanItemDetailsSchema` validate-ar `loaned_at`, optional `due_at` og
  `due_at >= loaned_at`.
- `updateLoanItemDetails` kallar nýtt SQL58 RPC og diff-ar dagsetningar með
  sama `loan_updated` event-grunni og #37.
- `canEditItemDetails` leyfir accepted borrower/mótaðila að opna edit-flowið,
  ekki aðeins creator/lender.
- Pending recipient og óviðkomandi notendur eiga áfram að fá `not_found` eða
  `notFound`.

Skrár og samhengi:
- `sql/58_update_loan_item_details_and_dates_with_diff.sql` - nýtt
  service-role RPC `update_loan_item_details_and_dates_with_diff`.
- `lib/loans/types.ts` - schema og control-visibility.
- `lib/loans/actions.ts` - action kallar SQL58, skráir actor/counterpart events.
- `components/loans/LoanItemDetailsForm.tsx` - dagsetningasvið í accepted edit.
- `lib/__tests__/actions.test.ts`, `lib/__tests__/loans.test.ts` og
  `lib/__tests__/loan-pages.test.tsx` - uppfærð regression-próf.

Release og staðfesting:
- Claude Code post-release handoff:
  `ai-handoff/2026-06-27-0940-todo-056-v005-claude-post-release.md`.
- Codex pre-release review:
  `ai-handoff/2026-06-27-0852-todo-056-058-039-059-v003-codex-scope-review.md`.
- Commit `078c60f` á `main`, deployað/pushað á Vercel samkvæmt Claude Code
  handoff. Codex staðfesti ekki Vercel build-log sjálfstætt.
- Stebbi staðfesti að localhost-prófun virkaði: lánveitandi og lántakandi geta
  breytt dagsetningum og mótaðili fær event í `Ólesið`.

Supabase/rollout:
- SQL58 bætir við nýju falli og breytir ekki töflugögnum.
- Fallið notar explicit `p_actor_id`, ekki `auth.uid()`, og `date`, ekki
  `timestamptz`.
- Execute er aðeins veitt `service_role`; `PUBLIC`, `anon` og `authenticated`
  fá ekki execute.
- Codex keyrði ekki SQL58.

Eftir í TODO:
- #60 - Spjall sem hluti af sögu hlutar.
- #38 - Event þegar lánaboði er hafnað.
- #39 - Gera samþykktan hlut óvirkan við eyðingu.
- #59 - Deilanlegur hlekkur á lánadetail.

---

## #37 - `Nýlegt` sýni öll ólesin events og breytingasamhengi

**Lokið:** 2026-06-24  
**Staðfest af Stebbi:** já, 2026-06-25

`Ólesið` á `/auth-mvp/heim` var gert að raunverulegri ólesinni event-yfirsýn
fyrir lán. Stebbi staðfesti eftir útgáfu að breytingin virkaði.

Helstu niðurstöður:
- `Ólesið` sýnir öll ólesin events úr `recent_events`, ekki aðeins stutt preview.
- `loan_updated` fær field-specific labels þegar ein breyting er gerð:
  `Breytt nafn`, `Breytt athugasemd`, `Breyttur skiladagur` og
  `Breytt lánsdagsetning`.
- Timestamp birtist undir hverju event í lista og drawer, t.d.
  `Miðvikudaginn 24. júní kl. 7:40`.
- `Skoða` úr `Ólesið` fer á rétta lánadetail-síðu með `?from=heim`, og `Til baka`
  endar aftur á `/auth-mvp/heim`.
- `updateLoan` tilkynnir pending recipient(s) með canonical email matchi gegnum
  SQL57, þar með talið dotted Gmail/Googlemail tilvik.
- Best-effort notification er varin með `try/catch` og lekur ekki recipient email,
  canonical email eða user IDs í logs, UI eða client payload.

Skrár og samhengi:
- `app/auth-mvp/heim/page.tsx` - event labels, timestamp formatting, `viewHref`
  með `from=heim`.
- `app/auth-mvp/heim/RecentSection.tsx` - timestamp í lista og drawer.
- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx` - dynamic back-href út frá
  `searchParams.from`.
- `lib/loans/actions.ts` - canonical recipient lookup og pending recipient
  notification í `updateLoan`.
- `lib/recent-events/types.ts` - `occurredAtLabel` í display type.
- `messages/is.json` og `messages/en.json` - nýir event-label textar.
- `sql/57_get_user_ids_by_canonical_email.sql` - service-role RPC fyrir canonical
  email lookup.
- `lib/__tests__/home-page.test.tsx`, `lib/__tests__/loan-pages.test.tsx` og
  `lib/__tests__/actions.test.ts` - regression-próf fyrir labels, timestamp,
  navigation og recipient notification.

Release og staðfesting:
- Claude Code post-release handoff:
  `ai-handoff/2026-06-24-0943-todo-037-056-057-v061-claude-post-release.md`.
- Codex loka-rýni:
  `ai-handoff/2026-06-24-0937-todo-037-v060-codex-pre-release-final-review.md`.
- Commit `873eb27` á `main`, deployað á Vercel samkvæmt Claude Code handoff.
- Prófanir í release-handoff: `npm run type-check` og 209 tests passed, 5 todo.

Supabase/rollout:
- `sql/57_get_user_ids_by_canonical_email.sql` var keyrt á Supabase af Stebba.
- PostgREST schema cache var reloadað.
- Engar töflubreytingar eða gagnabreytingar fylgdu SQL57.
- RPC-fallið er aðeins executable fyrir `service_role` og skilar bara `user_id`.

Eftir í TODO:
- #60 - Spjall sem hluti af sögu hlutar.
- #57 - Timestamp format í ensku locale.

---

## #52 - Lánaboð í `Ólesið` og beint í detail-síðu

**Lokið:** 2026-06-23
**Staðfest af Stebba:** já (Stebbi prófaði `Skoða` úr `Ólesið` á localhost og
staðfesti að rétt detail-síða opnaðist)

Pending og accepted loan-events úr `Ólesið`/heimaskjá geta nú opnað rétta
`Lánað og skilað` detail-síðu beint. Heimasíðan tryggir einnig best-effort
`recent_events` færslu fyrir pending actionable lánaboð, svo badge og `Ólesið`
tala saman betur.

Útfærslan notar `invitation_id` til að finna samsvarandi `loan_id` úr
server-side `get_my_loans` niðurstöðu og býr til detail-hlekk á
`/auth-mvp/lanad-og-skilad/<loan_id>`. Ef loan-match finnst ekki er rólegur
fallback á listann með `?invitation=<id>` og listinn getur highlightað rétt
boð. `Skoða` ack-ar eventið fire-and-forget svo navigation byrji strax og
route-loaderinn sjáist.

Skrár og samhengi:
- `app/auth-mvp/heim/page.tsx` - tryggir pending invitation event og reiknar
  `viewHref` fyrir invitation/loan events.
- `app/auth-mvp/heim/RecentSection.tsx` - `Skoða` notar hlekk og ack-ar án þess
  að tefja navigation.
- `app/auth-mvp/lanad-og-skilad/page.tsx` - tekur við `invitation` query fallback.
- `components/loans/LoanList.tsx` og `components/loans/LoanSummaryCard.tsx` -
  highlight/scroll fallback fyrir invitation query.
- `lib/__tests__/home-page.test.tsx`,
  `lib/__tests__/loan-list.test.tsx` og
  `lib/__tests__/loan-pages.test.tsx` - regression-próf fyrir deep-link,
  fallback, ack og highlight.

Staðfesting:
- Codex handoff:
  `ai-handoff/2026-06-23-2211-todo-052-v001-codex-olesid-invitation-direct-open-handoff.md`
- Claude Code closeout:
  `ai-handoff/2026-06-23-2352-todo-052-v002-claude-olesid-invitation-post-release.md`
- Claude Code nefndi commit `78dddb3` á main/Vercel fyrir post-release
  closeoutið.
- Stebbi staðfesti í samtali 2026-06-23 að hann hefði prófað að skoða ólesið
  lánaboð og að það virkaði.

Supabase/rollout:
- Engin SQL skipun var keyrð í closeoutinu.
- Engar schema-, RLS-, auth-, grants- eða function-breytingar fylgdu.
- Notaður er núverandi `recent_events` grunnur með best-effort insert og engin
  recipient email eiga að leka í event payload eða client state.

Eftirstandandi:
- Breiðari event-feed og fleiri ólesin events halda áfram í #37.
- Sérstök loader-vinna fyrir `Merkja sem skilað`, ef hún reynist enn þörf, á að
  opna sem þrengra TODO frekar en að halda #52 opnu.

---

## #5 - Samræmd mobile app-upplifun

**Lokið:** 2026-06-23
**Staðfest af Stebba:** já (Stebbi prófaði v008 localhost checklist og staðfesti
að allt virkaði)

Mobile app-upplifun var tekin í afmörkuðum v007-v008 audit hring. Stebbi prófaði
virk flæði á localhost við mobile breidd og staðfesti að engin óæskileg zoom-,
overflow- eða navigation-vandamál væru eftir í þessum áfanga.

Helsta kóðabreytingin í lokahringnum var að röðunarvalið í `Lánað og skilað`
fékk 16 px textastærð á mobile svo iOS/Safari þysi ekki inn þegar select fær
focus. Kóðarýni staðfesti líka að virk form og controls í innskráningu,
lánaskráningu, Tengslum og add-party/edit flæðum fylgja no-zoom reglunni.

Skrár og samhengi:
- `components/loans/LoanList.tsx` - sort `<select>` breytt úr `text-xs` í
  `text-base`.
- `Design.md` - áfram skyldubundið viðmið fyrir app-líka mobile upplifun,
  navigation loadera, 16 px input/control texta og route `loading.tsx`.
- `app/auth-mvp/heim/loading.tsx`,
  `app/auth-mvp/lanad-og-skilad/loading.tsx`,
  `app/auth-mvp/lanad-og-skilad/ny/loading.tsx`,
  `app/stillingar/tengsl/loading.tsx` og tengd route loading-states voru rýnd sem
  hluti af v007-v008 samhengi.

Staðfesting:
- Codex handoff:
  `ai-handoff/2026-06-23-2154-todo-005-v007-codex-mobile-app-localhost-audit-handoff.md`
- Stebbi/Codex closeout:
  `ai-handoff/2026-06-23-2203-todo-005-v008-stebbi-og-codex-mobile-closeout.md`
- Stebbi staðfesti í samtali 2026-06-23 að hann hefði prófað og að allt virkaði.

Supabase/rollout:
- Engin SQL skipun var keyrð.
- Engar schema-, RLS-, auth-, grants-, functions- eða production-gagnabreytingar
  voru hluti af #5 closeoutinu.

Eftirstandandi vinnuregla:
- Nýir og breyttir skjáir þurfa áfram að fylgja `Design.md`.
- Ef ný mobile/navigation vandamál finnast síðar skal opna nýtt, þrengra TODO í
  stað þess að halda #5 sem eilífu safn-itemi.

---

## #55 - Lánaboðsás og soft-ack takkar á forsíðu `Lánað og skilað`

**Lokið:** 2026-06-23
**Staðfest af Stebba:** já (manual próf staðfesti að bólumálið væri leyst)

Pending lánaboð eru nú afgreiðanleg beint á listasíðu `Lánað og skilað`.
`LoanSummaryCard` sýnir `Þekki málið` og `Kannast ekki við þetta` fyrir pending
recipient rows án þess að notandi þurfi að opna detail-síðu. Cardið notar
`<article>` með sér `<Link>` fyrir efnishlutann og sjálfstæðan button-row undir,
svo enginn `<button>` er nested inni í `<Link>`.

Heimaskjás-badge var einnig þrengt: það telur nú aðeins pending acknowledgement
rows þar sem `returned_at === null`. Þar með heldur pending boð á þegar skiluðum
hlut, eins og `tengslatest`, ekki lengur bólunni fastri og notandi þarf ekki að
smella `Þekki málið` á skiluðum hlut til að losna við hana.

Skrár:
- `components/loans/LoanSummaryCard.tsx` - soft-ack buttons á listasíðu,
  pending/loading state, villubirting og `router.refresh()` á success.
- `app/auth-mvp/heim/page.tsx` - heimabólan telur ekki pending boð á skiluðum
  lánum.
- `lib/__tests__/loan-card.test.tsx` - regression-próf fyrir pending recipient
  list actions, creator/accepted rows, action calls, refresh og failure state.
- `lib/__tests__/home-page.test.tsx` - regression-próf fyrir að returned pending
  invitation haldi ekki heimabólunni fastri.

Staðfesting:
- Codex handoff:
  `ai-handoff/2026-06-23-2042-todo-055-v001-codex-loan-invitation-front-page-actions-handoff.md`
- Post-release handoff:
  `ai-handoff/2026-06-23-2116-todo-055-v002-codex-loan-invitation-list-actions-post-release.md`
- Reopen/edge-case handoff:
  `ai-handoff/2026-06-23-2143-todo-055-v003-codex-reopen-list-actions-returned-badge-handoff.md`
- Stebbi staðfesti í manual prófi að málið væri komið.

Supabase/rollout:
- Engin SQL migration fylgdi pakkanum.
- Engar schema-, RLS-, auth-, grants-, functions- eða production-gagnabreytingar
  voru hluti af #55 UI-lagfæringunni.

---

## #30 - Derhúfumerki og ný favicon-tillaga

**Lokið:** 2026-06-23
**Staðfest af Stebba:** já (Stebbi samþykkti síðustu `Allt` yfir `10` útgáfuna
eftir preview-tweaks)

Derhúfumerkið var fært frá fyrri `10,5`/`A&10` hugmynd yfir í skýrari
`Allt` fyrir ofan stærra `10` inni í derhúfunni. `Allt` var haldið í sömu
stærð og staðsetningu eftir síðustu umferð, en `10` var stækkað og fært nær
derlínunni án þess að lenda ofan í henni. Favicon-tillagan var aðskilin frá
stóra lógóinu: einfaldari grænn `10`-kostur er til fyrir litlar stærðir.

Skrár:
- `components/teskeid/TeskeidLogo.tsx` - canonical SVG-lógóið notar nú
  `Allt` yfir stærra `10`.
- `public/favicon-options/cap-mark-allt-10-preview.svg` - preview fyrir
  derhúfumerkið.
- `public/favicon-options/ten-minimal-preview.svg` - minimal `10` favicon
  preview, sjónrænt miðjað betur.
- `app/icon.svg`, `public/favicon-options/cap-mark-10-only-preview.svg`,
  `app/preview/favicons/codex/page.tsx` og
  `app/preview/teskeid-logo/codex/page.tsx` voru hluti af Claude/Codex
  icon-preview áfanganum.

Staðfesting:
- Codex handoff:
  `ai-handoff/2026-06-23-1842-todo-030-v003-codex-icon-favicon-recipe-handoff.md`
- Claude closeout:
  `ai-handoff/2026-06-23-1855-todo-030-v004-claude-icon-favicon-closeout.md`
- Codex keyrði:
  - `npm run test:run -- lib/__tests__/teskeid-logo.test.tsx` - pass
  - `npm run type-check` - pass

Supabase/rollout:
- Engin SQL skipun var keyrð.
- Engin schema-, RLS-, auth-, grants-, functions- eða production-gagnabreyting.

Eftirstandandi athugasemd:
- Browser favicon cache getur sýnt eldri útgáfu þar til cache hreinsast.
- Ef installed/PWA icon á að uppfærast sérstaklega þarf að staðfesta hvort
  binary PNG icon-skrárnar (`public/icon-192.png`, `public/icon-512.png`) þurfi
  að endurgenera úr samþykkta SVG-grunninum.

---

## #48 - Endurkomunotandi fari sjálfgefið á Teskeiðar

**Lokið:** 2026-06-23
**Staðfest af Stebba:** já (Stebbi bað að færa #48 í DONE eftir Codex handoff)

Atriðinu var lokað sem product/UX ákvörðun án nýrrar kóðabreytingar í þessum
áfanga. Codex-rýni sýndi að núverandi kóði uppfyllir kjarnaþörfina: innskráður
notandi sem opnar rótina fer á `/auth-mvp/heim`, innskráður notandi sem opnar
`/innskraning` fer einnig á `/auth-mvp/heim`, og successful code-login fyrir
notanda með display name fer á `/auth-mvp/heim`.

`/auth-mvp/heim#teskeidar` var ekki innleitt núna. Ef Stebbi vill síðar
strakari anchor-lendingu beint á `Tilbúnar Teskeiðar` má opna atriðið aftur, en
það þarf þá sérstaklega að rýna hvort hash-scroll valdi óþægilegu mobile-stökki
eða sleppi yfir mikilvægt `Ólesið`/recent samhengi.

Skrár sem voru rýndar:
- `middleware.ts` - root redirect fyrir innskráða notendur.
- `app/innskraning/page.tsx` - server-side session redirect af login-síðu.
- `components/teskeid/TeskeidLoginForm.tsx` - successful code-login redirect.
- `app/auth-mvp/heim/page.tsx` - heimaskjár með `section#teskeidar`.
- `lib/__tests__/middleware.test.ts`, `lib/__tests__/innskraning-page.test.tsx`,
  `lib/__tests__/home-page.test.tsx` - núverandi regression-próf fyrir redirect
  og `#teskeidar` anchor.

Staðfesting:
- Codex handoff:
  `ai-handoff/2026-06-23-1652-todo-048-v001-codex-returning-user-default-teskeidar-handoff.md`
- Engin test voru keyrð sérstaklega fyrir lokunina, þar sem engum app-kóða var
  breytt í þessum áfanga.

Supabase/rollout:
- Engin SQL skipun var keyrð.
- Engin schema-, RLS-, auth-, grants-, functions- eða production-gagnabreyting.

---

## #47 - Lán: bæta við netfangi í edit og laga vistunarvillu

**Lokið:** 2026-06-23
**Staðfest af Codex:** já (rýni á Claude closeout `5e46db7` og staða færð úr TODO)

Edit-flæði fyrir lán án viðtakanda er nú komið með skýra leið til að bæta við
viðtakanda eftir á. Add-party skjárinn notar áfram örugga `addLoanInvitation` /
`add_loan_invitation` leiðina, en getur nú líka sýnt Tengsl recipient picker
þegar `Tengsl` er virkt og notandi á tengsl með netfangi. Handvirkur
netfangsreitur er áfram til staðar sem fallback.

Stebbi staðfesti í Claude closeout að upprunalega vistunarvillan væri leyst:
`Gítarstandur?` var hægt að breyta í `Gítarstandur` án `Ekki tókst að vista`
villunnar, og edit/add-party CTA virkaði í raunflæði.

Skrár:
- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx` - edit-síðan sýnir
  add-party CTA þegar creator má bæta við viðtakanda.
- `app/auth-mvp/lanad-og-skilad/baeta-vid-adila/[id]/page.tsx` - sækir
  `getRelationshipRecipientOptions` þegar Tengsl feature access leyfir.
- `components/loans/AddPartyForm.tsx` - sýnir Tengsl picker ofan við handvirka
  netfangsreitinn og fyllir netfangið þegar tengsl er valið.
- `lib/loans/actions.ts` - áfram notuð fyrir `updateLoan` og
  `addLoanInvitation`; engin ný invitation-leið var búin til.
- `lib/__tests__/loan-pages.test.tsx` - regression-próf fyrir add-party route,
  guards, redirect þegar boð er pending og recipient options forwarding.

Staðfesting:
- Claude closeout: `ai-handoff/2026-06-23-0915-todo-047-049-v018-claude-add-party-picker-closeout.md`
- Commit rýndur af Codex: `5e46db7`
- Codex fann engin blocking findings.
- Codex keyrði:
  - `npm run test:run -- lib/__tests__/loan-pages.test.tsx lib/__tests__/loan-form.test.tsx lib/__tests__/actions.test.ts` - 126 passed, 5 todo
  - `npm run type-check` - pass

Supabase/rollout:
- Codex keyrði enga SQL skipun og breytti engum production gögnum.
- Closeoutið segir að engar SQL functions, schema eða data breytingar hafi verið
  gerðar í þessum áfanga.
- Engar RLS policies eða service-role mörk voru veikt.

Eftirstandandi áhætta:
- `loan-pages.test.tsx` mockar `AddPartyForm`, þannig að automated coverage
  staðfestir að options séu send í formið en ekki beint að raunverulegi listbox
  pickerinn fylli netfangið. Stebbi/Claude staðfestu þetta í manual flæði; halda
  má þessu sem residual UI-prófsgati frekar en blocker.
- Ef save-villa birtist aftur síðar þarf fyrst að staðfesta Supabase
  `update_loan_with_diff` / schema-cache stöðu áður en app-kóði er breytt.

---

## #49 - Tengsl þvert á Teskeiðar

**Lokið:** 2026-06-23
**Staðfest af Codex:** já (rýni á Claude closeout `fa86e4c` og staða færð úr TODO)

Tengsl v1 er komið í lokað grunnflæði: `/stillingar/tengsl` listar tengsl,
tengsl-detail sýnir nafn/netfang, flokk, einkanafn, einkaskýringu og sameiginlega
lánavirkni, og lánaformið getur valið viðtakanda úr Tengsl-grunninum. Gmail
dotted/undotted tilvik eru sameinuð í UI-grunni og recipient picker notar
canonical samanburð þannig að sama manneskja birtist ekki sem tvær línur vegna
Gmail-punkta.

Skrár:
- `sql/54_relationships.sql` - relationship-grunnur, RLS og service-role
  aðgangsmynstur fyrir per-user tengsl.
- `lib/relationships/actions.ts` - directory, detail, loan activity,
  recipient options, canonical dedup og owner-scoped gagnasækni.
- `lib/relationships/tag-action.ts` - owner-varin uppfærsla á flokki,
  einkanafni og einkaskýringu.
- `app/stillingar/tengsl/page.tsx`, `app/stillingar/tengsl/[id]/page.tsx`,
  `app/stillingar/tengsl/loading.tsx`,
  `app/stillingar/tengsl/[id]/loading.tsx` - Tengsl listi, detail og
  navigation loaderar.
- `components/tengsl/RelationshipDetailsForm.tsx`,
  `components/tengsl/TagSelectForm.tsx` - edit-form með no-zoom input/select
  stærðum.
- `components/loans/LoanForm.tsx`, `app/auth-mvp/lanad-og-skilad/ny/page.tsx`
  - recipient picker í stofnun nýs láns.
- `messages/is.json`, `messages/en.json` - notendatextar fyrir Tengsl og
  recipient picker.
- `lib/__tests__/tengsl-actions.test.ts`,
  `lib/__tests__/tengsl-pages.test.tsx`, `lib/__tests__/loan-form.test.tsx`
  - regression-próf fyrir Tengsl, detail, picker og form.

Staðfesting:
- Claude closeout: `ai-handoff/2026-06-23-0845-todo-049-v017-claude-tengsl-v1-closeout-done.md`
- Codex rýndi `fa86e4c` og fann engin blocking findings.
- Codex keyrði:
  - `npm run test:run -- lib/__tests__/tengsl-actions.test.ts lib/__tests__/tengsl-pages.test.tsx lib/__tests__/loan-form.test.tsx` - 44/44 pass
  - `npm run type-check` - pass

Supabase/rollout:
- Codex keyrði enga SQL skipun og breytti engum production gögnum í þessari
  lokarýni.
- #49 byggir á áður skilgreindum `relationships` grunni og service-role actions;
  engar RLS policies voru veiktar í closeout-lagfæringunni.
- Stebbi þarf enn að gera loka localhost reykpróf ef hann vill staðfesta
  raunverulega mobile Safari no-zoom hegðun og loadera með eigin dev server.

Eftir í tengdum TODO:
- #50 - fjölskyldumeðlimir sem tengsl bíður eftir raunnotkun og næsta gagnalagi.
- #54 - spjall á lána-detail getur síðar nýtt að detail-síður og Tengsl eru til.

---

## #43 - Gmail-punktar og útrunnin soft-ack lánaboð

**Lokið:** 2026-06-23
**Staðfest af Codex:** já (rýni á Claude closeout `1b04e54` og staða færð úr TODO)

Lánaboðsflæðið notar nú samræmda Gmail-aware canonical email reglu þannig að
punktar í Gmail/Googlemail local-part valda ekki lengur ósamræmi milli þess
netfangs sem fékk boðið og þess netfangs sem notandi skráir sig inn með.
Pending soft-ack boð haldast einnig sýnileg og claimable í `get_my_loans` /
`claim_loan_invitation` þó email-link `expires_at` sé liðið, á meðan boðið er
enn í `pending` stöðu.

Skrár:
- `sql/56_normalize_email_canonical.sql` - bætir við
  `public.normalize_email_canonical(text)` og uppfærir loan invitation RPC-föll
  til að nota canonical samanburð.
- `lib/auth/email-normalization.ts` - TypeScript canonicalization sem passar við
  SQL-regluna fyrir raunveruleg netföng.
- `lib/relationships/actions.ts` - Tengsl/loan-activity notar canonical
  samanburð án þess að missa legacy dotted Gmail invitation rows.
- `app/auth-mvp/heim/page.tsx` - badge notar `get_my_loans` og telur pending
  soft-ack rows sem eru raunverulega actionable.
- `lib/__tests__/sql-migration.test.ts` - regression-próf fyrir SQL56, þar á
  meðal að `claim_loan_invitation` og `get_my_loans` Branch 2 hafi ekki
  `expires_at` síu.
- `lib/__tests__/email-normalization.test.ts`, `lib/__tests__/tengsl-actions.test.ts`,
  `lib/__tests__/home-page.test.tsx` - regression-próf fyrir helpera, Tengsl
  dedup/loan activity og badge-hegðun.

Staðfesting:
- Claude closeout: `ai-handoff/2026-06-23-0810-todo-043-v017-claude-closeout-done.md`
- Codex keyrði:
  - `npm run test:run -- lib/__tests__/sql-migration.test.ts` - 109/109 pass
  - `npm run type-check` - pass

Supabase/rollout:
- Stebbi hafði þegar keyrt SQL56 og `NOTIFY pgrst, 'reload schema';`.
- Codex keyrði enga SQL skipun og breytti engum production gögnum.
- Engar RLS policies voru veiktar og function grants halda áfram að miða við
  service-role þar sem það á við.

Eftir í tengdum TODO:
- #52/#37 - pending lánaboð í `Ólesið` og fullur ólesinn event grunnur.

---

## #53 - Netfang viðtakanda á lánakortum

**Lokið:** 2026-06-22
**Staðfest af Codex:** já (rýni á v002 lagfæringu og staða færð úr TODO)

`get_my_loans` skilar nú `recipient_email` fyrir creator svo pending lánakort og
detail-síða geti sýnt hverjum boðið var sent í stað almenns `Bíður svars`
texta. Viðtakandi fær ekki netfangið til baka úr RPC-inu; privacy-boundary er
því creator-scoped.

Skrár:
- `sql/55_get_my_loans_add_recipient_email.sql` - endursmíðar `get_my_loans`
  með `recipient_email`, varðveitir soft-ack branch og service-role grant
- `lib/loans/types.ts` - `LoanItem.recipient_email`
- `components/loans/LoanSummaryCard.tsx` - sýnir viðtakandanetfang þegar nafn vantar
- `components/loans/LoanCard.tsx` - tekur við `recipientDisplay`
- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx` - sendir recipient display í detail-kort

Supabase/rollout:
- Migration 55 breytir function signature og þarf því `DROP FUNCTION` + recreate
  í transaction.
- Eftir keyrslu þarf PostgREST/Supabase schema cache reload áður en appkóði sem
  les nýja dálkinn er notaður.
- Engar töflur, RLS policies eða production gögn eru breytt.

---

## #45 - Per-user aðgangur að feature-flagged Teskeiðum

**Lokið:** 2026-06-22
**Staðfest af Codex:** já (rýni eftir að fail-closed og admin load-error atriði voru lagfærð)

Feature-aðgangur er kominn í sameiginlegan grunn með `feature_access` og admin UI
á `/admin`. Fyrir Umönnun og Tengsl er hægt að hafa global flag opið, eða kveikja
á per-user gating með `UMONNUN_FLAG=true` / `TENGSL_FLAG=true`.

Skrár:
- `sql/52_feature_access.sql` - grunnur fyrir `feature_access`
- `sql/53_feature_access_tengsl.sql` - stækkun fyrir Tengsl
- `lib/auth/email-normalization.ts` - samræmd normalisering netfanga
- `lib/loans/guard.ts` - fail-closed feature access check
- `app/api/admin/feature-access/route.ts` - admin API fyrir aðgangsstýringu
- `app/(admin)/admin/page.tsx` - Umönnun- og Tengsl-aðgangsstýring í admin
- `lib/__tests__/guard.test.ts`, `lib/__tests__/admin-page.test.tsx` - regression-próf

Supabase/öryggi:
- Per-user check fellur lokað ef query bilar.
- Admin UI sýnir load-villu í stað þess að líta út fyrir tóman aðgangslista.
- Engin RLS-veiking; feature access er lesið og skrifað í gegnum afmörkuð server/admin lög.

---

## #44 - Merkja hlut skilaðan áður en mótaðili þekkir málið

**Lokið:** 2026-06-17
**Staðfest af Codex:** já (flutt úr TODO eftir Claude Code done-handoff og tilheyrandi migration/próf)

Creator/direct participant getur merkt pending lán sem skilað áður en mótaðili
hefur valið `Þekki málið`. Server-side heimildin byggir áfram á því að actor sé
`lender_user_id` eða `borrower_user_id` á láninu; pending recipient sem er ekki
kominn sem direct participant fær ekki nýja leið inn.

Skrár:
- `sql/51_allow_pending_creator_return.sql` - fjarlægir both-parties-joined guard
  úr `mark_returned` og `undo_return`, grants áfram service_role only
- `components/loans/LoanCard.tsx` / `components/loans/LoanSummaryCard.tsx` - pending
  return controls og stöðutextar
- `lib/loans/logic.ts` - control-state fyrir pending return
- `lib/__tests__/loan-card.test.tsx`, `lib/__tests__/loans.test.ts` - regression-próf

Supabase/öryggi:
- Engar töflu-, dálka-, index-, RLS- eða policy-breytingar.
- SQL breytir function bodies og þarf að vera keyrt í því umhverfi þar sem
  pending return á að virka.
- Ótengdur notandi á áfram að fá `not_found`.

---

## #19 - Lesnir hlutir birtast ekki aftur sem `Nýlegt`

**Lokið:** 2026-06-10
**Staðfest af Stebba/Codex:** já (síðari handoff segir að #19 sé done og að `recent_events` sé grunnurinn)

Lánasértækur cookie/read-state plástur var lagður til hliðar og varanlegri
server-side `recent_events` grunnur tekinn upp fyrir `Nýlegt`. Atriðið sem eftir
stendur er ekki lengur #19 heldur framhaldið: að gera `Nýlegt` að fullum ólesnum
inbox með breytingasamhengi (#37) og að birta pending lánaboð þar (#52).

Skrár og samhengi:
- `sql/46_recent_events.sql` - server-side event/read-state grunnur
- `app/auth-mvp/heim/RecentSection.tsx` - `Nýlegt` UI
- `lib/loans/events.ts` og tengd server actions - skráning og lestur events
- `ai-handoff/2026-06-10-1704-todo-027-v019-codex-soft-ack-final-handoff.md` -
  skráir að #19 sé done og eigi ekki að opna aftur sem sérstakt grunnatriði

Eftir í TODO:
- #37 - `Nýlegt` sýni öll ólesin events og breytingasamhengi
- #52 - pending lánaboð birtist í `Ólesið` og opnist beint

---

## #40 — Filterar í lánalista hafa sjálfstætt state

**Lokið:** 2026-06-17
**Staðfest af Codex:** já (post-release review á commit `bef246e`)

Status-filterar í `Lánað og skilað` endurstilla ekki lengur hlutverkafilterinn.
`Enn í láni`, `Skilað` og `Allt` breyta aðeins efri status-state; neðri
hlutverkaval helst óbreytt þar til notandi breytir því sjálfur. Ef samsetning
filtera skilar engum niðurstöðum birtist empty-state í stað sjálfvirks resets.

Skrár:
- `components/loans/LoanList.tsx` — `setRoleFilter(null)` fjarlægt úr status-pillum
- `lib/__tests__/loan-list.test.tsx` — regression-próf fyrir varðveitt hlutverkaval

Staðfest:
- `npm run test:run -- lib/__tests__/loan-list.test.tsx` — 32 passed
- `npm run type-check` — exit 0

Engar SQL-, Supabase-, RLS-, auth- eða production-gagnabreytingar.

---

## #36 — Mannlegra orðalag á lánahlutverki

**Lokið:** 2026-06-17
**Staðfest af Codex:** já (post-release review á commit `7416ab9`)

Hlutverkaval í nýskráningarformi fyrir `Lánað og skilað` notar nú náttúrulegra
orðalag. Íslenska fór úr `Ég er lánveitandinn` / `Ég er lántakandinn` yfir í
`Ég er að lána` / `Ég er að fá lánað`. Enska samsvörunin fór úr
`I am the lender` / `I am the borrower` yfir í `I am lending` / `I am borrowing`.

Skrár:
- `messages/is.json` — `creatorRoleLender`, `creatorRoleBorrowed`
- `messages/en.json` — `creatorRoleLender`, `creatorRoleBorrowed`

Staðfest:
- `npm run type-check` — exit 0

Engar SQL-, Supabase-, RLS-, auth- eða production-gagnabreytingar.

---

## #1 — Lendingarsíða fyrir innskráðan notanda

**Lokið:** 2026-06-07
**Staðfest af Stebbi:** já (handvirk prófun)

Authenticated heimasíða á `/auth-mvp/heim`. Heilsar notanda með `display_name`,
sýnir alltaf „Teskeiðar"-hluta með virku „Lánað og skilað"-tengli (badge með
fjölda opinna boða) og sjö óvirka „Væntanlegt"-hnappa í fastri röð. „Nýlegt"
sýnir þrjú nýjustu lán raðað eftir `loaned_at DESC, id DESC`; SHA-256-undirritað
kaka gerir notanda kleift að merkja lista sem lesinn og sjá staðfestingarbanner;
undirskrift breytist sjálfkrafa ef lán breytast eða fara yfir skiladag.
Home-leiðsögn var bætt við `/auth-mvp/minn-profill` og `lanad-og-skilad`;
báðar síður voru endurhannaðar í mobile-first skipulag sem hluti af #6.

Skrár:
- `app/auth-mvp/heim/page.tsx` — heimasíða (server component, ný)
- `app/auth-mvp/heim/RecentSection.tsx` — Nýlegt client component (ný)
- `app/auth-mvp/minn-profill/page.tsx` — Home-leiðsögn bætt við (endurhannaður í #6)
- `app/auth-mvp/lanad-og-skilad/page.tsx` — Home-leiðsögn bætt við (endurhannaðar allar lánasíður með `LoanShell` sem hluti af #6)
- `lib/loans/sort.ts` — `sortLoansForHome` (ný)
- `lib/__tests__/home-page.test.tsx` — 41 próf (ný)
- `lib/__tests__/profile-page.test.tsx` — 3 próf (ný)
- `messages/is.json`, `messages/en.json` — þýðingar

---

## #2 — Admin opnar tölfræðiflipa sjálfkrafa

**Lokið:** 2026-06-07
**Staðfest af Codex:** já (eftir race-condition fix)

Admin síðan opnar `stats` tab sjálfkrafa. `resolveInitialPeriod(stored, now)`
velur period: fyrsta heimsókn og öll villutilfelli (ógilt, framtíðar-timestamp,
localStorage ekki aðgengilegt) → `5min`; gildur tími → `pickPeriod(elapsed)`.
`setPeriod` og `setPeriodReady(true)` eru bæði kölluð í `finally` þannig að
React sameinar state-uppfærslurnar; analytics-fetch sér alltaf réttan period þegar
`periodReady` flippast.

Skrár:
- `lib/admin/period.ts` — `pickPeriod` helper
- `app/(admin)/admin/page.tsx` — default tab, localStorage effect, periodReady guard
- `lib/__tests__/admin-period.test.ts` — 18 unit tests (boundary cases)

---

## #3 — Samræma Teskeið-innskráningarslóðir

**Lokið:** 2026-06-07
**Staðfest af Codex:** já

Canonical Teskeið-innskráningarslóð: `/auth-mvp/innskraning`.
Aliases `/auth-mvp/innskráning`, `/innskraning`, `/innskráning` og
percent-encoded útgáfur (via `decodeURIComponent`) redirecta til canonical í
middleware. Alias-blokk er á eftir feature-flag athugun þannig að slökktur
`AUTH_MVP_ENABLED` sendir `/auth-mvp/innskráning` á `/` í stað canonical.
`BottomNav` í `NavBar.tsx` uppfærður til að nota canonical URL beint.
`app/innskraning/page.tsx` óhreyfð (eytt ekki).

Skrár:
- `middleware.ts` — alias redirect block + `decodeURIComponent` normalization
- `components/teskeid/NavBar.tsx` — `/innskraning` → `/auth-mvp/innskraning`
- `lib/__tests__/middleware.test.ts` — 8 regression tests (aliases, encoded,
  feature-flag priority, query string, /login fallback, no loop)

---

## #6 — Canonical lógó Teskeiðar

**Lokið:** 2026-06-07
**Staðfest af Stebbi:** já (localhost-prófun)

Canonical `TeskeidLogo` SVG-component útbúinn og staðfestur á öllum skjám.
Lógóið er smellanlegt á authenticated síðum og tengir á `/auth-mvp/heim`.
SVG er decorative þar sem Link hefur aðgengilegt `aria-label`. Engar gamlar
lógóútgáfur eru sýnilegar. Build og prófanir standast.

**Production-notkun og samþykktar staðsetningar:**

- `components/teskeid/NavBar.tsx` — `<TeskeidLogo size={80} decorative />` í aðal-header (`h-28 sm:h-32`) á opinberum síðum
- `app/auth-mvp/heim/page.tsx` — `<TeskeidLogo size={160/200} decorative />` neðst, í `Link` á `/auth-mvp/heim`
- `app/auth-mvp/minn-profill/page.tsx` — sama mynstur neðst
- `components/loans/LoanShell.tsx` — sama mynstur neðst á öllum `lanad-og-skilad`-síðum
- `app/hugmyndir/[slug]/page.tsx` — `<TeskeidLogo size={140/170} showBackground={false} decorative />` miðjað efst í article

**Favicon og app-icons:**

- `app/icon.svg` — andlitsfavicon
- `public/icon-192.png` — PWA-icon (192×192 px)
- `public/icon-512.png` — PWA-icon (512×512 px)

**Component-skrár:**

- `components/teskeid/TeskeidLogo.tsx` — canonical production-component
- `components/teskeid/teskeidLogoPaths.ts` — `TESKEID_VIEWBOX`, `TESKEID_GREEN_PATH`, `TESKEID_CREAM_DETAILS_PATH`

**Prófanir:**

- `lib/__tests__/teskeid-logo.test.tsx` — 14 próf
- `lib/__tests__/loan-pages.test.tsx` — lógótengill og decorative SVG prófuð
- `lib/__tests__/profile-page.test.tsx` — lógótengill og decorative SVG prófuð

---

## #14 — Öryggisforsendur fyrir opna beta

**Lokið:** 2026-06-08
**Staðfest af Codex:** v017 (14C), v021 (14B), v026 (14D lokafrágangi) — sql/42 keyrt af Stebbi 2026-06-08

Sex launch-blockers leystir, prófaðir og rýndir:

**1. Einangrun Teskeiðar frá eldri app-flötum (`LEGACY_ENABLED`)**
Middleware framfylgir `LEGACY_ENABLED`-flaggi. Legacy-slóðir (`/home`, `/children`, `/contacts`, `/chat`, `/settings` o.fl.) og API-slóðir þeirra skila 404 eða redirect til `/` þegar `LEGACY_ENABLED !== 'true'`. Teskeið-slóðir eru óhreyfðar. 38 regression-próf í `lib/__tests__/legacy-guard.test.ts`.

**2. Herðing `profiles_select` (sql/41)**
`profiles_select` policy breytt úr `USING (true)` í `USING (id = auth.uid())`. Nýr Teskeið-notandi les bara eigin prófíl. Defensive optional chaining bætt við `app/(app)/children/[id]/page.tsx` til að koma í veg fyrir crash þegar co-parent prófíll er ekki sýnilegur. 10 static regression-próf í `lib/__tests__/profiles-14a.test.ts`. SQL keyrt í production.

**3. IP/abuse rate-limit á `/api/auth-mvp/request-code` (sql/42)**
Nýtt `otp_ip_rate_limit`-tafla og `check_and_increment_ip_rate_limit` RPC (SECURITY DEFINER, bounded cleanup, service_role only). IP er HMAC-hash — engin hrátt IP geymd. `checkIpRateLimit()` í `lib/auth/ip-rate-limit.ts` er fail-open þegar AUTH_CODE_SECRET vantar/er of stutt, þegar IP-header vantar, eða þegar RPC mistekst. 27 próf í `lib/__tests__/ip-rate-limit.test.ts` ásamt sql/42 static contract. SQL keyrt í production af Stebba 2026-06-08.

**4. Atomic OTP-staðfesting (sql/38)**
`verify_user_otp_code` og `verify_admin_otp_code` RPC framkvæma attempt-talningu, `used_at`-uppfærslu og HMAC-samanburð í einni atóm Postgres-færslu með `FOR UPDATE` lás. Concurrent og replay-árásir blokkast. 30+ próf og sql/38 static contract í `lib/__tests__/otp-verification.test.ts`. SQL keyrt í production.

**5. Aðskilnaður session-aðgangs og feature-aðgangs (Phase 14C)**
`guardTeskeidSession()` (session-only) og `guardTeskeidAccess()` (session + allowlist) aðskilin í `lib/auth/guard.ts`. `checkFeatureAccess()` og `guardFeatureAccess()` bætt við `lib/loans/guard.ts`. `/auth-mvp/heim` notar `guardTeskeidSession()` + `checkFeatureAccess()`. `/auth-mvp/minn-profill` fær server-side layout-guard. `/api/teskeid/profile` framfylgir `AUTH_MVP_ENABLED`, session og email-presence. 40+ próf í `guard.test.ts`, `home-page.test.tsx`, `teskeid-profile-route.test.ts`.

**6. PII úr production-logs fjarlægt**
Netföng, OTP-kóðar og tokens eru ekki í `console.error`/`warn` í neinum server-side skrám. AST-scanner í `lib/__tests__/log-safety.test.ts` yfirferð yfir 50+ skrár við hverja keyrslu — þar á meðal `lib/auth/ip-rate-limit.ts` og `lib/loans/guard.ts` sem bætt var við í þessum fasa. Handvirkir próf í `lib/__tests__/auth-log.test.ts`.

**Lokastaða prófa:**

```
Test Files  28 passed (28)
Tests       813 passed | 22 skipped | 8 todo (843)
```

**Deployment:**
- `sql/41_profiles_select_own.sql` — keyrt í production.
- `sql/42_ip_rate_limit.sql` — keyrt í production (Stebbi, 2026-06-08).

Skrár:
- `sql/41_profiles_select_own.sql` — keyrt
- `sql/42_ip_rate_limit.sql` — keyrt í production af Stebba 2026-06-08
- `lib/auth/guard.ts` — `guardTeskeidSession()` + refactored `guardTeskeidAccess()`
- `lib/auth/ip-rate-limit.ts` — `hashIp()`, `checkIpRateLimit()` (ný)
- `lib/loans/guard.ts` — `checkFeatureAccess()`, `guardFeatureAccess()`, uppfærður `guardLoanAccess()`
- `lib/legacy/guard.ts` — `legacyGuard()` (ný)
- `app/(app)/children/[id]/page.tsx` — optional chaining
- `app/auth-mvp/heim/page.tsx` — session-only guard + `checkFeatureAccess()`
- `app/auth-mvp/minn-profill/layout.tsx` — server-side layout guard (ný)
- `app/api/auth-mvp/request-code/route.ts` — IP rate-limit check bætt við
- `app/api/teskeid/profile/route.ts` — `AUTH_MVP_ENABLED` + email-presence guard
- `lib/__tests__/legacy-guard.test.ts` — 38 próf (ný)
- `lib/__tests__/profiles-14a.test.ts` — 10 próf (ný)
- `lib/__tests__/otp-verification.test.ts` — 30+ próf (ný)
- `lib/__tests__/auth-log.test.ts` — 7 próf (ný)
- `lib/__tests__/log-safety.test.ts` — AST-scanner, 50+ skrár (ný)
- `lib/__tests__/guard.test.ts` — viðbætur
- `lib/__tests__/home-page.test.tsx` — viðbætur
- `lib/__tests__/request-code.test.ts` — viðbætur
- `lib/__tests__/ip-rate-limit.test.ts` — 27+ próf ásamt sql/42 contract (ný)
- `lib/__tests__/teskeid-profile-route.test.ts` — 13 próf (ný)

---

## #11 — „Nýlegt" fyrir ofan „Teskeiðar" á `/heim`

**Lokið:** 2026-06-07
**Staðfest af Stebbi:** já (localhost-prófun)

Á `/auth-mvp/heim` birtist „Nýlegt"-hlutinn fyrir ofan „Teskeiðar"-hlutann.
Röðin er: kveðja, „Nýlegt", „Teskeiðar", lógó. Gögn, cookie/read-state,
textar og virkni sectionanna eru óbreytt. DOM-próf staðfestir röðina.

Skrár:
- `app/auth-mvp/heim/page.tsx` — Nýlegt-section á undan Teskeiðar-section
- `lib/__tests__/home-page.test.tsx` — DOM-order próf: „Nýlegt" á undan „Teskeiðar"

---

## #4 — Minimal opnunarstýring fyrir fyrstu public Teskeið

**Lokið:** 2026-06-08
**Staðfest af Codex:** já (post-release review eftir commit `c1f98ac`)

Fyrsta public opnun Teskeiðar notar áfram einfalt feature-flag mynstur í stað
stórs release-stage kerfis. `AUTH_MVP_ENABLED` lokar `/auth-mvp/*` síðum og
`/api/auth-mvp/*` endpoints þegar flaggið er ekki virkt, og `LOANS_ENABLED`
stýrir `Lánað og skilað`. Óþekkt feature keys faila lokuð og server-side
`guardLoanAccess()` er áfram defense-in-depth á öllum lánasíðum og server
actions.

`sql/43_open_loans.sql` fjarlægði allowlist-kröfur úr loan RPC föllum án þess að
veikja service-role mörk, self-email vörn eða invitation rate limits. Codex
keyrði ekki SQL; staða byggir á útgáfu frá Claude Code/Stebba og post-release
kóða- og SQL-rýni.

Skrár:
- `lib/loans/guard.ts` — `Lánað og skilað` opið öllum innskráðum notendum þegar `LOANS_ENABLED=true`
- `sql/43_open_loans.sql` — allowlist fjarlægð úr `create_loan`, `add_loan_invitation` og `reserve_invitation_send`
- `lib/__tests__/guard.test.ts` — feature-flag og guard regression-próf
- `lib/__tests__/home-page.test.tsx` — sýnir/felur `Lánað og skilað` eftir feature-aðgangi

Staðfest:
- `npm run type-check` — exit 0
- `npm run test:run` — exit 0
- `npm run build` — exit 0, með fyrirliggjandi lint warnings sem tengjast ekki þessari opnun

---

## #34 — Meira áberandi `Skrá hlut í láni` takki

**Lokið:** 2026-06-10
**Staðfest af Claude Code:** já, sjá `ai-handoff/2026-06-10-0635-todo-034-035-v003-claude-loan-cta-save-loader-post-implementation.md` og `ai-handoff/2026-06-10-0652-todo-034-035-v004-claude-codex-findings-resolved.md`

`Skrá hlut í láni` á `/auth-mvp/lanad-og-skilad` var gerður að skýrari primary CTA. Ghost/dashed stíll var skipt út fyrir solid dökkgrænan hnapp með `Plus` iconi, meiri hæð, sterkari textaáherslu, hover state, shadow og focus-visible ring. Aðgengilegt textalabel var varðveitt.

Skrár:
- `app/auth-mvp/lanad-og-skilad/page.tsx` — primary CTA uppfærður
- `lib/__tests__/loan-pages.test.tsx` — CTA próf uppfært til að byggja á aðgengilegu nafni

Staðfest:
- `npx vitest run lib/__tests__/loan-pages.test.tsx` — 22 passed
- Sjá #35 fyrir lokapróf sama pakka eftir findings-resolved

---

## #35 — Vista-state helst virkt þar til redirect klárast

**Lokið:** 2026-06-10
**Staðfest af Claude Code:** já, sjá `ai-handoff/2026-06-10-0652-todo-034-035-v004-claude-codex-findings-resolved.md`

Nýskráningarformið fyrir lán heldur nú loading/disabled state virku frá submit þar til redirect klárast eða villa kemur upp. `Vista` og `Hætta við` eru disabled meðan vistun stendur yfir, duplicate submit er varinn, success-texti var fjarlægður og failure/throw paths endurheimta formið eðlilega.

Skrár:
- `components/loans/LoanForm.tsx` — `isSubmitting`, try/catch, disabled cancel, success text fjarlægður
- `messages/is.json`, `messages/en.json` — `teskeid.loans.saving`
- `lib/__tests__/loan-form.test.tsx` — 8 ný formhegðunarpróf
- `lib/__tests__/loan-pages.test.tsx` — page-level próf

Staðfest:
- `npx vitest run lib/__tests__/loan-pages.test.tsx lib/__tests__/loan-form.test.tsx` — 30 passed
- `npx tsc --noEmit` — no errors

---

## #23 — Breyta nafni á lánaða hlutnum

**Lokið:** 2026-06-09
**Staðfest af Stebbi:** já (`sql/44_loan_item_details_edit.sql` keyrð og localhost-prófun staðfest)

Sá sem skráði lán og/eða lánveitandi getur breytt heiti hlutar í `Lánað og skilað`.
Server-side RPC `update_loan_item_details` leyfir aðeins þrönga breytingu á
`item_name` og `note`, með réttindareglu á `created_by` eða `lender_user_id`.
Óviðkomandi notandi fær áfram ekki að breyta láninu.

Skrár:
- `sql/44_loan_item_details_edit.sql` — nýtt service-role RPC fyrir heiti og nótu
- `components/loans/*` — edit/save flæði fyrir hlutaupplýsingar
- `messages/is.json`, `messages/en.json` — notendatextar

---

## #24 — Athugasemdir á hluti í `Lánað og skilað`

**Lokið:** 2026-06-09
**Staðfest af Stebbi:** já (`sql/44_loan_item_details_edit.sql` keyrð og localhost-prófun staðfest)

Einföld athugasemd/nóta er komin á lánahluti. Sama þrönga RPC og #23 sér um að
vista `note`, trimma tóma strengi í `null` og halda hámarkslengd í skefjum.
Athugasemdakerfið er vísvitandi ekki fullur comment-thread í þessum áfanga.

Skrár:
- `sql/44_loan_item_details_edit.sql` — `p_note` með validation og `NULLIF(trim(...), '')`
- `components/loans/*` — birting og breyting á nótu
- `messages/is.json`, `messages/en.json` — notendatextar

---

## #26 — Hreinsa `Skila fyrir (valfrjálst)`

**Lokið:** 2026-06-09
**Staðfest af Stebbi:** já

`Skila fyrir (valfrjálst)` er hreinsanlegt í bæði nýrri færslu og breytingu á
færslu. Hreinsun sendir `due_at: null` eða samsvarandi tómt gildi og skyldureitur
fyrir lánadag helst áfram skyldureitur.

Skrár:
- `components/loans/*` — due-date clear hegðun í loan formi
- `messages/is.json`, `messages/en.json` — `Skila fyrir (valfrjálst)` og hreinsa-textar

---

## #28 — Fallegri `Skila fyrir` birting á lánaspjaldi

**Lokið:** 2026-06-09
**Staðfest af Stebbi:** já

Skiladagur birtist nú á sér línu á lánaspjaldi sem `Skila fyrir 9. júní 2026`,
án vikudags. Birtingin heldur dagsetningunni skýrri á mobile og sýnir skiladag
áfram þegar hann er kominn fram yfir, með aðgengilegri overdue merkingu.

Skrár:
- `components/loans/LoanCard.tsx` — sér lína fyrir `Skila fyrir`
- `messages/is.json`, `messages/en.json` — due-date textar

---

## #31 — Einfalda lánalistann með pillum, röðun og leit

**Lokið:** 2026-06-09
**Staðfest af Stebbi:** já

`Lánað og skilað` listinn er kominn í einfaldara flat-lista mynstur með
status-pillum, role-pillum, leit, talningum og einföldu sort vali. Sjálfgefið
sýnir listinn opin lán nýjast fyrst; hægt er að sía eftir skiluðum lánum,
hlutverki, textaleit og raða elst fyrst.

Skrár:
- `components/loans/LoanList.tsx` — pillur, leit, talningar og röðun
- `lib/__tests__/loan-list.test.tsx` — regression próf fyrir listann
- `messages/is.json`, `messages/en.json` — lánalista textar

Staðfest:
- `npm run test:run -- lib/__tests__/loan-list.test.tsx` — exit 0, 31 próf

---

## #29 — Sýnilegri innskráning og context-aware nav

**Lokið:** 2026-06-09
**Staðfest af Stebbi:** já

Hamborgaravalmynd er komin sem context-aware leiðsögn fyrir Teskeið. Innskráðir
notendur fá leiðir á `Heim`, `Minn prófíll`, `Lánað og skilað` og public
hugmyndaleiðir þar sem það á við. Óinnskráðir notendur fá áfram public leiðir og
nýskráningar-/innskráningarleið. Public hugmyndasíður velja menu-variant út frá
server-side session stöðu.

Skrár:
- `components/teskeid/TeskeidMenu.tsx` — hamburger menu og route-aware items
- `components/teskeid/NavBar.tsx` — menu variant og bottom nav copy
- `app/page.tsx`, `app/senda-hugmynd/page.tsx` — server-derived menu variant
- `messages/is.json`, `messages/en.json` — navigation textar
- `lib/__tests__/teskeid-menu.test.tsx` — menu regression próf

---

## #32 — Skýrari texti fyrir nýskráningu/innskráningu

**Lokið:** 2026-06-09
**Staðfest af Stebbi:** já

Navigation copy gerir nú skýrara að sama einfalda tölvupóstkóða-flæði þjónar
bæði nýskráningu og innskráningu. Hamburger og bottom-nav textar voru lagaðir svo
nýr notandi upplifi ekki að hann þurfi þegar að vera með aðgang.

Skrár:
- `messages/is.json`, `messages/en.json` — auth/navigation copy
- `components/teskeid/TeskeidMenu.tsx`, `components/teskeid/NavBar.tsx` — birting texta
- `lib/__tests__/teskeid-menu.test.tsx` — uppfærð label-próf

---

## #12 — Skýrari kosningatakki á hugmyndasíðum

**Lokið:** 2026-06-09
**Staðfest af Stebbi:** já

Kosningatakki á hugmyndasíðum er orðaður skýrar þannig að notandi skilji að hann
sé að kjósa hugmynd inn í Teskeið. Atkvæðavirkni og vörn gegn tvöföldum
atkvæðum er óbreytt.

Skrár:
- `components/teskeid/VoteButton.tsx` — skýrari button copy
- `messages/is.json`, `messages/en.json` — kosningatextar þar sem við á

---

## #20 — Bottom bar innskráning þarf stundum tvísmell á mobile

**Lokið:** 2026-06-09
**Staðfest af Stebbi:** já

Mobile navigation var yfirfarin og auth/navigation copy lagað samhliða
hamborgaravalmyndinni. Stebbi staðfesti að bottom bar innskráningarleiðin krefst
ekki lengur tvísmells í prófun.

Skrár:
- `components/teskeid/NavBar.tsx` — bottom nav label/navigation polish
- `messages/is.json`, `messages/en.json` — auth/navigation copy

---

## #25 — `Skrá hlut í láni` efst á lánalista

**Lokið:** 2026-06-09
**Staðfest af Codex:** já (read-only kóðayfirferð)

Aðal CTA fyrir nýja lánaskráningu er efst í efni `Lánað og skilað` og notar
þýðanlega textann `Skrá hlut í láni`. Smellur heldur áfram á nýja færslu.

Skrár:
- `app/auth-mvp/lanad-og-skilad/page.tsx` — CTA link efst í LoanShell efni
- `messages/is.json`, `messages/en.json` — `teskeid.loans.newItem`
- `lib/__tests__/loan-pages.test.tsx` — próf fyrir nákvæman CTA texta

---

## #16 — Væntingastýring fyrir mobile-first beta

**Lokið:** 2026-06-09
**Staðfest af Stebbi:** já

`betaLabel` á `/innskraning` uppfært í báðum tungumálum:
"Teskeið.is er í opnum beta prófunum og virkar best í síma eins og staðan er núna."

Skrár:
- `messages/is.json` — betaLabel
- `messages/en.json` — betaLabel

---

## #18 — Persónulegri headerkveðja

**Lokið:** 2026-06-09
**Staðfest af Stebbi:** já

Kveðja á `/auth-mvp/heim` notar nú fyrsta nafn: "{firstName}, þú ert með allt í teskeið!"
firstName er dregið út með `displayName.trim().split(/\s+/)[0]`.

Skrár:
- `app/auth-mvp/heim/page.tsx` — firstName derivation
- `messages/is.json` — greeting
- `messages/en.json` — greeting

---

## #15 — Íslenskar dagsetningar á lánaspjöldum

**Lokið:** 2026-06-09
**Staðfest af Stebbi:** já

Lánaspjöld sýna nú "Lánað laugardaginn 7. júní 2026" með íslenskum mánaðarheitum
úr messages (ekki Intl-locale sem er óáreiðanlegt á Vercel). Bætt við "Skilað"
línu með `returned_at` í `Atlantic/Reykjavik` timezone.

Skrár:
- `components/loans/LoanCard.tsx` — buildDateString, formatReturnedAt, returned date row
- `messages/is.json` — months, returnedAtFull
- `messages/en.json` — months, returnedAtFull

---

## #21 — Derhúfumerking verði `10,5`

**Lokið:** 2026-06-08
**Staðfest af Stebbi:** já (forskoðun samþykkt á `/preview/teskeid-logo/codex` og `/preview/favicons/codex`)

Merkingin á derhúfu lógósins breytt úr `A&10` í `10,5`. Þar sem `A&10` er bökuð
sem vector-shapes í `TESKEID_CREAM_DETAILS_PATH` var notuð overlay-nálgun: cream
rect hylja gamlar letter-holur og dökkgrænn `<text>10,5</text>` settur ofan á.

Skrár:
- `components/teskeid/TeskeidLogo.tsx` — cream rect + green text overlay bætt við
- `app/icon.svg` — sömu overlay bætt við favicon SVG
- `public/favicon-options/cap-mark-10-5-preview.svg` — favicon forskoðun (commit `409d075`)
- `public/teskeid-logo-10-5-preview.svg` — fullur lógó forskoðun (commit `7903f69`)

---

## #5A — Mobile login baseline: iOS auto-zoom og lógó-hlekkur

**Lokið:** 2026-06-08
**Staðfest af Stebbi:** já (Vercel build gekk í gegn, localhost handprófun eftir útgáfu)

Email input á `/innskraning` notaði `text-sm` (14 px) sem veldur iOS/Safari
sjálfvirkri aðdrætti. Breytt í `text-base sm:text-sm` (16 px á mobile) í samræmi
við `Design.md:148-149`.

Neðsta lógó á `/innskraning` er nú wrapped í `Link`. Serverhlutinn (page.tsx)
sendir `logoHref="/"` til forms; óinnskráður notandi fer á `/` við smelli.
`TeskeidLoginForm` fær `logoHref` prop (default `"/"`) til að forðast
hydration-misræmi.

Skrár:
- `components/teskeid/TeskeidLoginForm.tsx` — `logoHref` prop, `text-base sm:text-sm`, `Link` um neðsta lógó
- `app/innskraning/page.tsx` — `logoHref="/"` sent til forms
- `lib/__tests__/login-form.test.tsx` — mobile font-size próf, lógó-link próf (3 próf)
- `lib/__tests__/innskraning-page.test.tsx` — `logoHref` prop próf

Staðfest:
- `npm run type-check` — exit 0
- `npm run test:run` — 28 skrár, allt grín
- Vercel build — tókst

---

## #8 — Teskeið-loader með hugmyndaheitum úr hugmyndabankanum

**Lokið:** 2026-06-09
**Staðfest af Stebbi:** já

Standalone `TeskeidLoader` client component með hringlaga lógó og titla-cycling.
Titlar eru sóttir úr `ideas`-töflunni (public, featured/votes-ordered, limit 8),
hreinsuðir (trim, dedup, filter empty), og birtir einn í einu með 1 s millibili.
`prefers-reduced-motion` slær af `animate-pulse` og `setInterval`. Fallback ef
titlalisti er tómur. Aðgengilegt `role="status"` með `aria-label`; lógó decorative.

Preview síða á `/preview/teskeid-loader` (noindex) sýnir live + fallback sýn.

Skrár:
- `components/teskeid/TeskeidLoader.tsx` — client component (ný)
- `app/preview/teskeid-loader/page.tsx` — preview server component (ný)
- `lib/__tests__/teskeid-loader.test.tsx` — 8 próf (ný)
- `messages/is.json`, `messages/en.json` — `teskeid.loader` hluti

---

## #9 — Opin innskráning og public `Lánað og skilað`

**Lokið:** 2026-06-08
**Staðfest af Codex:** já (post-release review eftir commit `c1f98ac`)

Teskeiðarinnskráning er ekki lengur bundin við `auth_mvp_allowlist`. Allir
notendur með gilt netfang geta óskað eftir kóða, staðfest hann og fengið session.
Generic auth-svör, IP rate-limit, per-email OTP rate-limit, atomic OTP verify og
log-safety eru áfram varðveitt.

`Lánað og skilað` er public fyrir alla innskráða notendur þegar bæði
`AUTH_MVP_ENABLED=true` og `LOANS_ENABLED=true`. Loan RPC föllin leyfa einnig
boðum til netfanga sem eru ekki á allowlist, en eru áfram aðeins keyranleg af
`service_role`.

Sýnilegar `/auth-mvp/*` notendaslóðir voru meðvitað geymdar til að minnka
útgáfuáhættu. Sú eftirvinna er skráð sem TODO #22.

Skrár:
- `app/api/auth-mvp/request-code/route.ts` — opin OTP beiðni með generic response og IP rate-limit
- `app/api/auth-mvp/verify-code/route.ts` — staðfesting án allowlist-checks
- `app/innskraning/page.tsx` — innskráður notandi fer á `/auth-mvp/heim`
- `components/teskeid/TeskeidLoginForm.tsx` — public beta login copy
- `messages/is.json`, `messages/en.json` — uppfærðir login/public beta textar
- `sql/43_open_loans.sql` — public loan RPC opnun

Staðfest:
- `npm run type-check` — exit 0
- `npm run test:run` — exit 0
- `npm run build` — exit 0, með fyrirliggjandi lint warnings sem tengjast ekki þessari opnun
