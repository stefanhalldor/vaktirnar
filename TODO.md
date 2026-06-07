# TODO

#1
Búa til lendingarsíðu fyrir notanda
Já, þetta er gott næsta verkefni eftir að lánaflæðið er klárað og rýnt, svo tveir agentar séu ekki að vinna í sömu skrám.

Lendingarsíðan ætti að:

Vera fyrsta síða innskráðra notenda.
Nota núverandi Teskeið header, liti, letur, spacing og UI components.
Heilsa notanda með display_name.
Sýna „Hvað er á dagskrá?“ með virkum flýtileiðum.
Setja „Lánað og skilað“ fremst og sýna raunverulegan fjölda opinna boða.
Hafa „Nýlegt“ byggt á raunverulegum gögnum, ekki sýnidæmum.
Vera þétt og gagnleg, ekki markaðslendingarsíða.
Virka vel í farsíma og desktop.
Geyma allan texta í messages/is.json og messages/en.json.
Ekki breyta núverandi lánaflæði eða öryggisreglum.
Ég myndi ekki láta Claude hefja þetta fyrr en sql/36 og valfrjálsa netfangið eru samþykkt. Þá getum við fyrst látið Claude skoða núverandi app-shell og leggja fram nákvæma síðuáætlun án breytinga.

#4
## Beta-aðgangur og útgáfustig fyrir nýjar Teskeiðar

**Staða:** Bíður

**Markmið:** Stebbi og valdir prófarar geti notað nýjar Teskeiðar í production
á meðan almennir notendur sjá aðeins útgefið efni.

Hver Teskeið skal geta verið á einu af þremur útgáfustigum:

- `off`: enginn hefur aðgang
- `beta`: aðeins Stebbi og valdir prófarar hafa aðgang
- `public`: allir viðeigandi innskráðir notendur hafa aðgang

**Tillaga að útfærslu:**

- Geyma release-stage fyrir hverja Teskeið miðlægt.
- Geyma beta-allowlist í gagnagrunni, tengda `feature_key` og `user_id`.
- Búa til eitt sameiginlegt server-side aðgangslag, t.d.
  `guardFeatureAccess(featureKey)`.
- Búa til sameiginlegt yfirlit fyrir viðmótið, t.d.
  `getAvailableFeatures(userId)`.
- Fela óaðgengilegar Teskeiðar í heimaskjá og navigation.
- Verja einnig beinar slóðir, server actions og API endpoints.
- Ekki treysta á client-side eða `NEXT_PUBLIC_*` flagg sem öryggisvörn.
- Halda RPC-functions áfram service-role-only þar sem það á við.
- Bæta við regression-prófum fyrir `off`, `beta`, `public`, óskráðan notanda
  og beina slóð.

**Mikilvæg aðgreining:** Beta-aðgangur í production stýrir sýnileika og
notkun, en einangrar ekki áhættusamar schema-breytingar eða production-gögn.
Stórar eða destructive gagnagrunnstilraunir þurfa áfram sérstakt staging
Supabase-project.

Áður en útfærsla hefst þarf að ákveða hvort release-stage eigi að vera í
gagnagrunni, environment variables eða blandað. Forgangstillaga er DB-stýrt
release-stage og DB-stýrð beta-allowlist svo hægt sé að færa `beta` í `public`
án nýs deploys.
