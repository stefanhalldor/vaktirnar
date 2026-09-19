# Óháð planrýni: úrlausn findings og afmörkun A/B

Created: 2026-09-19 07:49
Timezone: Atlantic/Reykjavik

## Scope og uppruni

Þetta er plan-leiðrétting eftir Claude-rýni, ekki framkvæmdarleyfi eða runtime-PASS.
Canonical verkefnisskjal ræður product-scope. V004 er óbreytt saga; þessi viðbót
ræður við tæknilegt ósamræmi. Enginn app-kóði eða SQL hefur verið skrifaður/keyrður.

Áhætta HÁ: auth, einkagögn, concurrent fjárhagsfærslur og nýr gagnasamningur.
Óháð Claude-rýni var því réttlætanleg. Codex sendi afmarkaðan textapakka beint
í uppsett Claude Code CLI, án file-tools/MCP. Stebbi flutti engin skilaboð.
Source: 2da083f2ba5b059722dd93e9b7a13306ae4f94b9.
Session: a411c9a5-85d6-401d-ac7e-d550c2cf7ebc, claude-sonnet-4-6.
Fyrsta keyrsla: exit 0, is_error=false. Orðrétt svar er varðveitt í
`../evidence/2026-09-19-restaurant-review-initial.json`; það er aðskilið frá mati Codex hér.

## Mat Codex á findings

| Finding | Úrlausn í plani |
| --- | --- |
| A1 take-away gögn | Samþykkt sem framkvæmdarbil, þegar í A-scope v004. Fullur samningur hér að neðan; vöntun framtíðarkóða er ekki sjálfstæður galli í plani. |
| A2 einn matseðill | Samþykkt óákveðið menu-val. Fylkissvar Supabase er ekki sannað: fallið er scalar RETURNS jsonb. Tillögu um hæsta active_version milli ólíkra matseðla hafnað; version er ekki birtingarval. |
| A3 / B3 AI-háð auth | Samþykkt. Aðskilja session/auth frá kvittunar-AI án þess að sleppa öðrum heimildum. Flag eitt og sér veitir engan aðgang. |
| A4 preview | Samþykkt skýring: owner-only draft-preview, ekki public resolver á óbirt gögn. |
| B1 / B2 borð og staff | Þekkt bil, ekki ný uppgötvun. Nýr order-RPC og sér source-mapping eru skilyrði; engin fallback í gamla staff-flæðið. |
| B4 atomic batch | Samþykkt sem framkvæmdarkrafa; ein server transaction, ekki lykkja af client-köllum. |
| B5 núllverð | Samþykkt: initialClaimUnits=0 fyrir núllverð, provenance í source-mapping. |
| B6 einkadrög | Samþykkt; nákvæm client-geymsluregla hér fyrir neðan. |
| B7 tegundarval | Enn ósvarað product-val fyrir B. Hvorki þögn né rýni samþykkir það; hindrar ekki A-plan. |
| B8 capabilities | Samþykkt; afmarkaður allowlist og server-bann við ósamrýmanlegum legacy leiðum. |
| B9 hámark | Leiðrétt: núverandi ordinal-hámark er ekki loforð um 100 lifandi línur eða endurnýtingu eyddra slots. |

Orðalag Claude „SKILYRT FRAMKVÆMDARLEYFI“ er mat reviewers, ekki heimild frá Stebba.
Enginn reviewer getur veitt slíkt leyfi. Rýni lýkur með mati á plani, ekki á óskrifuðum kóða.

## Pakki A: nákvæmari framkvæmdartillaga

1. Nýr SQL-pakki, þegar framkvæmd er heimiluð, bætir boolean `takeaway_eligible`
   við item-gögn, NOT NULL DEFAULT false. False merkir að take-away sé ekki í boði
   í appinu; það sannar ekki að eigandi hafi metið gamla réttinn. Owner þarf að
   staðfesta true sérstaklega. Publish validation, persisted snapshot, strict
   contracts og versioned public projection flytja reitinn alla leið.
