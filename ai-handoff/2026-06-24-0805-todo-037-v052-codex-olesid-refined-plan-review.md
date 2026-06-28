# #37 v052 - Codex-rýni á Claude v051 og svör Stebba

**TODO:** #37 - `Nýlegt` sýni öll ólesin events og breytingasamhengi

**Agent:** Codex

**Rýnt skjal:** `ai-handoff/2026-06-24-0800-todo-037-v051-claude-olesid-refined-plan.md`

**Svör Stebba við opnum spurningum:**

1. Gmail-punktagat í pending-recipient notification er **ekki ásættanlegt**.
2. Timestamp á að byrja á hástaf: `Miðvikudaginn 24. júní kl. 7:40`.

## Niðurstaða

Claude Code má ekki framkvæma v051 óbreytt.

Vandamál 2, 4 og 5 úr v051 má framkvæma sem léttan #37 pakka eftir smávægilegar lagfæringar:

- nákvæmari `Ólesið` labels;
- `from=heim` back-navigation;
- timestamp undir event label, með hástöfum í byrjun.

Vandamál 1, pending recipient fái notification þegar pending lán breytist, má **ekki** framkvæma með þeirri best-effort exact email lookup leið sem v051 leggur til. Þar sem Stebbi hafnar Gmail-punktagatinu þarf Claude Code annaðhvort að:

- gera robust canonical lookup með skýru öryggisplani og prófum, eða
- stoppa og skila nýju SQL/RPC plani áður en kóðað er.

## Findings

### High - Gmail-punktagat er ekki samþykkt

V051 segir að Gmail-notendur með punkta í skráðu netfangi fái hugsanlega ekki notification og spyr hvort það sé ásættanlegt. Stebbi svaraði: **ekki ásættanlegt**.

Afleiðing:

- Ekki nota `lookupUserIdByEmail(recipient_email_normalized)` sem endanlega lausn ef hún getur misst af dotted Gmail/Googlemail notendum.
- Ekki skrá þetta sem "accepted limitation".
- Ekki bæta bara commenti og testum sem skjalfesta gatið.

Claude Code þarf að endurplana vandamál 1.

Lágmarksviðmið fyrir samþykkta lausn:

- Sama canonical email regla og SQL56 notar þarf að finna réttan `auth.users` notanda.
- Dotted Gmail og Googlemail tilfelli þurfa próf.
- Lausnin má ekki leka emailum í logs, client payload, UI eða almenn API svör.
- Lausnin má ekki gera breiða user enumeration í appkóða.
- Ef lausnin krefst SQL/RPC helper þarf nýtt migration-plan með idempotency, rollback/recovery, grants og production impact.

Codex mælir með að Claude Code stoppi hér og skili stuttu revised plan fyrir vandamál 1 áður en framkvæmd hefst. Ef það reynist þurfa SQL má annaðhvort:

- taka vandamál 2, 4 og 5 fyrst sem no-SQL pakka; eða
- gera nýtt samþykkt migration-plan fyrir vandamál 1.

### Medium - Timestamp þarf hástaf

Stebbi valdi hástaf.

Timestamp label á að vera:

`Miðvikudaginn 24. júní kl. 7:40`

Ekki:

`miðvikudaginn 24. júní kl. 7:40`

Claude Code má áfram nota `messages` vikudaga/mánuði, en þarf að capitaliza fyrsta staf á lokastrengnum eða weekday-hlutanum. Bæta þarf prófi sem staðfestir hástafinn.

### Medium - UTC fullyrðingin þarf að vera nákvæm

V051 segir að Ísland sé UTC allan ársins hring og því sé beinn UTC útdráttur úr ISO timestamp nákvæmur. Þetta er rétt fyrir Reykjavik tíma sem stendur, en kóðinn ætti samt að vera skýr um intent:

- annaðhvort nota `Atlantic/Reykjavik` timezone í formatting helper;
- eða hafa comment/próf sem sýnir að UTC er viljandi vegna Reykjavik = UTC.

Codex kýs skýrara `Atlantic/Reykjavik` intent ef það er hægt án þess að treysta á íslensk `Intl` heiti. Til dæmis má nota `toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Reykjavik' })` / `toLocaleTimeString` til að fá local date/time tölur, en sækja íslensk heiti úr `messages`.

## Samþykkt scope núna

### Má framkvæma án frekari Stebba-spurningar

