# #37 v049 - Ólesið: rýni á vandamálum og framkvæmdaplan

**TODO:** #37 - `Nýlegt` sýni öll ólesin events og breytingasamhengi

**Agent:** Claude Code

**Samhengi:** Stebbi greindi frá fimm vandamálum í Ólesið og „Lánað og skilað" eftir að v048 Codex-stöðurýni var lokið. Claude Code las kóðagrunninn og greinir hér hvern vanda, rót hans og hversu flókin lagfæringin er.

---

## Vandamál sem Stebbi greindi

### 1. Breytt skiladagur fer ekki í Ólesið hjá pending invitation recipient

**Lýsing:** Stebbi breytti skiladegi á máli þar sem viðkomandi hafði ekki enn smellt á "Þekki málið". Viðkomandi fékk breytinguna ekki sem ólesið event.

**Rót vandans (staðfest í kóða):**

`updateLoan` í `lib/loans/actions.ts` (lína ~392-403) skráir event aðeins fyrir `user.id` og merkir það strax lesið (`initiallyRead: true`). Það sendir **ekkert** event til mótaðila -- ólíkt `updateLoanItemDetails` sem gerir það.

Ástæðan er sú að `canEdit` er `item.is_creator && item.invitation_status !== 'accepted'`, sem þýðir að `updateLoan` er aðeins kallað á meðan invitation er í `pending` stöðu. Í þeirri stöðu er `loan_items.borrower_user_id` / `lender_user_id` ekki stilltur á viðtakanda -- hann er aðeins þekktur sem `recipient_email_normalized` í `loan_invitations`.

**Lagfæring sem krefst ekki SQL:**

Í `updateLoan`, eftir að RPC hefur skilað `ok`, þarf að:
1. sækja `loan_invitations` þar sem `loan_id = loanId` og `status = 'pending'`
2. fá `recipient_email_normalized`
3. kalla `lookupUserIdByEmail` (fall er þegar til í `actions.ts`)
4. kalla `recordRecentEvent` fyrir viðtakandann -- sama `eventKey`, sama `payload` -- en **án** `initiallyRead`

Þetta krefst ekki SQL-migration, RPC-breytinga eða RLS-breytinga. Það notar föll sem eru þegar til staðar.

**Áhætta: Lágt.** Best-effort mynstur líkt og `updateLoanItemDetails`.

---

### 2. Ólesið sýnir alltaf "Breytt" - ekki "Breytt nafn" eða "Breytt athugasemd"

**Lýsing:** Þegar nafni hluts er breytt kemur "Breytt: Nafn hlutar" í Ólesið. Þegar athugasemd er breytt kemur líka "Breytt: Nafn hlutar". Stebbi vill sjá "Breytt nafn" eða "Breytt athugasemd" sem aðskilinn label.

**Rót vandans (staðfest í kóða):**

Í `app/auth-mvp/heim/page.tsx` (lína ~181-199) er label alltaf `t('eventLoanUpdated', { itemName })` óháð því hvað breyttist. Þetta er gert jafnvel þó `payload.changes` innihaldi nákvæmar upplýsingar um hvort `item_name`, `note`, `due_at` eða `loaned_at` breyttist.

Tækni til að búa til mismunandi label er þegar til (changes array, field nafn), en er aðeins nýttur í drawer detail lines.

**Lagfæring:**

1. Bæta við nýjum i18n-lyklum í `messages/is.json` og `messages/en.json`:
   - `eventLoanUpdatedName` -- "Breytt nafn: {itemName}"
   - `eventLoanUpdatedNote` -- "Breytt athugasemd: {itemName}"
   - `eventLoanUpdatedDueAt` -- "Breyttur skiladagur: {itemName}"
   - `eventLoanUpdatedLoanedAt` -- "Breytt lánsdagsetning: {itemName}"
   - `eventLoanUpdated` heldur sem fallback fyrir blönduðar breytingar