2. Venue hefur einn skýrt valinn birtan matseðil, tillaga `published_menu_id`, með
   database constraint sem tryggir að hann tilheyri sama venue. Birting velur hann
   atomically með revision-checki. Existing migration preflight greinir núll/einn/
   marga gilda birta matseðla. Aðeins ótvíræður einn má fá sjálfvirka tengingu;
   mörg gild menu krefjast explicit owner-vals áður en breytingin fer í release.
   Engin tilviljun, hæsta version eða hljóðleg lokun núverandi síðu. Public reader
   birtir aðeins valda active útgáfu virks venue og engin owner/private gögn.
3. Owner auth í A er óháð EXPENSE_RECEIPT_AI_ENABLED. Varðveita AUTH_MVP_ENABLED,
   RESTAURANTS_ENABLED, verified user/session, viðeigandi feature/role aðgang og
   exact business-profile/space/venue scope. Nota núverandi authority checks;
   hvorki client-id né feature-flag eitt og sér dugar. A breytir ekki generic Split auth.
4. Preview notar owner-only editor-draft með sameiginlegum renderer og validated
   view-model; public resolver opnar aldrei óbirt gögn. Ef saved-draft reader reynist
   nauðsynlegur þarf hann sömu owner-scope checks. Ekki bæta við DB draft-kerfi að óþörfu.
5. A sýnir stað og matseðil/take-away síu samkvæmt Design.md og v004. Engin virk
   pöntun/boð/submit fyrr en B er afhent. Engin ný upload-þjónusta eða raunmyndasöfnun.

A-checks ná sérstaklega AI-flag off með gildum owner, röngu role/profile, óstaðfestum
notanda, cross-venue menu-id, tveimur birtum menu, samtímis publish, preview/private
projection og gömlum/nýjum payload. Migration readiness er raunverulegt release-gate,
ekki forsenda þess að plan-rýni geti lokið. Stebbi keyrir SQL.

## Pakki B: samningskröfur áður en framkvæmd er heimiluð

- Nýr table-free order-create/confirm samningur. Ekki nota núverandi
  restaurant_submit_menu_item_v1 eða client-loop til að framkvæma batch.
  Endurnýta fjárhagsreglur public.receipt_split_participant_add_item_v1 þar sem þær
  henta í einni transaction; skoða nákvæmlega version/lock/idempotency áður en SQL er skrifað.
- Order, backing Split, active creator og request-id tengjast atomically við stofnun.
  Confirm læsir order/split í fastri röð, sannreynir bæði expected revisions og
  immutable request/payload, og skrifar allt batch eða ekkert. Engin partial-success
  fallback. Replay sannreynir núverandi aðgang áður en einkaniðurstöðu er skilað.
- Aðskilin order-line/source mapping með RLS tengir actor og Split-línu; hvorki
  restaurant_split_items né preorder_visits fá MVP-val. Ekki breyta staff/forecast
  lestri til að reyna að fela gögn sem voru skrifuð á rangan stað.
- Núllverðslína notar initialClaimUnits=0, provenance óháð claim. Já/nei take-away
  staðfesting og order-mode breyting eru í sömu transaction og nýjar línur.
- Núverandi hámark er 100 ordinal-slots. Preflight reiknar remaining slots fyrir
  allt batch; cancellation veitir ekki sjálfkrafa nýtt slot. Ekki lofa „100 lifandi
  línum“ eða breyta canonical ordinal-reglum í þessum pakka. Prófa eyðingu og retry
  við mörkin, ekki aðeins 100/101 núlifandi línur.
