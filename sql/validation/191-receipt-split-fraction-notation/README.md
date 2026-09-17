# SQL191 exact fraction notation

Run `preflight.sql`, then the migration once, then `postflight.sql`. Stop unless
the states are respectively `READY`, successful migration, and `EXACT_INSTALLED`.
Stebbi runs every SQL step manually.
