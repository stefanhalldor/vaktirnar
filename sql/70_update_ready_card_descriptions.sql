-- Migration 70: update short_description for launched ready Teskeiðar home cards.
-- Idempotent: UPDATE WHERE slug = ... is a no-op if the row does not exist.

UPDATE ideas
SET short_description = 'Haltu utan um hluti sem þú lænar eða færð lánaða.'
WHERE slug = 'lanad-og-skilad';

UPDATE ideas
SET short_description = 'Ferðaveður byggt á leið, tíma og veðurspá.'
WHERE slug = 'vedrid';

UPDATE ideas
SET short_description = 'Fyrir fólk sem heldur umönnuninni gangandi saman.'
WHERE slug = 'umonnun';