- Einkadrög: bounded sessionStorage með útgáfusettri validated skemu og namespace
  actor/order (eða anonymous draft nonce)/venue/menu/version. UI endurstillir state
  áður en nýr actor/order hydratar; logout/account-switch hreinsar gamla namespace.
  Anonymous val flyst aðeins með explicit adoption og nýrri server validation.
  Storage-failure notar tímabundið memory-state með sýnilegri viðvörun. Geyma aðeins
  eigin item-val/magn, engin boð, tokens, hópgögn eða claims. Þetta er app-einangrun,
  ekki vörn gegn öðrum sem hafa aðgang að browser-profile/devtools. Ekki DB draft-kerfi.
- Shared Splitt adapter fær aðeins validated view/summary og active-participant
  eigin claim-aðgerðir samkvæmt canonical reglum; order confirm/correct/cancel
  fara í order-adapter. Capabilities eru server-derived. Generic receipt-import,
  extraction/review, myndasending/eyðing, split-delete og almenn share-token/join
  leið eru ekki heimildir order-samhengisins. Server þarf að verja ALLA legacy
  innganga fyrir order-mapped Split, ekki aðeins fela controls í nýja viðmótinu.
  Order-boð/samþykki eru eina nýja aðgangsleiðin; generic token má ekki sniðganga hana.
- B-auth er óháð receipt-AI en heldur session, verified user, feature-gates og
  exact active membership. Source-feature eða vinaval veitir engan destination-aðgang.
- Óákveðið product-val: sjálfgefin tegund, hver má skipta um tegund, sjálfvirk
  bakfærsla þegar síðasti non-take-away réttur hverfur og mörk draft/staðfestingar.
  V004 tillögur eru enn tillögur. Þessar ákvarðanir þarf fyrir B-framkvæmd;
  þær stöðva hvorki A-planrýni né heimilaða óháða vinnu.

B þarf enn exact schema/RPC signatures, lock/revision matrix og capability-entrypoint
inventory fyrir framkvæmdarafhendingu. Ekki kalla þennan afmarkaða planrýnihring
fullbúið B-framkvæmdarplan. Ný runtime/SQL vinna þarfnast scoped eigandaheimildar.

## Verification og handoff

Codex tók við raunverulegum findings, mat þau sjálfstætt og sendir uppfærða canonical
skrá og þetta v005 til sama reviewers. Lokasvar varðveitist í evidence ásamt exact
SHA256 á rýndum skrám. Enginn manual copy/paste milliliður þarf í þeim hring.
V004/mobile wireframe er óbreytt; Design.md tokens, 16px inputs, 40px targets,
canonical loading/pending, people-picker og is/en textar eru áfram viðmið.
Route intelligence check: á ekki við, engin leiða-/veðurgögn.

Breyttar verkefnisskrár: canonical Markdown og þetta nýja v005; evidence bætist við.
AGENTS.md og repository WORKFLOW.md voru fyrir dirty og eru ekki hluti breytingarinnar.
Sameiginlegur Documents/WORKFLOW.md v22 er sérstaklega yfirfarin workflow-breyting.
GoLive var lesið (HTTP 200), ekki uppfært í þessum rýnihring.

## Localhost checks for Stebbi

LOCALHOST_NOT_APPLICABLE fyrir þessi skjöl; ekkert nýtt UI og enginn server ræstur.
Fyrir A afhendingu: approved test owner og annar owner, birtur og óbirtur matseðill,
AI-flag off, logged-out /matseðill/<venueSlug>, take-away af/á, preview/publish/refresh,
stale revision og 360/390/460px keyboard/pending samkvæmt v004. Vænt: aðeins réttur
owner getur birt, public sér eingöngu valið birt efni, engin virk B-submit aðgerð.
Fyrir B bætast canonical multi-user og claims-próf við ásamt gömlu Split endpoints,
logout/account/order skiptingu, zero-price og ordinal-mörkum. Engin staff-afhending.
Localhost getur tengst production. Nota aðeins heimiluð prófgögn; ekki senda raunboð,
breyta raunmatseðli/claims eða keyra SQL vegna þessarar skjalaafhendingar.