2. Í `heim/page.tsx`, eftir `buildDetailLines`, bæta við lítilli fall `pickLoanUpdatedLabelKey(changes)` sem:
   - ef `changes` er tómt eða `undefined`: skilar `eventLoanUpdated`
   - ef aðeins ein breyting og field er `item_name`: skilar `eventLoanUpdatedName`
   - ef aðeins ein breyting og field er `note`: skilar `eventLoanUpdatedNote`
   - ef aðeins ein breyting og field er `due_at`: skilar `eventLoanUpdatedDueAt`
   - ef aðeins ein breyting og field er `loaned_at`: skilar `eventLoanUpdatedLoanedAt`
   - annars: skilar `eventLoanUpdated`

**Áhætta: Mjög lágt.** Aðeins i18n + lítil label-vörpun á client-side.

---

### 3. Getur ekki breytt "Lánað" og "Skila fyrir" dagsetningu þegar invitation er accepted

**Lýsing:** Þegar Stebbi fer í edit-pennann á máli þar sem mótaðilinn hefur þegar samþykkt ("Þekki málið"), sér hann aðeins nafn og athugasemd -- ekki dagsetningar.

**Rót vandans (staðfest í kóða):**

Í `lib/loans/types.ts` (lína 165):
```
canEdit: item.is_creator && item.invitation_status !== 'accepted'
```

Þetta þýðir að þegar invitation er `accepted`, er `canEdit` false. Edit-síðan (`breyta/[id]/page.tsx`, lína 62) notar `canEdit` til að velja á milli `LoanForm` (full: nafn, athugasemd, lánsdagur, skiladagur) og `LoanItemDetailsForm` (þröngt: nafn, athugasemd eingöngu).

**Þetta er flóknara -- SQL/RPC-breyting líkleg:**

`update_loan_with_diff` RPC-ið framfylgir takmörkuninni server-side. Ef við breytum bara client-side `canEdit` mun RPC-ið hafna breytingunni. Þarf að:

1. Ákveða hvort lánveitandi (ekki endilega creator) megi alltaf breyta dagsetningum.
2. Breyta RPC `update_loan_with_diff` til að leyfa creator eða lender_user_id að breyta dagsetningum á accepted loan.
3. Uppfæra `getLoanCardControls` í `types.ts`.
4. Uppfæra edit-síðuna til að sýna full form í þessum tilvikum.
5. Tryggja að event fari á mótaðila (counterpart) við breytinguna.

**Ákvörðun til Stebba:** Þessi breyting krefst SQL-migration/RPC-uppfærslu og sérstaks plans. Ætti að fara í nýtt TODO-atriði eða verða hluti af #37 með sérstakri útfærslu. Claude Code mælist til að setja þetta sem #56 eða tengja við #37 með skýrri þáttaskiptingu.

**Forsenda:** Claude Code hefur ekki séð SQL-kóða RPC-inna. Þarf staðfestingu á nákvæmri auth-reglu í `update_loan_with_diff` áður en plan er fullklárað.

**Áhætta þegar fullframkvæmt: Miðlungs.** RPC-breyting snertir server-side auth. Þarf migration-plan og rýni.

---

### 4. "Til baka" frá loan detail fer á "Lánað og skilað" í stað "Teskeiðar"

**Lýsing:** Þegar Stebbi smellir á hlut í Ólesið og opnar hann, líður honum eins og hann sé að koma úr Ólesið / Teskeiðar (`/auth-mvp/heim`). En þegar hann smellir "Til baka" í detail-síðunni fer hann á "Lánað og skilað" (`/auth-mvp/lanad-og-skilad`) -- ekki á `/auth-mvp/heim` sem var upphafsstaðurinn.

**Rót vandans (staðfest í kóða):**

