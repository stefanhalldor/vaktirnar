# Manual AI import og loading — localhost user-test gate

## Mannamálsniðurstaða

`Splitta reikningnum` býður nú tvær skýrar leiðir eftir að mynd er valin.
Notandi getur látið Teskeið reyna innbyggða myndgreiningu einu sinni eða farið
strax í ChatGPT eða annað myndhæft gervigreindarapp. Seinni leiðin gerir ekkert
Anthropic-kall frá Teskeið og færir þannig myndgreiningarkostnaðinn yfir á app
sem notandinn notar sjálfur.

Myndin er fyrst vistuð í private receipt storage og síðan opnast varanleg drög.
Þar er fyrirspurn sem má afrita með einum smelli og reitur fyrir allt svarið.
Fyrirspurnin biður gervigreindina um nákvæmlega eina `json` kóðablokk og engan
annan texta, svo copy-hnappur viðkomandi apps geti afritað allt svarið í einu.
Teskeið samþykkir raw JSON eða nákvæmlega eina slíka kóðablokk, sannreynir alla
reiti og hafnar aukatexta, aukareitum og ógildum upphæðum.

Enginn varanlegur einn-kvittun-á-dag kvóti var settur í þennan candidate. Slíkt
þarf atomic, actor-scoped og endurræsingarþolinn talningarsamning. Núverandi
afmörkun lágmarkar kostnað strax: manual-first gerir núll provider-köll,
innbyggða leiðin gerir eitt kall án sjálfvirkra retries og sýnilegt retry er
ekki í flæðinu.

## Hvað breyttist

- Upload sýnir aðskilin status-skref fyrir undirbúning, private upload,
  myndlestur og opnun draganna; controls eru disabled meðan beðið er.
- `Nota ChatGPT eða annað app` vistar myndina og opnar actor-owned drög án þess
  að kalla á Anthropic.
- Misheppnuð innbyggð greining opnar sömu varanlegu manual leið í stað þess að
  skilja notandann eftir í tímabundnu client state.
- Manual promptið er eitt afritanlegt block og krefst fulls JSON-svars með
  magni í þúsundustu hlutum og upphæðum í minor units.
- Serverinn endurbindur authenticated actor, upload, storage path og SHA-256,
  sækir private myndina og sannreynir MIME, stærð og hash áður en strict
  extracted gögn eru sett í drög.
- Mynd varðveitist áfram þar til owner eyðir myndinni eða split-reikningnum.

## Öryggi, privacy og kostnaður

- Manual-first sendir hvorki mynd né límdan texta til Anthropic.
- Browser velur ekki actor, upload ID, storage path eða hash sem authority.
- Engin provider response, raw villa eða receipt texti fer í logs.
- Built-in Anthropic adapter notar `maxRetries: 0` og 90 sekúndna timeout.
- Engin SQL var keyrð og engin Production gögn, grants, RLS eða schema breyttust.
- `.env.local` er ignored; secret-gildi voru hvorki lesin né birt.

## Gates

- Markviss receipt/manual/loading próf: **6 files, 46/46 GREEN**.
- Expense test scope: **135 files, 1.378/1.378 GREEN**.
- Type check (`tsc --noEmit`): **GREEN**.
- Production build: **GREEN**, 151 routes; standalone root og detail routes eru
  í build manifesti. Aðeins eldri lint warnings utan þessa breytingar birtust.
- Full Vitest suite: **544 files og 7.862 tests GREEN**. Fjögur þekkt booking
  date-fixture próf eru RED og eitt release-artifact suite vantar ignored
  `.tmp/phase2-road-source/official-source.json`; bæði eru staðfest baseline
  utan receipt candidate.
- `git diff --check` og cached check: **GREEN** fyrir candidate.
- SQL179 static/contract assertions: **GREEN**. Production apply bytes eru
  óbreytt, SHA-256
  `60d28a571b56e41aed42fe9369fbf99f13d22fdf6cd05975bbe02aa37efe617c`.
