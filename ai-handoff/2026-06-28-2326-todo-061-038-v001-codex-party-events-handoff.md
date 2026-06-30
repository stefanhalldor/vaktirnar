# TODO #61 + #38 - Aðila-flæði og höfnun í sögu/Ólesið

**Created:** 2026-06-28 23:26  
**Timezone:** Atlantic/Reykjavik  
**Frá:** Codex  
**Til:** Claude Code  
**Tegund:** Implementation handoff  

---

## Markmið

Taka #61 og #38 saman í einum litlum event/history pakka.

#61 er aðalatriðið: aðila-flæðið á að birtast í `Saga hlutarins`.
#38 er undirtilfelli: þegar boði er hafnað á sendandi að fá öruggt event í
`Ólesið`/`Nýlegt`, og höfnunin á líka að sjást í sögu hlutarins ef notandi hefur
aðgang.

Ef þessi pakki leysir decline bæði í `Saga hlutarins` og `Ólesið`, má loka #38
sem hluta af #61.

---

## Staða áður en framkvæmd hefst

#60 var færður í DONE. Spjall er komið inn í `Saga hlutarins` með SQL61/SQL62 og
á ekki að vera hluti af þessum pakka nema breytingin þurfi að samræmast
history-row formatting.

Design.md var lesið af Codex fyrir þetta handoff. Viðeigandi reglur:

- appið er mobile-first, ekki dashboard
- notendatexti á að vera í `messages/is.json` og `messages/en.json`
- history/metadata textar skulu vera stuttir og læsilegir
- mobile 360-460 px má ekki valda overflow, zoomi eða overlap
- ekki búa til kort inni í kortum eða óþarfa nýtt visual pattern

---

## Pre-check sem Claude Code á að gera fyrst

Áður en kóða er breytt skal staðfesta núverandi stöðu:

1. Lesa `lib/loans/actions.ts`:
   - `performInvitationSend`
   - `addLoanInvitation`
   - `claimInvitation`
   - `declineInvitation`
2. Lesa `lib/loans/history.server.ts` og `lib/recent-events/display.ts`.
3. Staðfesta hvort þessi event types séu þegar til:
   - `loan_invitation_received`
   - `loan_invitation_accepted`
   - `loan_invitation_declined`
4. Staðfesta hvort þau birtast í `Saga hlutarins`.
   - Mikilvægt: `get_loan_event_history` sækir bara rows með
     `source='loans'`, `entity_type='loan'` og `entity_id=<loan_id>`.
   - Núverandi `loan_invitation_received` í `performInvitationSend` virðist nota
     `entity_type='invitation'` og `entity_id=<invitation_id>`, þannig það er
     líklega rétt fyrir `Ólesið` en ekki fyrir `Saga hlutarins`.
5. Staðfesta hvort `claimInvitation` og `declineInvitation` séu þegar að skrá
   accepted/declined fyrir creator með `entity_type='loan'` og `entity_id=loanId`.
   Ef já, ekki tvískrá þau.

Ef pre-check sýnir að hluti af #61/#38 er þegar leystur, þrengja scope og skrá
það í handoff.

---

## Scope

### Bæta við eða laga event þegar aðila er bætt við / boð verður virkt

Vænt hegðun:

- Þegar aðila er bætt við hlut með `addLoanInvitation`, á `Saga hlutarins` að fá
  loan-scoped event, t.d. `loan_party_added` eða sambærilegt.
- Þetta event á að vera `entity_type='loan'` og `entity_id=loanId`.
- Actor á að vera sá sem bætti aðilanum við.
- Payload má innihalda `itemName` og mögulega stutt role/status, en ekki raw
  netfang viðtakanda.
- Ekki nota `recent_events.user_id` sem actor; nota `actorUserId` í payload eins
  og aðrir nýir history-events gera.

### Samræma samþykkt boð

Vænt hegðun:

- Þegar viðtakandi velur `Þekki málið`, á það að birtast í `Saga hlutarins`.
- Creator/sendandi fær áfram `Ólesið`/recent event ef það er núverandi hegðun.
- Ekki tvískrá ef `claimInvitation` skráir þetta nú þegar með loan-scoped event.
- Ef núverandi event vantar actor eða label, laga það frekar en að bæta duplicate.

### Samræma hafnað boð (#38)

Vænt hegðun:

- Þegar viðtakandi velur `Kannast ekki við þetta`, á það að birtast í
  `Saga hlutarins`.
- Sendandi á að fá `Ólesið`/recent event um höfnun.
- Recipient email má ekki birtast í payload, UI eða logs.
- Viðtakandinn á ekki að sitja eftir með actionable unread boð eftir höfnun;
  núverandi `ackRecentEventByKey` hegðun þarf að vera staðfest.
- Ef núverandi `declineInvitation` skráir creator event nú þegar, tryggja að það
  sé loan-scoped og history-readable.

---

## Textar og labels

Allur notendatexti í `messages/is.json` og `messages/en.json`.

