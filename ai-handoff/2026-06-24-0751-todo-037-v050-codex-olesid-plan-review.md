# #37 v050 - Codex-rýni á Claude v049 `Ólesið` plan

**TODO:** #37 - `Nýlegt` sýni öll ólesin events og breytingasamhengi

**Agent:** Codex

**Rýnt skjal:** `ai-handoff/2026-06-24-0840-todo-037-v049-claude-olesid-plan.md`

**Niðurstaða:** Claude Code má framkvæma vandamál 1, 2, 4 og 5 sem afmarkaðan #37 pakka, en ekki alveg óbreytt. Það þarf að herða timestamp-format, canonical-email lookup, prófanir og scope á `from=heim` áður en kóðabreyting hefst. Vandamál 3, dagsetningarbreytingar á accepted láni, á ekki að framkvæma í þessum pakka.

## Findings

### Medium - Timestamp-planið er of veikt

Í v049 er lagt til að bæta `occurredAt: string` við `RecentEventDisplay` og nota `Intl.DateTimeFormat` til að birta texta eins og `Miðvikudagurinn 24. júní kl. 7:40`.

Þetta þarf að herða:

- Ekki láta client rendera hrátt `occurredAt` ef hægt er að forðast það. Betra er að senda `occurredAtLabel` eða sambærilegt formattað label í `RecentEventDisplay`.
- Nota `Atlantic/Reykjavik` timezone skýrt.
- Ekki treysta blindandi á `Intl` fyrir íslensk weekday/month heiti. Verkefnið hefur áður leyst íslensk mánaðar- og vikudagaheiti með `messages` lyklum vegna Vercel/Intl óvissu.
- Bæta prófi með fastri dagsetningu/tíma sem staðfestir nákvæmt samþykkt orðalag, til dæmis `miðvikudaginn 24. júní kl. 7:40` eða það orðalag sem Stebbi vill.
- Passa að textinn sé smár, brotni eðlilega á mobile og valdi ekki láréttu overflowi eða óþægilegu hæðarstökki í `Ólesið`.

### Medium - Pending-recipient update event má ekki byggja óvarlega á exact email lookup

Í v049 er lagt til að sækja `loan_invitations.recipient_email_normalized` og kalla `lookupUserIdByEmail`.

Þetta þarf canonical-email rýni áður en kóðað er:

- Eftir SQL56 getur `loan_invitations.recipient_email_normalized` verið canonical Gmail netfang, til dæmis punktalaust `gmail.com`, á meðan `auth.users.email` getur enn verið dotted Gmail netfang.
- Ef `admin.auth.admin.getUserByEmail()` leitar exact getur þessi leið misst af skráðum notanda.
- Áður en þetta er útfært þarf Claude Code að staðfesta hegðunina í kóða/prófum.
- Bæta þarf `actions.test.ts` prófum fyrir venjulegt netfang og dotted Gmail/Googlemail canonical tilfelli.
- Ef exact lookup dugar ekki, skal stoppa og skila nýju plani. Þá gæti þurft SQL/RPC helper eða aðra örugga leið til að finna user með sömu canonical email reglu.
- Ekki lauma inn breiðri `auth.users` listun eða user enumeration.

### Medium - Prófunarlistinn er of þröngur

Í v049 eru aðeins nefnd:

- `npm run type-check`
- `npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/actions.test.ts`

Bæta þarf að minnsta kosti:

- `lib/__tests__/loan-pages.test.tsx` fyrir `?from=heim` og back-link hegðun.
- Heimaskjápróf fyrir ný event labels: `Breytt nafn`, `Breytt athugasemd`, `Breyttur skiladagur`, `Breytt lánsdagsetning`.
- Heimaskjápróf fyrir timestamp label í `Ólesið` röð.
- Actions-próf fyrir pending recipient update event, þar á meðal að actor event sé `initiallyRead: true` en recipient event sé ólesið.
- Regression-próf að recipient email birtist ekki í event label, drawer detail, UI-visible payload eða loggable texta.

### Medium - `from=heim` þarf skýra scope-reglu

`?from=heim` hugmyndin er góð, en þarf að vera nákvæm:

- `?from=heim` á aðeins að bætast við `viewHref` sem kemur úr `Ólesið` á heimaskjá.
- Bein opnun úr lánalista á áfram að fara til baka á `/auth-mvp/lanad-og-skilad`.
- Ef notandi fer úr detail yfir í edit og aftur þarf annaðhvort að skilgreina það sem out-of-scope eða varðveita `from=heim` áfram. Ekki skilja þetta óljóst.
- Back-label þarf nýja i18n lykla í bæði `messages/is.json` og `messages/en.json`, til dæmis fyrir `Til baka í Teskeiðar`.

### Low/Medium - Accepted-loan dagsetningabreyting á að vera sér TODO

Claude Code metur þetta rétt sem sér SQL/RPC mál. Codex staðfesti í `sql/48_update_loan_with_diff.sql` að `update_loan_with_diff` er pre-acceptance creator-only og hafnar accepted invitations. Þetta á því ekki heima sem létt #37 lagfæring.

Ekki breyta `TODO.md` eða stofna #56 fyrr en Stebbi samþykkir það sérstaklega.