`app/auth-mvp/lanad-og-skilad/[id]/page.tsx` (lína 20-27) hefur hardcoded back-link:
```tsx
<Link href="/auth-mvp/lanad-og-skilad" ...>
  {t('backToList')}
</Link>
```

`viewHref` í `heim/page.tsx` er `/auth-mvp/lanad-og-skilad/${event.entity_id}` -- án neins `?from=` query param.

**Lagfæring:**

1. Í `heim/page.tsx`, breyta `viewHref` til að bæta við `?from=heim`:
   - `viewHref = /auth-mvp/lanad-og-skilad/${id}?from=heim`

2. Í `[id]/page.tsx`, lesa `searchParams.from` og velja back-href:
   - ef `from === 'heim'`: back-href er `/auth-mvp/heim`
   - annars: `/auth-mvp/lanad-og-skilad` (eins og núna)

3. Einnig breyta back-label í þessum tilvikum, t.d. "Til baka í Teskeiðar" vs. "Til baka í lista" -- þarf i18n-lykil.

**Áhætta: Mjög lágt.** Query param lestur, ekkert SQL.

**Athugasemd:** Sama mynstur þarf ef við viljum að edit-síðan (`breyta/[id]/page.tsx`) virki rétt þegar komið er úr Ólesið.

---

### 5. Dagsetning og tímasetning vantar á eventum í Ólesið lista

**Lýsing:** Stebbi vill sjá dagsetninguna og tímann á hverju event í Ólesið, t.d. "Miðvikudagurinn 24. júní kl. 7:40" sem smáleturssetning fyrir neðan heitið á eventinum.

**Rót vandans:**

`RecentEventDisplay` (í `lib/recent-events/types.ts`) inniheldur ekki `occurredAt`. `RecentSection.tsx` renderar aðeins `event.label`.

**Lagfæring:**

1. Bæta `occurredAt: string` við `RecentEventDisplay` interface í `types.ts`.
2. Í `heim/page.tsx`, þar sem `recentEvents` eru byggð (lína ~180-205), bæta við `occurredAt: event.occurred_at`.
3. Búa til `formatEventTimestamp(dateStr: string, locale: string): string` fall í `heim/page.tsx` sem skilar t.d. "Miðvikudagurinn 24. júní kl. 7:40" á íslensku.
4. Í `RecentSection.tsx`, birta `occurredAt`-gildið sem smáleturs texta (`text-xs text-muted-foreground`) undir `event.label` á hverri röð.

Tímasnið: Nota `Intl.DateTimeFormat` með `weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'`.

**Áhætta: Mjög lágt.** Aðeins type-breyting og UI-rendering.

---

## Yfirlit: hvað fer hvert

