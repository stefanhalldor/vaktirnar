# #58 v004 - Actor í ferli og fallegri history-rammi

**TODO:** #58 - Ferill hlutar á detail-síðu  
**Agent:** Codex  
**Tilefni:** Stebbi prófaði history og sá að raunverulegur framkvæmdaaðili birtist ekki. Hann vill líka að history sé fallegra, í hvítum ramma svipað og lánahluturinn sjálfur.  
**Staða:** Þetta þarf að laga áður en #58 er talið tilbúið.

---

## Niðurstaða Codex

Stebbi hefur rétt fyrir sér. History er ekki nógu traust ef hún sýnir bara hvað
gerðist, en ekki hver gerði aðgerðina.

Ekki reyna að giska á actor út frá `recent_events.user_id`. Sá dálkur er
móttakandi event-færslunnar, ekki endilega framkvæmdaaðilinn.

Rétta leiðin er:

1. Skrá raunverulegan actor í event payload við ritun nýrra events.
2. Láta history RPC lesa actor úr payload og skila öruggu display-nafni.
3. Sýna actor í history UI.
4. Setja history section í hvítan ramma sem passar við lánahlutinn.

---

## Skýr ósk Stebba

Stebbi skrifaði:

> Ég smellti á "Merkja sem skilað" en mitt nafn kemur ekki í söguna... verðum að gera betur í setja raunverulegan framkvæmdaaðila í söguna
>
> Svo mættum við gera þetta fallegra eins og lánahluturinn sjálfur er í fallegum hvítum ramma

Þetta á við um #58 áður en release er samþykkt.

---

## Mikilvæg SQL-staða

Ef `sql/59_get_loan_event_history.sql` hefur ekki farið í production, má breyta
SQL59 áður en Stebbi keyrir hana.

Ef SQL59 hefur þegar verið keyrð í production eða öðrum stað sem við viljum
meðhöndla sem applied migration, ekki breyta henni afturvirkt sem eina skref.
Búið þá til næstu migration, líklega `sql/60_...`, sem replace-ar
`get_loan_event_history`.

Codex veit ekki hvort Stebbi er búinn að keyra SQL59 þegar þetta handoff er
lesið. Claude Code þarf að staðfesta stöðuna við Stebba áður en migration-númer
er ákveðið.

---

## Implementation plan

### 1. Bæta actor við event payload

Bætið optional actor metadata við `RecentEventPayload`:

```ts
actorUserId?: string
```

Best er að styðja þetta miðlægt í `recordRecentEvent`, til dæmis með optional
top-level argumenti:

```ts
actorUserId?: string
```

og láta helperinn merge-a því inn í `payload`:

```ts
payload: args.actorUserId
  ? { ...args.payload, actorUserId: args.actorUserId }
  : args.payload
```

Þá þarf ekki að handskrifa `actorUserId` inn í hvert payload-object með hættu á
misræmi.

Allar loan action event-skráningar þar sem raunverulegur actor er þekktur eiga
að setja `actorUserId: user.id` eða sambærilegt actor-id:

- `createLoan`: actor er sá sem býr til lánið.
- `performInvitationSend`: actor er sá sem sendir boðið, `userId` param.
- `updateLoan`: actor er sá sem breytir pre-acceptance lánsupplýsingum.
- pending recipient notification úr `updateLoan`: sama `actorUserId` og actor.
- `markReturned`: actor er sá sem smellir á `Merkja sem skilað`.
- `undoReturn`: actor er sá sem smellir á `Afturkalla`.
- `deleteLoan`: actor er sá sem eyðir eða gerir hlut óvirkan.
- `claimInvitation`: actor er sá sem samþykkir boðið.
- `declineInvitation`: actor er sá sem hafnar boðinu.
- `updateLoanItemDetails`: actor er sá sem breytir nafni, athugasemd eða dagsetningum.

Fyrir duplicate actor/counterpart rows þarf sama `event_key` og sama
`actorUserId` að fara á báðar raðir.

### 2. Ekki retro-filla gömul events

Gömul events hafa ekki actor metadata. Ekki giska á actor út frá:

- `recent_events.user_id`
- því hvor row var fyrst
- því hvort eventið var `initiallyRead`

Fyrir gömul events má einfaldlega fela actor-línuna eða sýna hlutlausan fallback
ef Stebbi samþykkir það. Codex mælir með að fela actor-línuna þegar actor vantar,
svo kerfið segi ekki ósatt.

### 3. Uppfæra SQL history RPC

History RPC þarf að skila actor display-nafni, ekki actor user-id.

Tillaga að nýju return field:

```sql
actor_display_name text
```

SQL má lesa actor úr payload:

```sql
re.payload->>'actorUserId'
```

Ekki kasta þessu beint í uuid nema búið sé að verja castið. Notið örugga
uuid-regex/lateral grein svo gömul eða óvænt payload brjóti ekki history query.

Mynstur:

```sql
LEFT JOIN LATERAL (
  SELECT (re.payload->>'actorUserId')::uuid AS actor_user_id
  WHERE (re.payload->>'actorUserId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
) actor_meta ON true
LEFT JOIN public.profiles actor_profile
  ON actor_profile.id = actor_meta.actor_user_id
```

Skilið:

```sql
actor_profile.display_name AS actor_display_name
```

Ekki skila:

- actor user-id
- email
- recipient email
- raw auth data

Haldið áfram að nota `p_actor_id` access-gate og service-role-only grants.

### 4. Uppfæra TypeScript history formatter

`RawHistoryRow` þarf að fá:

```ts
actor_display_name: string | null
```

`LoanHistoryItem` þarf optional actor label, til dæmis:

