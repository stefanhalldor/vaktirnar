# SQL186 exact og localhost-gátt

Date: 2026-09-16 19:10
Timezone: Atlantic/Reykjavik
Writer: Codex
Task: expense-receipt-item-claims
GoLive follow-up: `fa8b49d9-3d10-4e1c-977d-4454d86b36a5`

## Plan áfangans

Skrá actual exact postflight, loka SQL186-gáttinni og færa candidate í innskráða
localhost-prófun Stebba.

## Hvað var raunverulega gert

- Actual postflight frá Stebba skilaði `EXACT_INSTALLED`.
- `table_ok`, `functions_ok`, `private_function_ok`, `constraints_ok`, `read_ok`
  og `trigger_ok` voru öll `true`.
- Öll þrjú SQL-artifacts voru endurhash-uð og eru óbreytt.
- SQL186-gáttinni er lokað; engin frekari SQL-keyrsla er nauðsynleg.
- GoLive-undirliðurinn var uppfærður með exact stöðu og localhost-gáttinni.

## Skrár sem voru skoðaðar

- Actual postflight-röð Stebba
- SQL186 migration, preflight og postflight
- Canonical verkefnalýsing og v058

## Skrár sem voru breyttar

- Canonical verkefnalýsing
- Þetta handoff

## Skipanir og niðurstöður

- Postflight actual: `EXACT_INSTALLED`, sex af sex booleans `true`.
- SHA-256 migration:
  `308D3DE6C04EB62E75BB52B735931CBA431961303606F81200DB6745FB1155B3`
- SHA-256 preflight:
  `C5139071BA65D19504D26F9C94B18AA5459832EE2270E889A767C2CA5FF88FA3`
- SHA-256 postflight:
  `956CA0DD0987A8FBBDEC1436BEAEBFB048FD3F686EA370F9B16CB3E3EA1C8379`
- GoLive update: HTTP 200, exit 0.

## Hvað mistókst eða var sleppt

Ekkert mistókst. Codex keyrði ekkert SQL og ræsti ekki localhost. Commit, push
og deploy voru ekki framkvæmd.

## Ákvarðanir

Exact catalog-state lokar SQL186-gáttinni. Candidate fer nú í sjónræna og
innskráða localhost-prófun áður en release er undirbúið.

## Áhætta sem er enn til staðar

Sjálfvirk próf og build eru græn en actual multi-user browser-flæði hefur ekki
verið sannreynt: login-return, QR milli tækja, persónulegt dismissal, síur og
samtímis claim-aðgerðir þurfa localhost evidence.

## Næsta skref og workflow-stopp

Stebbi keyrir candidate á sínum núverandi localhost-server og prófar checklist
hér fyrir neðan. Engin migration, postflight eða önnur SQL-skrá skal keyrð aftur.

## Spurningar fyrir rýni

Skrá actual frávik í UI, auth-return, mobile layout eða multi-user state. Ef allt
stenst fer candidate í loka release-rýni, commit/push/deploy aðeins með sérleyfi.

## Supabase-áhrif

SQL186 er exact uppsett samkvæmt actual catalog-only postflight. Private tafla
hefur forced RLS, public functions eru service-only, private trigger-function
er ekki client-executable og vænt constraints/read projection/trigger eru til.
Migrationin breytti engum fyrirliggjandi röðum.

## Breytingar á verkefnalýsingu

Current gate var fært úr postflight yfir í localhost-prófun. Engin product-krafa
eða implementation breyttist.

## Localhost checks for Stebbi

Notaðu candidate-möppuna sem er skráð í canonical verkefnalýsingu og þinn eigin
dev server. Prófaðu aðeins synthetic/eigin reikning og tvo samþykkjandi notendur:

1. Eigandi opnar sharing-splitt og sér reikningsheiti, dagsetningu, skýringar,
   Útistandandi/Afgreitt pillur og afritanlegan hlekk.
2. Opna hlekkinn óinnskráður: sama reikningsheiti og þátttökuspurning eiga að
   sjást. Veldu Já, skráðu inn og staðfestu sjálfvirka endurkomu í rétta splittið.
3. Fara aftur á `/auth-mvp/splitta-reikningnum`: þátttökureikningurinn á að
   sjást með heiti og dagsetningu og opnast án gamla hlekksins.
4. Láta báða notendur taka sama lið. Sía á annan og staðfesta að liðurinn og
   nöfn/magn beggja meðeigenda sjáist.
5. Undir „Annað magn“ vista `1/7`, síðan `10%`, síðan venjulegan fjölda. UI á
   að sýna normaliserað hlutfall og magn án faldinnar námundunar.
6. Prófa „Ég tek restina“. Prófa „Ekki mitt“ hjá öðrum notanda: liður hverfur
   aðeins úr hans aðallista og birtist í hans neðstu skúffu meðan útistandandi.
7. Ljúka lið og sjá hann undir Afgreitt; skila magni og sjá hann aftur undir
   Útistandandi.
8. Sýna QR og skanna með öðru tæki. Hann á að opna sama þátttökuskjá. Ekki deila
   skjámynd af virkum QR opinberlega því hlekkurinn er bearer-aðgangur.
9. Opna gengisreikni, velja ISK og slá `150` fyrir EUR. Bera saman heild,
   skráða liði og útistandandi. Reikningurinn sjálfur má ekki breytast og gengið
   á ekki að lifa endurhleðslu.
10. Prófa 360px og 390px breidd: enginn zoom, overflow, overlap eða dauður
    navigation/pending-state.

Ekki nota viðkvæma kvittun, keyra gjaldfært provider-kall eða prófa með
óviðkomandi production-notendum.

## Óvissa / þarf að staðfesta

Actual localhost multi-user og mobile upplifun er eina opna release-gáttin.
