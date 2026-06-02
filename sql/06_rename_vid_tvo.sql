-- Rename "Við tvö" → "Maki / kæró"
-- Run once in production after 05_teskeid_seed.sql has already been applied.
-- Safe to run multiple times (idempotent via slug check).

UPDATE ideas
SET
  title               = 'Maki / kæró',
  slug                = 'maki-kaero',
  short_description   = 'Hjálpar pörum að rækta sambandið, prófa eitthvað nýtt saman og muna að hlúa að hvort öðru.',
  problem_description = 'Það er auðvelt að festast í rútínu. Vinnan, börnin, heimilið og síminn taka plássið, og allt í einu eru stefnumótin, litlu óvæntu hlutirnir og samtölin farin að detta aftar.',
  possible_solution   = 'Einfalt tól fyrir pör með mánaðarlegum hugmyndum, litlum áskorunum og minningum um að gera eitthvað fallegt saman. Kvöldverður, göngutúr, helgarferð eða eitthvað nýtt sem þið hafið aldrei prófað.'
WHERE slug = 'vid-tvo';
