-- Update "Útlagt og endurgreitt" idea with improved copy.
-- Idempotent: UPDATE WHERE slug = 'utlagt-og-endurgreitt' is a no-op if the row does not exist.

UPDATE ideas
SET
  short_description   = 'Haltu utan um það sem þú leggur út fyrir aðra, hvað er búið að endurgreiða og hvað er enn opið.',
  problem_description = 'Einn kaupir miðana, annar borgar gjöfina, einhver leggur út fyrir mat, ferð eða kostnaði tengdum börnunum. Svo líður tíminn, enginn vill vera leiðinlegur og minna á þetta, en samt er óþægilegt að vita ekki hvað er búið og hvað stendur eftir.',
  possible_solution   = 'Einfalt yfirlit yfir útlagðan kostnað, hver á eftir að borga og hvað er frágengið. Hægt væri að ganga frá greiðslunum beint inni í Teskeið, svo þetta þurfi ekki að enda í awkward skilaboðum, excel-skjali eða minni hvers og eins.'
WHERE slug = 'utlagt-og-endurgreitt';
