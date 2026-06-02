-- Rename "Krakkarnir" → "Út að leika" and update all copy.
-- Run once in production after 05_teskeid_seed.sql has already been applied.
-- Idempotent: UPDATE WHERE slug = 'krakkarnir' is a no-op if the row is already gone/renamed.

UPDATE ideas
SET
  title               = 'Út að leika',
  slug                = 'ut-ad-leika',
  short_description   = 'Sendu leikboð á barnið, ekki á rétta foreldrið. Kerfið finnur hver er með barnið hverju sinni.',
  problem_description = 'Þegar barn vill hitta vin sinn þarf foreldri oft að vita hvort það á að senda á mömmu, pabba, bæði eða einhvern annan. Þetta er sérstaklega snúið þegar foreldrar eru fráskildir, barnið er á flakki milli heimila eða frænka, afi eða amma er stundum með barnið.',
  possible_solution   = 'Einfalt tól þar sem barnið er í miðjunni. Bakvið prófíl barnsins geta verið mamma, pabbi, frænka eða annar umönnunaraðili, og tilkynningar fara til þeirra sem eru með barnið þá stundina. Fullorðnir geta líka tengt prófíla eða samfélagsmiðla, svo aðrir foreldrar fái betri tilfinningu fyrir hver er hinum megin.'
WHERE slug = 'krakkarnir';
