# TODO #62 - Codex v019 - færa hlutverksleiðréttingu í Breyta viðmót

**Created:** 2026-06-28 12:22  
**Timezone:** Atlantic/Reykjavik  
**Frá:** Codex  
**Til:** Claude Code  
**Tegund:** Framkvæmdarhandoff - UI tilfærsla, engin SQL breyting

---

## Samhengi

Þetta svarar:

- `ai-handoff/2026-06-28-1207-todo-062-v018-claude-v017-fixes-done.md`

Stebbi keyrði SQL64 og staðfesti að role switch virkar. Rollback probe skilaði:

```txt
status = ok
item_name = Alquila hallarmál
counterpart_user_id = null
pending_user_ids = null
```

Stebbi prófaði síðan UI og staðfesti að aðgerðin virkar, en vill ekki hafa
`Leiðrétta í: ...` takkann sem sér blokk á detail-síðu hlutarins.

Ný ákvörðun Stebba:

> Færum þetta inn í "Breyta" viðmót hlutarins. Setjum fyrir ofan "Hvað var lánað".

---

## Markmið

Færa `Leiðrétta í: Ég lánaði` / `Leiðrétta í: Ég fékk lánað` úr detail-síðunni
yfir í edit-síðu hlutarins.

Á edit-síðunni á controlið að birtast **fyrir ofan reitinn `Hvað var lánað?`**.

Detail-síðan á þá aftur að vera rólegt yfirlit:

- LoanCard
- Saga hlutarins
- Spjall inni í sögu

Ekki hafa role-switch control þar sem sér græna blokk milli LoanCard og sögu.

---

## Saga hlutarins - bæta við nýju hlutverki

Stebbi benti líka á að history-eventið er ekki nógu skýrt í dag:

```txt
Hlutverki breytt: Alquila hallarmál
Sunnudaginn 28. júní kl. 12:20
Framkvæmt af Stefán Halldór Jónsson
```

Það segir hver framkvæmdi breytinguna, en ekki í hvaða hlutverk var breytt.

Útfærsla þarf að bæta við skýringu í `Saga hlutarins`, þannig að eventið segi
nýja hlutverkið. Þetta á að hanga saman við actor-línuna
`Framkvæmt af {name}`.

Mælt orðalag:

```txt
Hlutverki breytt: Alquila hallarmál
Sunnudaginn 28. júní kl. 12:20
Framkvæmt af Stefán Halldór Jónsson
Nýtt hlutverk: lánveitandi
```

eða:

```txt
Nýtt hlutverk: lántaki
```

Nota frekar hlutlausu orðin `lánveitandi` / `lántaki` í history, ekki
`Ég lánaði` / `Ég fékk lánað`, því báðir aðilar geta séð sömu sögu og `Ég`
væri þá óljóst eða rangt frá sjónarhorni mótaðila.

Tæknilega þarf líklega:

- `switchLoanRole` í `lib/loans/actions.ts` að setja nýtt hlutverk í payload,
  t.d. `{ itemName, newRole: 'lender' | 'borrower' }`.
- Ef það er ekki hægt að leiða nýja hlutverkið örugglega án nýs SQL return
  fields, þá skal reyna fyrst að sækja nýja stöðu eftir successful RPC með
  núverandi RPCs (`get_my_loans` / pending fallback) frekar en að bæta strax við
  SQL65.
- Ef það reynist samt þurfa breytt RPC return contract, stoppa og skila
  sérstöku SQL65 plani til rýni áður en SQL er skrifað/keyrt.
- `lib/loans/history.server.ts` þarf að lesa nýja payload fieldið.
- `lib/recent-events/display.ts` eða history formatter þarf að búa til detail
  line fyrir `loan_role_switched`.
- `messages/is.json` og `messages/en.json` þurfa texta fyrir detail line og
  hlutverksheiti.
- Eldri `loan_role_switched` events án `newRole` mega áfram renderast án detail
  line; þau mega ekki brjóta history.

