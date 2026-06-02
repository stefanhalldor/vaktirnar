-- Update "Gjafir og óskir" idea with improved copy.
-- Idempotent: UPDATE WHERE slug = 'gjafir-og-oskir' is a no-op if the row does not exist.

UPDATE ideas
SET
  short_description   = 'Óskalistar og gjafasaga fyrir fjölskyldur, svo það sé auðveldara að vita hvað á að gefa og hvað var gefið síðast.',
  problem_description = 'Afmæli, jól og fermingar koma alltaf aftur, en enginn man hvað var gefið í fyrra, hvað barnið óskaði sér eða hvort einhver annar sé þegar búinn að kaupa sömu gjöf.',
  possible_solution   = 'Einfalt yfirlit yfir óskir, gjafir og gjafasögu. Fjölskyldan getur séð hvað vantar, hvað er frátekið og hvað þú gafst síðast þegar svipað tilefni kom upp.'
WHERE slug = 'gjafir-og-oskir';