Þegar þetta fer í sér plan þarf það að innihalda:

- nákvæma heimildarreglu: `lender_user_id`, creator, eða bæði;
- SQL migration fyrir `update_loan_with_diff` eða nýtt þrengra RPC;
- áhrif á RLS, auth, grants og functions;
- idempotency og rollback/recovery plan;
- event til mótaðila fyrir `Breytt lánsdagsetning` og `Breyttur skiladagur`;
- `Localhost checks for Stebbi`.

## Samþykkt scope fyrir næstu framkvæmd

Claude Code má framkvæma þessi atriði í #37 pakkanum, eftir að findings hér að ofan hafa verið tekin inn:

1. Pending recipient fær ólesið update-event þegar creator breytir pending boði.
2. `Ólesið` notar nákvæmari event labels fyrir eina breytingu:
   - `Breytt nafn`
   - `Breytt athugasemd`
   - `Breyttur skiladagur`
   - `Breytt lánsdagsetning`
3. `Skoða` frá heimaskjás-`Ólesið` fer á detail með `from=heim`, og back-link skilar notanda aftur á `/auth-mvp/heim`.
4. `Ólesið` listi sýnir dagsetningu og tíma events með smáum texta undir label.

Claude Code á ekki að framkvæma:

- accepted-loan dagsetningarbreytingar;
- SQL/RPC breytingar;
- RLS/grants/auth breytingar;
- TODO/DONE færslur nema Stebbi biðji sérstaklega um það.

## Kröfur fyrir implementation

Áður en Claude Code byrjar að breyta kóða þarf að uppfæra eigin plan með:

1. Hvernig canonical-email lookup verður prófað og leyst.
2. Nákvæmu timestamp-format falli, timezone og messages-lyklum.
3. Nákvæmu scope fyrir `from=heim`, þar á meðal hvort edit-flow varðveitir það eða er out-of-scope.
4. Uppfærðum prófalista.

## Prófanir sem Codex vill sjá

Keyra eftir framkvæmd:

- `npm run type-check`
- `npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/actions.test.ts lib/__tests__/loan-pages.test.tsx`

Bæta eða uppfæra próf sem staðfesta:

- `loan_updated` með einu `item_name` change birtir `Breytt nafn`.
- `loan_updated` með einu `note` change birtir `Breytt athugasemd`.
- `loan_updated` með einu `due_at` change birtir `Breyttur skiladagur`.
- `loan_updated` með einu `loaned_at` change birtir `Breytt lánsdagsetning`.
- blandaðar breytingar falla áfram í almennt `Breytt`.
- timestamp label birtist undir event label og notar Reykjavik tíma.
- pending recipient fær ólesið event þegar pending boð er uppfært.
- actor event er áfram `initiallyRead: true`.
- recipient event er ekki `initiallyRead`.
- `?from=heim` detail-link skilar back-link á `/auth-mvp/heim`.
- detail opnað beint úr lánalista skilar back-link áfram á `/auth-mvp/lanad-og-skilad`.
- recipient email lekur ekki í label, drawer details eða payload sem er sýnt í UI.

## Localhost checks for Stebbi

Eftir framkvæmd á samþykktu scope skal Stebbi prófa:

1. Opna `/auth-mvp/heim` sem innskráður notandi með `Lánað og skilað` virkt.
2. Staðfesta að hvert event í `Ólesið` sýni smáan tíma undir heiti, til dæmis `miðvikudaginn 24. júní kl. 7:40`, án lárétts overflow á mobile.
3. Breyta nafni á hlut sem hefur mótaðila. Vænt: mótaðili sér `Breytt nafn: ...` í `Ólesið`.
4. Breyta athugasemd. Vænt: mótaðili sér `Breytt athugasemd: ...`.
5. Breyta skiladegi á pending boði þar sem viðtakandi hefur ekki smellt `Þekki málið`. Vænt: viðtakandi fær ólesið event.
6. Smella á event í `Ólesið`, smella `Skoða`, og síðan `Til baka`. Vænt: notandi endar á `/auth-mvp/heim`.
7. Opna sama detail beint úr `Lánað og skilað` lista og smella `Til baka`. Vænt: notandi endar á `/auth-mvp/lanad-og-skilad`.
8. Regression: `loan_returned`, `loan_invitation_received`, `loan_invitation_accepted` og önnur event labels breytast ekki óvart.
9. Regression: recipient email birtist hvergi í `Ólesið` label, drawer eða console.

Ekki prófa production gagnabreytingar eða Supabase SQL kæruleysislega. Ef test þarf production notendur eða production gögn skal stoppa og biðja Stebba um sérstakt samþykki og öruggt prófaplan.

## Óvissa / þarf að staðfesta

- Codex keyrði ekki browser/manual localhost check.
- Canonical-email lookup fyrir pending recipient er stærsta tæknilega óvissan í létta #37 pakkanum.
- Timestamp-orðalag þarf Stebba-samþykki ef hann vill nákvæmlega `Miðvikudagurinn 24. júní kl. 7:40` frekar en lægra/stílhreinna `miðvikudaginn 24. júní kl. 7:40`.
- Accepted-loan dagsetningarbreyting er staðfest sérmál og þarf nýtt plan ef Stebbi vill taka það næst.