```ts
actorLabel?: string
```

Ef `actor_display_name` er til staðar, setja:

```ts
actorLabel: tLoans('history.actor', { name: actorDisplayName })
```

Mælt message:

```json
"history": {
  "title": "Ferill hlutarins",
  "empty": "Engar skráðar aðgerðir.",
  "actor": "Framkvæmt af {name}"
}
```

Enska:

```json
"actor": "Done by {name}"
```

Ef actor vantar, ekki sýna actor-línu.

### 5. UI polish á `LoanHistory`

Stebbi vill fallegan hvítan ramma eins og lánahluturinn sjálfur.

Uppfærið `components/loans/LoanHistory.tsx` þannig að section sé sér hvítur
rammi, ekki bara border-top lína.

Mynstur sem passar við núverandi loan card:

```tsx
<section
  aria-label={labels.title}
  className="bg-white border border-black/5 rounded-2xl p-4 flex flex-col gap-3"
>
```

Innihald:

- `h2` sem er skýrari, ekki of daufur:
  - `text-sm font-semibold text-[#1b1c19]`
- event label:
  - `text-sm font-medium text-[#1b1c19]`
- timestamp:
  - `text-xs text-[#72796e]`
- actor line:
  - `text-xs text-[#72796e]`
- detail lines:
  - halda `border-l` eða mildri vinstri línu, en passa að hún sé ekki of veik eða skökk.

Ekki setja kort inni í kort. Þetta er sér section undir `LoanCard`, þannig að
hvítur rammi er í lagi.

### 6. Íslenskur texti

Forðist hráa eða vélræna texta.

Gott:

- `Framkvæmt af Stefáni`
- `Engar skráðar aðgerðir.`

Forðist:

- `Actor: Stefán`
- `User performed`
- `Framkvæmdaaðili: unknown`

Ef actor vantar í gömlum events, betra að sleppa actor-línunni en sýna ljótan
fallback.

---

## Próf sem þarf að uppfæra eða bæta við

### Actions tests

Uppfæra tests sem assert-a `payload` nákvæmlega. Þegar `actorUserId` bætist við
þarf oft að nota:

```ts
payload: expect.objectContaining({
  itemName: '...',
  actorUserId: 'actor-uuid',
})
```

Prófa sérstaklega:

- `markReturned` setur actorUserId.
- `undoReturn` setur actorUserId.
- `updateLoanItemDetails` setur actorUserId á actor og counterpart event.
- `claimInvitation` og `declineInvitation` setja actorUserId sem viðtakandann.

### History formatter tests

Bæta við testum fyrir `getLoanHistory` eða sér formatter ef hann er tekinn út:

- row með `actor_display_name` skilar `actorLabel`.
- row án `actor_display_name` skilar engri actor-línu.
- duplicate `event_key` birtist bara einu sinni.
- `loan_updated` með einu fieldi heldur sértæku labeli.

### SQL static tests

Bæta við eða uppfæra migration test fyrir SQL59/SQL60:

- RPC skilar ekki `user_id`.
- RPC skilar `actor_display_name`.
- SQL notar ekki `recent_events.user_id` sem actor.
- SQL castar ekki `payload->>'actorUserId'` óvarið í uuid.
- grants eru áfram aðeins `service_role`.

### UI tests

Lágmarks component/page test:

- `LoanHistory` sýnir title, timestamp, actor label og detail lines.
- empty state virkar enn.

---

## Design.md

Þetta snertir UI og detail-layout. Fylgið `Design.md`.

Útfærslan á að vera:

- mobile-first
- hvítur, rólegur rammi
- ekki nested card
- enginn horizontal overflow á 360/390 px
- enginn stór hero/textastíll
- sama sjónræna fjölskylda og `LoanCard`

---

## Localhost checks for Stebbi

Eftir breytingu og SQL/schema cache:

1. Opna detail-síðu láns sem hefur history.
   - Vænt: `Ferill hlutarins` er í hvítum fallegum ramma undir lánahlutnum.
   - Vænt: ramminn passar sjónrænt við lánaspjaldið.

2. Smella á `Merkja sem skilað`.
   - Vænt: ný history-færsla birtist fyrir `Skilað`.
   - Vænt: nafn þess sem smellti birtist, til dæmis `Framkvæmt af Stefáni`.

3. Smella á `Afturkalla`.
   - Vænt: ný history-færsla birtist fyrir afturköllun.
   - Vænt: sama actor-nafn birtist rétt.

4. Breyta nafni, athugasemd, lánsdagsetningu og skiladegi.
   - Vænt: hver breyting sýnir rétt event label og actor.
   - Vænt: field detail línur eru áfram læsilegar.

5. Opna sama lán sem mótaðili.
   - Vænt: mótaðili sér sama history og sama actor-nafn.
   - Vænt: engin netföng eða user-id birtast.

6. Skoða eldra lán með events frá því áður en actor metadata var til.
   - Vænt: history birtist áfram.
   - Vænt: actor-lína vantar bara þar sem actor er ekki skráður, en ekkert brotnar.

7. Prófa 360 px og 390 px breidd.
   - Vænt: enginn horizontal overflow.
   - Vænt: texti skarast ekki og history-card ýtir ekki lánaspjaldi úr lagi.

Ekki deploya eða keyra SQL án þess að Stebbi samþykki það sérstaklega.

---

## Tillaga að næsta skrefi

Claude Code ætti að laga þetta áður en #58 fer í release.

Mikilvægasta er actor metadata. UI-ramminn er minni breyting en ætti að fylgja
með strax því Stebbi er búinn að kalla hana út í sömu prófun.