Tillaga að íslenskum labels, en Claude má stilla í samræmi við núverandi keys:

- `Aðila bætt við`
- `Þekkti málið`
- `Kannast ekki við þetta`

Ef itemName er hluti af labeli, samræma við núverandi event-stíl:

- `Aðila bætt við: {itemName}`
- `Þekkti málið: {itemName}`
- `Kannast ekki við þetta: {itemName}`

History á að sýna actor-línu þar sem hægt er:

- `Framkvæmt af {name}`

Ekki nota email í label.

---

## Öryggi og gögn

- Ekki veikja RLS, grants eða service-role mörk.
- Ekki veita `anon` eða `authenticated` beinan lestur á `loan_items`,
  `loan_invitations`, `recent_events` eða auth-töflur.
- Ekki logga recipient email eða raw invitation email.
- Ekki skila recipient email í event payload til client.
- Ekki búa til public share eða token mechanism.
- Event má birtast í history eingöngu þeim sem hafa access að loan detail/history.
- Pending recipient access á að fylgja núverandi `get_loan_event_history`
  reglum, ekki nýrri veikari leið.

---

## Líklegar skrár

- `lib/loans/actions.ts`
- `lib/recent-events/types.ts`
- `lib/recent-events/display.ts`
- `lib/loans/history.server.ts`
- `messages/is.json`
- `messages/en.json`
- `lib/__tests__/actions.test.ts`
- `lib/__tests__/history-server.test.ts`
- mögulega `lib/__tests__/loan-pages.test.tsx`

SQL á líklega ekki að vera nauðsynlegt nema núverandi event/history contract
neyði það. Ef SQL þarf, stoppa og skila sérstöku SQL handoffi áður en Stebbi
keyrir migration.

---

## Prófanir sem Claude Code á að bæta eða uppfæra

Lágmark:

1. Unit/action test fyrir `addLoanInvitation`:
   - skráir loan-scoped event um aðila bætt við
   - payload lekur ekki netfangi
   - actorUserId er sett
2. Unit/action test fyrir `claimInvitation`:
   - staðfestir að accepted event sé loan-scoped og actor sé viðtakandi
   - ekki duplicate ef núverandi hegðun er þegar til
3. Unit/action test fyrir `declineInvitation`:
   - sendandi fær event
   - event er loan-scoped þannig history getur birt það
   - received-event hjá viðtakanda er ack-að
   - payload lekur ekki netfangi
4. History formatter test:
   - `loan_party_added` eða valið event type birtir rétt label
   - `loan_invitation_accepted` birtir rétt label
   - `loan_invitation_declined` birtir rétt label
   - actor label birtist þegar `actor_display_name` er til

Keyra að minnsta kosti:

```bash
npm run type-check
npm run test:run
```

Ef allur test suite er of þungur í fyrstu umferð, keyra targeted tests fyrst og
skrá nákvæmlega hvað var keyrt og hvað var ekki keyrt.

---

## Localhost checks for Stebbi

Eftir breytingu á localhost:

1. Búa til nýjan hlut án mótaðila.
2. Bæta við aðila.
3. Opna detail-síðu hlutarins.
4. Vænt:
   - `Saga hlutarins` sýnir event um aðila bætt við.
   - Eventið sýnir ekki netfang viðtakanda.
   - Actor-lína segir hver framkvæmdi aðgerðina.
5. Sem viðtakandi eða með prófnotanda: opna pending boð og velja `Þekki málið`.
6. Vænt:
   - `Saga hlutarins` sýnir event um að boðið var samþykkt / viðtakandi þekkti
     málið.
   - Sendandi sér viðeigandi `Ólesið`/recent event ef hann á að fá það.
7. Endurtaka með nýju pending boði og velja `Kannast ekki við þetta`.
8. Vænt:
   - Sendandi fær `Ólesið`/recent event um höfnun.
   - `Saga hlutarins` sýnir höfnunina fyrir þá sem hafa aðgang.
   - Viðtakandi situr ekki eftir með actionable unread boð.
9. Prófa mobile breidd 360-460 px:
   - history textar passa inni í rammanum
   - enginn láréttur overflow
   - enginn texti overlappar
   - actor/timestamp metadata er læsilegt

Varúð:

- Ekki prófa með viðkvæmum raunnetföngum nema Stebbi samþykki það.
- Ekki keyra SQL eða breyta production gögnum án sér samþykkis.

---

## Hvernig loka á TODO eftir útgáfu

Ef þetta virkar:

- Færa #61 í DONE.
- Færa #38 í DONE sem “leyst sem hluti af #61”.
- Uppfæra forgangstöflu þannig að #39 verði næst, nema Stebbi forgangsraði #59
  eða #63 á undan.

Ef bara hluti virkar:

- Halda #61 opnu með nákvæmri lýsingu á því sem vantar.
- Halda #38 opnu ef sendandi fær ekki rétt `Ólesið`/recent event við höfnun.
