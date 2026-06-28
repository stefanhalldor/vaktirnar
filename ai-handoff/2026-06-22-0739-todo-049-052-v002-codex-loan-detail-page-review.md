# Rýni: Loan detail page, smellanlegt spjald og djúptenglar

**Handoff:** Codex → Stebbi og Claude Code  
**Dagsetning:** 2026-06-22 07:39  
**Rýnir skrá:** `2026-06-22-0734-todo-051-v001-claude-loan-detail-page-handoff.md`  
**Rétt TODO-tenging:** #49 Tengsl og sameiginleg virkni, #52 Lánaboð birtist í Ólesið og opnast beint

## Findings

### High: Claude-skráin er merkt röngu TODO-númeri

Claude-skráin vísar í `#51`, en `#51` er Facebook-tenging við prófíl. Loan-detail/djúptengillinn tengist ekki Facebook. Rétt samhengi er:

- `#49` vegna Tengsl-detail þar sem “Opna lán” á að opna rétt lán.
- `#52` vegna Ólesið/lánaboða þar sem notandi á síðar að geta smellt beint á hlutinn.

Næsta Claude Code skrá og framkvæmd ætti ekki að nota `todo-051` fyrir þetta mál. Það myndi rugla stöðusögu verkefnisins og gera seinni rýni óþarflega óskýra.

### High: Ný ákvörðun Stebba breytir útfærslunni

Stebbi vill ekki halda núverandi edit-tákni á listaspjaldinu. Stebbi vill:

- henda núverandi edit-tákni af listaspjaldinu,
- gera allt spjaldið smellanlegt,
- láta smell á spjaldið opna nýju detail-síðu lánsins.

Þetta þýðir að tillaga Claude Code um að gera bara `item_name` að `<Link>` er of lítil og ekki lengur rétt varahegðun.

Mikilvægt: ef allt spjaldið verður smellanlegt má ekki vefja núverandi `LoanCard` í `<Link>` óbreytt. Núverandi `LoanCard` inniheldur marga hnappa og linka, t.d. merkja skilað, eyða, senda boð, afturkalla boð, þekki málið, bæta við aðila og edit-link. Það má ekki búa til nested interactive elements.

Öruggasta v1 leiðin er:

1. Halda núverandi action-útgáfu spjaldsins fyrir detail-síðuna.
2. Búa til sérstakt listaspjald, t.d. `LoanSummaryCard`, sem er eitt smellanlegt `<Link>` og inniheldur engin action buttons og ekkert edit-tákn.
3. Láta `LoanList` nota `LoanSummaryCard`.
4. Láta nýju detail-síðuna nota action-spjaldið eða sambærilega detail-útgáfu með öllum aðgerðum.

Þetta er hreinna en að setja `onClick` á núverandi spjald og reyna að stoppa propagation á öllum innri hnöppum.

### Medium: Detail-síðan má nota `get_my_loans`, en ekki sækja beint úr `loan_items`

Claude Code leggur til að detail-síðan noti:

```ts
getAdmin().rpc('get_my_loans', { p_actor_id: user.id })
```

og finni svo rétta lánið í niðurstöðunni. Það er í lagi fyrir v1 og passar við núverandi authorization boundary. Ekki sækja beint úr `loan_items` fyrir þessa síðu nema sérstök RPC/SQL-aðgangsregla sé hönnuð og rýnd sérstaklega.

Ef ID finnst ekki í `get_my_loans` á að nota `notFound()`, ekki 403, svo ekki leki hvort lán sé til.

### Medium: Detail-síðan þarf að hugsa um eyðingu

Ef detail-síðan notar núverandi `LoanCard` með `deleteLoan`, þá getur notandi eytt láninu á detail-síðunni. Núverandi `LoanCard` virðist ekki redirecta eftir eyðingu; á lista hverfur hluturinn við refresh/revalidation, en á detail-síðu gæti notandi setið eftir á síðu fyrir hlut sem er nýbúið að eyða.

Claude Code þarf að velja eina skýra lausn:

- annaðhvort redirecta á `/auth-mvp/lanad-og-skilad` eftir successful delete á detail-síðu,
- eða sleppa delete-action af detail-síðu þar til redirect-hegðun er komin,
- eða gera action-spjaldið með optional `afterDeleteHref`.

Ekki skilja þetta eftir sem óljóst edge case.

### Medium: Tengsl-linkurinn þarf sér próf

Claude-skráin segir að tengsl-deep-link breytingin þurfi ekki sér próf. Codex er ósammála. Þetta er nákvæmlega regressionin sem Stebbi sá:

```tsx
href={`/auth-mvp/lanad-og-skilad?id=${src.id}`}
```

á að verða:

```tsx
href={`/auth-mvp/lanad-og-skilad/${src.id}`}
```

Það þarf að vera próf sem grípur þetta, annaðhvort á Tengsl-detail renderinu eða í einangruðu helper/prófi ef Claude Code dregur linkamyndun út.

### Medium: Þetta leysir ekki allt #52 eitt og sér

Ný detail-síða er góður grunnur fyrir #52, en #52 snýst líka um að lánaboð birtist í `Ólesið` og að notandi geti opnað hlutinn beint þaðan. Það þarf síðar að tryggja að event/payload/viewHref í Ólesið vísi á:

```txt
/auth-mvp/lanad-og-skilad/[id]
```

Ekki loka #52 fyrr en Ólesið-flæðið sjálft hefur verið tengt og prófað.

### Low: `backToList` virðist þegar vera til

Claude Code bendir á að bæta þurfi við `backToList` ef lykillinn vantar. Codex sá að hann virðist þegar vera til í `messages/is.json` og `messages/en.json`. Ekki bæta við nýjum skilaboðalykli nema textinn eigi að breytast.

## Mælt framkvæmdarplan fyrir Claude Code

1. Búa til `/auth-mvp/lanad-og-skilad/[id]/page.tsx`.
   - Nota `guardLoanAccess()`.
   - Nota `get_my_loans` með `p_actor_id: user.id`.
   - Finna `id` í niðurstöðum.
   - `notFound()` ef lánið finnst ekki.
   - Engin SQL-breyting.

2. Aðgreina listaspjald og detail-spjald.
   - Mælt: nýtt `LoanSummaryCard` fyrir lista.
   - `LoanSummaryCard` má vera eitt `<Link>` utan um allt spjaldið.
   - Engir action buttons inni í `LoanSummaryCard`.
   - Enginn edit-pencil á listaspjaldi.
   - Detail-síðan heldur aðgerðum: breyta, merkja skilað, eyða, boð, þekki málið o.s.frv.

3. Uppfæra `LoanList`.
   - Nota summary-spjald í stað action-spjalds.
   - Passa að leit, síun og röðun haldist óbreytt.

4. Uppfæra Tengsl-detail.
   - Breyta “Opna lán” úr query-param tengli yfir í path-tengil:
     `/auth-mvp/lanad-og-skilad/${src.id}`.

5. Prófanir.
   - Detail-síða sýnir rétt lán.
   - Detail-síða skilar 404 ef lánið er ekki í `get_my_loans`.
   - Load-villa sýnir `errors.loadFailed`.
   - `LoanList` renderar smellanlegt spjald án edit-tákns.
   - Tengsl-detail býr til réttan deep link.
   - Pending invitation row sem kemur úr `get_my_loans` opnast á detail-síðu.

## Supabase, auth, RLS og gögn

Engin SQL migration ætti að vera nauðsynleg fyrir þennan áfanga. Claude Code á ekki að breyta RLS, policies, grants eða functions fyrir þetta nema ný áhætta komi í ljós og Stebbi samþykki sérstaklega.

Öryggismörkin eiga að vera:

- `guardLoanAccess()` fyrir lána-detail.
- `get_my_loans` sem eina gagnasóknin fyrir lán sem notandi má sjá.
- `notFound()` fyrir óaðgengilegt lán.
- Engin bein client-side eða server-side select úr `loan_items` án rýnds authorization boundary.

## Localhost checks for Stebbi

1. Opna `/auth-mvp/lanad-og-skilad`.
   - Vænt: listinn sýnir lána-spjöld.
   - Vænt: edit-pencil er horfið af listaspjöldum.
   - Vænt: allt spjaldið er smellanlegt, ekki bara titillinn.
   - Vænt: smellur á spjald fer á `/auth-mvp/lanad-og-skilad/[id]`.

2. Á detail-síðu láns.
   - Vænt: rétt heiti, dagsetningar, staða og mótaðili birtast.
   - Vænt: aðgerðir sem voru áður á listaspjaldi eru aðgengilegar þar sem þær eiga heima.
   - Prófa sérstaklega “Merkja sem skilað” og “Afturkalla” ef við á.

3. Prófa edit-flæði.
   - Vænt: hægt sé að komast í breytingar frá detail-síðu, en ekki með pencil á listaspjaldinu.
   - Vænt: breyting á heiti/nótu birtist eftir vistun.

4. Prófa eyðingu ef hún er sýnileg á detail-síðu.
   - Vænt: eftir eyðingu lendir Stebbi ekki fastur á detail-síðu fyrir eytt lán.
   - Best vænt niðurstaða: redirect til `/auth-mvp/lanad-og-skilad` eða skýr staðfest staða.

5. Opna Tengsl-detail og smella “Opna lán”.
   - Vænt: tengill fer beint á `/auth-mvp/lanad-og-skilad/[id]`.
   - Vænt: ekki lengur `/auth-mvp/lanad-og-skilad?id=...`.

6. Prófa rangt eða óaðgengilegt ID.
   - Opna `/auth-mvp/lanad-og-skilad/fake-id`.
   - Vænt: 404.
   - Skrá inn sem annar notandi og reyna URL á lán sem sá notandi á ekki að sjá.
   - Vænt: 404, ekki gagnaleki.

7. Prófa pending lánaboð.
   - Búa til eða nota lánaboð sem bíður samþykkis.
   - Opna spjaldið úr `/auth-mvp/lanad-og-skilad`.
   - Vænt: detail-síða sýnir réttan hlut og “Þekki málið” virkar þar ef notandinn á að geta staðfest.

Ekki keyra SQL eða prófa production-gögn fyrir þetta án sérstakrar beiðni frá Stebba.