Prófun:

- Nýtt role-switch event birtir `Nýtt hlutverk: lánveitandi` eða
  `Nýtt hlutverk: lántaki`.
- Actor-línan er áfram til staðar.
- Eldri role-switch events án nýs payloads renderast án villu.

---

## Skrár sem líklega þarf að breyta

- `app/auth-mvp/lanad-og-skilad/[id]/page.tsx`
  - Fjarlægja `SwitchRoleButton` import og render.

- `app/auth-mvp/lanad-og-skilad/breyta/[id]/page.tsx`
  - Bæta við `SwitchRoleButton` import.
  - Rendera takkann í edit-flæðinu, fyrir ofan formið/reitinn `Hvað var lánað?`.
  - Þetta þarf að gilda bæði fyrir:
    - `LoanForm` branch þegar `canEdit` er true
    - `LoanItemDetailsForm` branch þegar `canEditItemDetails` er true en
      `canEdit` er false

- `components/loans/SwitchRoleButton.tsx`
  - Má líklega halda áfram að vera sér client component.
  - Ef styling lítur enn of mikið út eins og stór standalone blokk í edit,
    þétta hann frekar: lítil secondary action, ekki nýtt card.

- `lib/loans/actions.ts`
  - Uppfæra `loan_role_switched` payload þannig að nýja hlutverkið fylgi með
    þegar hægt er að ákvarða það örugglega.

- `lib/loans/history.server.ts`
  - Sýna nýtt hlutverk sem detail line á `loan_role_switched` event.

- `lib/recent-events/display.ts`
  - Ef detail-line helper á frekar heima þar, bæta við formatter/translation
    stuðningi þar í stað þess að hardcode-a í history server.

- `lib/__tests__/loan-pages.test.tsx`
  - Uppfæra test sem nú segir að detail page renderi `SwitchRoleButton`.
  - Bæta við eða breyta testum þannig að edit page renderi `SwitchRoleButton`.
  - Bæta við DOM order test: role switch kemur á undan edit forminu /
    `loan-item-details-form` eða `loan-form`, svo hann lendi fyrir ofan
    `Hvað var lánað?`.

Kannski:

- `messages/is.json`
- `messages/en.json`

Bæta þarf við texta fyrir history detail line ef slíkur texti er ekki þegar til.
Núverandi takkatexti `Leiðrétta í: ...` er samþykktur fyrir edit-aðgerðina.

---

## Mikilvæg varúð - pending recipient

Núverandi detail-síða getur sótt pending recipient fallback með
`get_loan_for_pending_recipient`. Edit-síðan gerir það ekki; hún notar bara
`get_my_loans` og `notFound()` ef hluturinn finnst ekki.

Áður en role-switch er fjarlægður alveg af detail-síðunni þarf Claude Code að
passa að #62 tapi ekki hegðun sem var sérstaklega hönnuð:

- Pending recipient má samkvæmt SQL63/SQL64 snúa hlutverki á opnu boði.
- Enginn nýr tölvupóstur á að fara út.
- Breytingin sést þegar notandi opnar hlutinn.

Ef pending recipient hefur enga leið inn í `Breyta` viðmót eftir þessa færslu,
þá erum við að fjarlægja UI-aðgang fyrir það tilfelli.

Tillaga Codex:

1. Fyrir actual parties: færa role switch alveg inn í edit-síðuna.
2. Fyrir pending recipients: ekki týna virkni. Velja eina af þessum leiðum:
   - bæta pending fallback við edit-síðuna og sýna þar takmarkað edit-viðmót með
     role-switch controlinu, eða
   - halda sérstakri mjög lágstemmdri leiðréttingaraðgerð í pending/ack samhengi
     ef edit-route er ekki réttur staður fyrir pending notanda.