| Vandamál | Flókið | SQL þarf | Ákvörðun |
|---|---|---|---|
| 1. Pending recipient fær ekki update-event | Miðlungs | Nei | Framkvæma í þessum vinnupakka (#37) |
| 2. Nákvæmari event labels | Lágt | Nei | Framkvæma í þessum vinnupakka (#37) |
| 3. Edit dagsetningar á accepted loans | Hátt | Já (RPC) | Nýtt TODO-atriði (#56?) - plan þarf fyrst |
| 4. "Til baka" frá detail til Heim | Lágt | Nei | Framkvæma í þessum vinnupakka (#37) |
| 5. Tímasetning á events í lista | Lágt | Nei | Framkvæma í þessum vinnupakka (#37) |

---

## Framkvæmdaplan (vandamál 1, 2, 4, 5)

### Skrár sem þarf að breyta

| Skrá | Breyting |
|---|---|
| `lib/recent-events/types.ts` | Bæta `occurredAt: string` við `RecentEventDisplay` |
| `app/auth-mvp/heim/page.tsx` | `occurredAt`, `pickLoanUpdatedLabelKey`, `formatEventTimestamp`, `viewHref?from=heim` |
| `app/auth-mvp/heim/RecentSection.tsx` | Birta `occurredAt` sem smáleturs undir label |
| `app/auth-mvp/lanad-og-skilad/[id]/page.tsx` | Lesa `from` searchParam, velja back-href og back-label |
| `lib/loans/actions.ts` | `updateLoan` - senda event til pending recipient |
| `messages/is.json` | Nýir event label-lyklar og "Til baka í Teskeiðar" |
| `messages/en.json` | Sama |

### Framkvæmdaröð

1. `types.ts` -- bæta `occurredAt`
2. `heim/page.tsx` -- `occurredAt`, label-logic, timestamp-fall, `?from=heim`
3. `RecentSection.tsx` -- birta timestamp
4. `[id]/page.tsx` -- back-href logic
5. `actions.ts` -- `updateLoan` pending recipient notification
6. `messages/*.json` -- nýir lyklar

### Prófanir eftir framkvæmd

- `npm run type-check`
- `npm run test:run -- lib/__tests__/home-page.test.tsx lib/__tests__/actions.test.ts`

---

## Vandamál 3 - Tillaga að nýju TODO

**#56 Lánveitandi geti breytt dagsetningum á accepted láni**

Þarf:
- Skoðun á `update_loan_with_diff` SQL-RPC til að skilja núverandi auth-reglur
- Ákvarðanir: má aðeins `lender_user_id` eða líka creator (ef þeir eru ekki sama)?
- RPC-breyting með migration-plan og rollback
- Event til mótaðila: "Breyttur skiladagur" og "Breytt lánsdagsetning"
- Uppfærsla á `getLoanCardControls` og edit-síðu

Claude Code mælir með að setja þetta sem sér atriði í TODO og bíða þar til Stebbi staðfestir þörf og samþykkir plan.

---

## Localhost checks for Stebbi

Eftir framkvæmd:

1. Fara á `/auth-mvp/heim` sem innskráður notandi.
2. Staðfesta að tímasetning (t.d. "Miðvikudagurinn 24. júní kl. 7:40") birtist sem smáleturs texti undir heiti events í Ólesið lista.
3. Breyta nafni á hlut. Staðfesta að label í Ólesið hjá mótaðila sé "Breytt nafn: ..." en ekki "Breytt: ...".
4. Breyta athugasemd. Staðfesta að label sé "Breytt athugasemd: ...".
5. Breyta skiladegi. Staðfesta að label sé "Breyttur skiladagur: ...".
6. Fá loan sem er í pending invitation stöðu (viðtakandi hefur ekki smellt "Þekki málið"). Breyta skiladegi á láninu sem aðilinn sem lánaði. Skrá inn sem viðtakandinn og staðfesta að event komi í hans Ólesið.
7. Smella á event í Ólesið og opna hlutinn. Smella "Til baka". Staðfesta að notandinn endi á `/auth-mvp/heim` (Teskeiðar), ekki á `/auth-mvp/lanad-og-skilad`.
8. Regresja: smella á "Til baka" úr loan detail þegar komið beint úr lánalistanum (ekki frá Ólesið). Staðfesta að notandinn fari þá á `/auth-mvp/lanad-og-skilad`.
9. Regresja: event labels fyrir `loan_returned`, `loan_invitation_received`, o.fl. breytast ekki.

---

## Óvissa / þarf að staðfesta

- **Vandamál 1:** Forsenda um að `loan_invitations` hafi `loan_id` sem passar við loanId í `updateLoan`. Claude Code las ekki SQL-schema; þarf að staðfesta að dálkurinn sé til og filteranlegt.
- **Vandamál 3:** Claude Code hefur ekki lesið SQL-kóða `update_loan_with_diff`. Þarf Supabase-lestur áður en plan er skrifað.
- **Confidence:** Hár á vandamálunum 2, 4, 5. Miðlungs á vandamál 1 (þarf einnar línu staðfestingu á schema). Lágt á vandamál 3 (þarf fulla SQL-rýni).