1. Nákvæmari labels í `Ólesið`:
   - `Breytt nafn`
   - `Breytt athugasemd`
   - `Breyttur skiladagur`
   - `Breytt lánsdagsetning`
   - fallback `Breytt` fyrir blandaðar breytingar.
2. `from=heim` á `viewHref` úr `Ólesið`, þannig að detail back-link fari aftur á `/auth-mvp/heim`.
3. Timestamp undir event label með hástaf í byrjun.

### Má ekki framkvæma með v051 leiðinni

1. Pending-recipient notification með exact lookup á `recipient_email_normalized`, ef dotted Gmail getur mistekist.
2. Accepted-loan dagsetningarbreytingar.
3. SQL/RPC/RLS/grants breytingar án nýs samþykkts plans.
4. `TODO.md` eða `DONE.md` breytingar nema Stebbi biðji sérstaklega um það.

## Kröfur fyrir revised plan á vandamál 1

Claude Code þarf að svara áður en vandamál 1 er framkvæmt:

1. Hvernig finnum við `auth.users.id` út frá canonical email án þess að missa dotted Gmail?
2. Þarf SQL helper/RPC til þess?
3. Ef já, hvað heitir migration-skráin og hvað breytir hún nákvæmlega?
4. Hvaða grants fær helperinn og af hverju?
5. Hvernig tryggjum við að helperinn leki ekki emailum eða notendagögnum?
6. Hvaða próf staðfesta:
   - venjulegt netfang;
   - dotted Gmail;
   - Googlemail;
   - enginn notandi fannst;
   - rangur/ótengdur notandi fær ekki event?

## Prófanir sem Codex vill sjá fyrir no-SQL hlutann

Ef Claude Code tekur aðeins vandamál 2, 4 og 5 fyrst:

- `npm run type-check`
- `npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/loan-pages.test.tsx`

Próf þurfa að staðfesta:

- `loan_updated` með einu `item_name` change birtir `Breytt nafn`.
- `loan_updated` með einu `note` change birtir `Breytt athugasemd`.
- `loan_updated` með einu `due_at` change birtir `Breyttur skiladagur`.
- `loan_updated` með einu `loaned_at` change birtir `Breytt lánsdagsetning`.
- blandaðar breytingar falla áfram í almennt `Breytt`.
- timestamp label birtist með hástaf: `Miðvikudaginn 24. júní kl. 7:40`.
- `?from=heim` detail-link skilar back-link á `/auth-mvp/heim`.
- detail opnað beint úr lánalista skilar back-link áfram á `/auth-mvp/lanad-og-skilad`.
- recipient email birtist ekki í label eða drawer.

## Localhost checks for Stebbi

Eftir no-SQL hlutann:

1. Opna `/auth-mvp/heim` sem innskráður notandi með `Lánað og skilað` virkt.
2. Staðfesta að hvert event í `Ólesið` sýni timestamp undir heiti, með hástaf, t.d. `Miðvikudaginn 24. júní kl. 7:40`.
3. Staðfesta að timestamp valdi ekki láréttu overflowi á 360-460 px mobile breidd.
4. Breyta nafni á hlut sem hefur mótaðila. Vænt: mótaðili sér `Breytt nafn: ...`.
5. Breyta athugasemd. Vænt: mótaðili sér `Breytt athugasemd: ...`.
6. Breyta skiladegi þar sem núverandi event-flæði styður mótaðila. Vænt: label er `Breyttur skiladagur: ...`.
7. Smella á event í `Ólesið`, smella `Skoða`, og síðan `Til baka`. Vænt: notandi endar á `/auth-mvp/heim`.
8. Opna detail beint úr `Lánað og skilað` lista og smella `Til baka`. Vænt: notandi endar á `/auth-mvp/lanad-og-skilad`.
9. Regression: `loan_returned`, `loan_invitation_received`, `loan_invitation_accepted` og önnur event labels breytast ekki óvart.
10. Regression: recipient email birtist hvergi í `Ólesið` label, drawer eða console.

Ekki prófa production gagnabreytingar eða Supabase SQL kæruleysislega. Ef vandamál 1 krefst SQL/RPC helper þarf sérstakt samþykki áður en það er keyrt eða deployað.

## Óvissa / þarf að staðfesta

- Codex keyrði ekki browser/manual localhost check.
- Mesta tæknilega óvissan er nú vandamál 1: robust canonical lookup fyrir pending recipient.
- Stebbi hefur þegar svarað opnu spurningunum: Gmail-punktagat er ekki ásættanlegt og timestamp á að byrja á hástaf.
