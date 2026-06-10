# Nýlegt — Endurskilgreining sem atburðaskráning (design review)

## Bakgrunnur

`Nýlegt` á `/auth-mvp/heim` var upphaflega útfært sem listi yfir nýlegar
lánayfirfærslur (loan items). Stebbi hefur bent á að þetta sé of þröngt:
`Nýlegt` á að vera **atburðaskrá þvert á allar Teskeiðar** — ekki bara
lánafærslur.

Þetta er stór upprifjun á hugmyndinni. Codex ætti að skoða þetta vel áður
en útfærsla hefst.

## Núverandi útfærsla (eftir TODO #19)

`Nýlegt` sýnir nú allt að 3 **lánahluti** sem eru ólesdir:

- Gögn koma úr `get_my_loans` RPC
- Lesastaða geymd í `loan_recent_read_state (user_id, loan_id, read_key)`
- `read_key` = SHA-256 hash á lykilsvæðum lánsins (breytist þegar staða breytist)
- Notandi smellir `Lesið` → server action `markRecentLoansRead` geymir lykil
- Hlutir sem eru lesdir koma ekki aftur upp nema staða þeirra breytist

Vandinn: eyðing lán, boð, breytingar á öðrum Teskeiðum, o.s.frv. skila
engu í `Nýlegt`. Það er einfaldlega ekki hannað fyrir það.

## Ný sýn: Nýlegt sem atburðaskrá

`Nýlegt` ætti að vera **feed af atburðum** sem hafa átt sér stað og notandi
hefur ekki staðfest að hann hafi séð. Dæmi um atburði:

**Lánað og skilað:**
- Búinn til lán
- Hlutur skilað / skilað afturkallað
- Boð sent / boð móttekið
- Boð samþykkt / hafnað

**Framtíðar Teskeiðar:**
- Póstflóðið: ný skilaboð / breytingar
- Útlagt og endurgreitt: ný kostnaðarfærsla
- o.s.frv.

## Kjarnaáhrif á núverandi útfærslu

Þrjár leiðir eru mögulegar. Codex ætti að meta þær og gera tillögu.

### Leið A — Sérstakur events-tafla í DB

Búa til `recent_events (id, user_id, event_type, payload jsonb, occurred_at, ack_at)`.

Mutations skrifa atburð í töfluna. `Nýlegt` les nýjustu óstaðfest atburði.
`Lesið` setur `ack_at` á allt sem var sýnt.

**Kostir:**
- Hrein aðskilnaður: atburðaskrá er ekki bundin við ákveðin gögn
- Auðvelt að bæta við nýjum atburðategundum frá öðrum Teskeiðum
- Atburðarnar geyma snapshot af samhengi á þeim tíma (item_name o.s.frv.)
- Eyðing lán eyðir ekki atburðinum (notandi sér "þú eyddir X")

**Gallar:**
- Ný tafla + payload schema
- Mutations verða að skrifa í tvær töflur (eða RPC gerir það)
- Payload schema þarf að vera vel skilgreint frá upphafi

### Leið B — Reikna atburði úr gögnum (computed feed)

Halda núverandi `loan_recent_read_state`. Bæta við fleiri read-state töflum
eftir þörfum (t.d. `invitation_recent_read_state`). `Nýlegt` sameinar
margar fyrirspurnir.

**Kostir:**
- Engar breytingar á mutations
- Lesastaða er alltaf í takt við raunveruleg gögn

**Gallar:**
- Erfitt að víkka yfir í aðrar Teskeiðar (sérstök tafla fyrir hverja)
- Getur ekki sýnt "þú eyddir X" — eyðing hverfur úr gögnum
- Flóknara að raða mismunandi gerðum atburða í eina feed

### Leið C — Hybrid: events-tafla en reiknaðar lesastöður

Atburðir skráðir í `recent_events`. Lesastaða er hægt að geyma annaðhvort
per-event eða sem "síðast lesið á tímapunkti X" per notanda. Einfaldari
read-state en leið A.

## Spurningar sem Codex þarf að svara

1. **Leið?** Hvaða leið mælir Codex með og hvers vegna?

2. **Migration á núverandi gögnum?** Við höfum `loan_recent_read_state` úr
   TODO #19. Ætti hún að lifa áfram, breytast eða hverfa?

3. **Atburðaskráning við mutations?** Ef Leið A/C er valin: á það að gerast
   í server action, í RPC, eða í trigger í DB?

4. **Payload schema?** Hvað þarf að vera í `payload` til að `Nýlegt` geti
   sýnt viðeigandi texta án þess að sækja gögn aftur?

5. **Raðning?** Atburðir raðaðir eftir `occurred_at DESC`. Hvernig þegar
   tvær Teskeiðar senda atburði á sama sekúnduna?

6. **Takmark?** Hversu margir atburðir eru sýndir? 3 eins og núna, eða
   fleiri þar sem notandi getur scrollað?

7. **Framtíðar Teskeiðar?** Hvernig tengist nýr Teskeið (t.d. póstflóðið)
   við þessa innviði þegar hann er útfærður?

8. **Lesið-virkni?** Á `Lesið` að staðfesta alla sýnilega atburði eða
   einstaka? Á hún að vera per-Teskeið eða global?

9. **Scope á þessari lotu?** Stebbi vill ekki óendanlega stóra útfærslu.
   Hvað er lágmarks-scope sem gefur raunverulegt gildi án þess að brjóta
   það sem er þegar komið?

## Núverandi staða sem breytist ekki hér

Eftirfarandi er óbreytt nema Codex mæli sérstaklega með öðru:

- `loan_recent_read_state` taflan (migration 45) er til staðar í DB
- `markRecentLoansRead` server action í `app/auth-mvp/heim/actions.ts`
- `RecentSection` client component
- `revalidateLoanViews()` hjálparfall í `lib/loans/actions.ts`

## Takmörk á þessari handoff

- Engar breytingar á kóða - einungis design review
- Codex á ekki að skrifa útfærslukóða hér, bara gera skýra tillögu
- SQL má stinga upp á en má EKKI keyra - Stebbi keyrir allar SQL migrations

## Output sem óskað er eftir

Codex svarar þessum spurningum og skrifar:

1. Mælt með leið (A, B eða C) með rökstuðningi
2. Yfirlit yfir hvaða töflur/breytingar þarf
3. Lágmarks-scope tillaga fyrir fyrstu lotu
4. Hvað þarf EKKI að gera í fyrstu lotu
5. Þrjár stærstu áhættur sem þarf að hafa í huga
