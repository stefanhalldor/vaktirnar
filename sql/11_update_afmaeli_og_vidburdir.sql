-- Update "Afmæli og viðburðir" idea with new direction focused on event planning.
-- Idempotent: UPDATE WHERE slug = 'afmaeli-og-vidburdir' is a no-op if the row does not exist.

UPDATE ideas
SET
  short_description   = 'Settu inn aldur, áhuga, fjölda gesta og budget og fáðu hugmyndir að viðburði sem passar við tilefnið.',
  problem_description = 'Það getur tekið ótrúlega mikinn tíma að ákveða hvernig afmæli, ferming, fjölskylduboð eða annar viðburður á að vera. Maður endar á að leita út um allt, bera saman hugmyndir og reyna að láta þetta passa við tíma, pening og mannskap.',
  possible_solution   = 'Einfalt tól þar sem þú setur inn helstu upplýsingar um viðburðinn og færð tillögur að uppsetningu, dagskrá, mat, skrauti, leikjum og innkaupalista. Meira tips og trix en flókið skipulag.'
WHERE slug = 'afmaeli-og-vidburdir';