Þar sem Stebbi sagði sérstaklega `Breyta` viðmót og `fyrir ofan "Hvað var lánað"`,
er fyrsta leiðin líklega hreinni ef hún er ekki of stór: edit-route getur sótt
pending item með sama RPC og detail page og sýnt role switch fyrir ofan item
upplýsingar. En ef það verður flóknara en ætlað er, stoppa og spyrja Stebba áður
en pending UX er fundið upp.

Ekki veikja access guard. Óviðkomandi notandi má áfram fá `notFound()`.

---

## Hönnun

Viðmið úr `Design.md`:

- Detail-síða á að vera róleg og app-leg, ekki safn af ótengdum action-blokkum.
- `LoanCard` er samþykkt mynstur fyrir lánaupplýsingar.
- Ekki setja kort inni í kort.
- Touch target minnst um 40x40 px.
- Enginn horizontal overflow á 360/390/460 px.
- Loading/error state má ekki valda miklu layout shift.

Útlitsstefna:

- `Leiðrétta í: ...` á ekki að líta út eins og primary action.
- Þetta er leiðrétting á skráningu, svo hún má vera secondary/quiet.
- Hún á að birtast fyrir ofan `Hvað var lánað?`, sem fyrsti edit-valkostur.
- Ekki bæta við stórri skýringarblokk eða marketing-texta.

---

## Prófanir sem Claude Code á að keyra

Keyra að lágmarki:

```bash
npm run test:run -- lib/__tests__/loan-pages.test.tsx
npm run test:run -- lib/__tests__/actions.test.ts
npm run test:run -- lib/__tests__/recent-read.test.ts
npm run type-check
```

Ef breytingin snertir shared form props, history formatter eða messages mikið:

```bash
npm run test:run
```

SQL þarf ekki að keyra aftur fyrir þessa UI tilfærslu.

---

## Localhost checks for Stebbi

Eftir að Claude Code hefur útfært og skilað:

1. Opna detail-síðu hlutar:
   `/auth-mvp/lanad-og-skilad/b48f0e6c-131a-449d-ac95-d731c9b97738`
2. Vænt niðurstaða:
   - `Leiðrétta í: ...` takkinn er ekki lengur milli LoanCard og sögu.
   - Detail-síðan sýnir LoanCard og `Saga hlutarins` án aukablokkar.
3. Smella á edit/pennann.
4. Vænt niðurstaða:
   - `Leiðrétta í: Ég lánaði` eða `Leiðrétta í: Ég fékk lánað` birtist í
     `Breyta` viðmótinu.
   - Takkinn er fyrir ofan reitinn `Hvað var lánað?`.
   - Formið er enn nothæft og vista hnappur virkar.
5. Smella á `Leiðrétta í: ...`.
6. Vænt niðurstaða:
   - hlutverkið snýst
   - síðan refreshast eða sýnir nýtt state án ruglings
   - `Saga hlutarins` fær eventið `Hlutverki breytt: {itemName}`
   - sama event sýnir líka nýtt hlutverk, t.d.
     `Nýtt hlutverk: lánveitandi` eða `Nýtt hlutverk: lántaki`
   - `Framkvæmt af {name}` birtist áfram
7. Prófa mobile breiddir 360, 390 og 460 px:
   - enginn horizontal overflow
   - enginn texti klippist
   - takkinn veldur ekki óþægilegu layout shift

Varúð:

- Raunverulegt click á role switch breytir gögnum og skrifar event.
- Ekki prófa með production mótaðilum nema Stebbi vilji það sérstaklega.
- SQL64 er þegar staðfest; þessi áfangi á ekki að breyta SQL eða keyra schema
  reload.

---

## Tillaga að næsta skrefi

Claude Code framkvæmi litla UI tilfærslu, uppfæri tests og skili stuttu handoffi
til Codex. Ef pending-recipient tilfellið reynist óljóst, stoppa þar og biðja
Stebba/Codex um ákvörðun áður en virkni er felld niður eða nýtt pending edit-UI
er hannað.