- `package.json` og `package-lock.json`: enginn semantic diff.
- Exact semantic scope fyrir þetta task fyrir provenance handoffið: 25 tracked
  og 36 untracked task paths; engin build output, credentials eða `.env` skrá
  er í scope.
- Gamla aðalvinnumappan er varðveitt: HEAD
  `7fdabefbbc51d2fc5d7574c71e7446fa0cc88238`, 111 status paths og ekkert staged.

## Óháð lokarýni

Fersk exact-byte rýni varð **GREEN án findings**. Rýnin staðfesti sérstaklega:

- manual-first snýr við áður en provider finalization er kallað;
- báðar fallback-leiðir lifa navigation og refresh;
- strict parserinn hefur ekki verið veiktur;
- actor, upload/path og private object bytes eru server-authoritative;
- loading, clipboard og mobile 16px/wrap contracts eru varðveitt;
- prófin sanna raunverulega navigation, zero-provider manual path og
  security-validation.

## Final SHA-256 fyrir breytt fallback/runtime yfirborð

- `ExpenseReceiptUpload.tsx`:
  `913f563312d19c4fe55ab1c80f28e40f6051a1377e9bc05d534466b181a46aed`
- `ExpenseReceiptManualImport.tsx`:
  `a0a6249acc2515c9c703a0e12d78cc84abf1b7d230373f4dddec5dde95c6dfda`
- `ExpenseReceiptSplitPanel.tsx`:
  `1331fb604024b30f485ee72c7acab2692ee9bdcd3ad587107e8ca14ea9641ff2`
- `receipt-actions.ts`:
  `792020e2ee6dc6117b227b8ec051d3a87e1c87de9ae3d455a082804eb3761a14`
- `receipt-split.server.ts`:
  `b27c72afda1b2901967313dca1c1add6205c758ec8db514d6fec059700775899`
- `receipt-split.ts`:
  `1624b04bc597646698c95aad108895109f698f8aff14b915a0ffca67f6052ce9`
- `messages/is.json`:
  `3bea163b90d20069417cd7a7be551e0326f82125a7995f563169cc2f83e9b3a0`
- `messages/en.json`:
  `683821d0a4f93f0ff3a0d2ec576e97edc99449f947da03b038604fa6ca2c6f78`

## Localhost checks for Stebbi

Dev serverinn er áfram undir stjórn Stebba. Með exact candidate í gangi á
porti 3004:

1. Opnaðu
   `http://localhost:3004/auth-mvp/splitta-reikningnum` og veldu kvittunarmynd.
2. Veldu **Nota ChatGPT eða annað app**. Staðfestu að skýrt loading feedback
   birtist fyrir undirbúning, upload og opnun, og að síðan fari svo í varanleg
   drög með kvittunarmyndinni.
3. Ýttu á **Afrita fyrirspurn**. Límdu hana ásamt myndinni í ChatGPT eða annað
   myndhæft app. Svarið á að vera ein `json` kóðablokk sem hægt er að afrita í
   heilu lagi með einum smelli í viðkomandi appi.
4. Afritaðu alla kóðablokkina, límdu hana í Teskeið og veldu að búa til drög.
5. Staðfestu að liðirnir birtist í sömu röð, að aðskildar línur með sama heiti
   hafi ekki verið sameinaðar, að magn megi vera brot og að prentuð samtala sé
   rétt. Fyrir kvittunina sem sýnd var er vænt samtala **1.663,00 EUR**.
6. Endurhlaðið detail-síðuna einu sinni og staðfestu að manual-flæðið og myndin
   séu enn til staðar.

Stoppaðu prófið þar. Ekki deila, staðfesta endanlega fjárhagsskiptingu, eyða
myndinni eða keyra SQL í þessu gate. Ekki senda kvittunarmynd, JSON eða nöfn
þátttakenda í handoff; stutt `GREEN` eða nákvæm villulýsing nægir.

## Næsta skref

STOP við localhost user-test gate. Eftir GREEN þarf sérstakt release-umboð áður
en commit, push eða deploy fer fram.
