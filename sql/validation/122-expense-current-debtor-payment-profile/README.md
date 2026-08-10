# SQL122 — current-debtor payment profile

SQL122 corrects the encrypted UL payment-profile read boundary used by
`Gera allt upp`. SQL119 authorized direct and canonical shared debtors but
checked repayment-obligation rows, which do not represent the live unpaid
settlement before a payment is reported. SQL122 instead requires the exact
positive transfer from `expense_simplified_settlement(..., true)`, the same
current settlement boundary used by the report action.

The migration replaces one service-role-only `SECURITY DEFINER` function. It
does not change any rows, tables, RLS policies, auth users, table grants,
encrypted payloads or historical repayments. It returns only the exact
creditor's encrypted envelope; decryption remains server-side in the app.

Stebbi alone runs Supabase SQL. Run `preflight.sql` manually against the
explicitly selected project and require `prerequisites_ok = true`, every
available `*_ok = true`, no missing roles and no old transaction. Then run
`122_expense_current_debtor_payment_profile.sql` once and run `postflight.sql`.
Every postflight `*_ok` value must be true. Do not retry an apply error blindly.

`recovery.sql` is a manual function-only emergency rollback to the exact
SQL119 authorization predicate. It changes no data, but it deliberately
reintroduces the limitation that prompted SQL122, so leaving SQL122 in place
is safer unless a concrete regression requires rollback.

## Localhost checks for Stebbi

Do not casually use production financial data for testing. After Stebbi has
explicitly applied SQL122, use two consenting UL test users with the feature
flag. Save payment details for the creditor. Create two unpaid entries where
the other user is the direct debtor, then repeat with an active shared-debtor
collaboration. Open `Gera allt upp` as each debtor. The single recipient card
must show the summed amount and saved account details; `Nánar` must show both
entry links, each amount, and a total that matches the card. A non-debtor,
unrelated member, settled debt, inactive member or wrong creditor must not
receive the encrypted profile. Do not press `Búinn að borga` unless you intend
to create a real reported repayment in the selected Supabase project.
