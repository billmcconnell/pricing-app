# 09 — ACV import + Proportionality Guardrail

Status: done

## What to build

Admin uploads the ACV feed (Company Code, Account Name, ACV — a Salesforce export). ACV attaches to **Customers**, not Environments, and is consumed only by the **Proportionality Guardrail** (CONTEXT.md): the quote screen shows a warning when List Price exceeds an Admin-set share of the Customer's ACV (Assumption, seeded 25%). It flags, never blocks — the judgment call belongs to Sales. Per ADR-0002 there is no value uplift; ACV must not influence the price itself. Customers in the feed with no Environment are fine (they exist commercially); no User Count feed exists in this app.

## Acceptance criteria

- [x] Uploading the current workbook's ACV data attaches values to ~373 Customers, including ones with no Environment
- [x] Quote screen warns when List Price > threshold × ACV; no warning otherwise; quietly notes when ACV is unknown
- [x] The computed List Price is identical with and without ACV present (asserted in a test)
- [x] Threshold is an Assumption; changing it changes warning behavior without re-import
- [x] Feed staleness shown like the other imports

## Blocked by

- 06-quote-screen-v1.md

## Comments

Implemented 2026-07-13. Notes and decisions:

- **Exact counts**: the ACV sheet has 377 rows with 4 duplicate codes (EVSG, NMAP, MNDU, EKPW; first-wins + warnings) → **373 unique Customers**, all of which already existed after the earlier feeds on the live dev DB.
- **Negative ACV is accepted** — the current workbook contains one (−$170,000, presumably churn/credit). The guardrail then always warns for that Customer, which reads as correct behavior. Non-numeric ACV is still a per-row error that rejects the file.
- **Schema**: `customers.acv` (nullable real). New Assumption `guardrail_acv_share` seeded 0.25 (commercial); read via a new `assumptionValue()` helper since it's not a cost-model input. Adding the seed retro-fills existing databases on next boot (seeds are gap-filling).
- **Guardrail in the payload**: `/api/quote` gains `guardrail: { acv, threshold, thresholdAmount, triggered }` for **both roles** — the warning is for Sales, and ACV is commercial data, not a cost internal. `triggered` is `null` when ACV is unknown → the UI shows a quiet note instead. Tests assert: price identical before/after ACV import (OTQV $112,000), threshold flip 0.25→0.10 in the DB changes `triggered` without re-import and without moving the price, and the Sales payload still carries no breakdown.
- **ACV feed's Account Name column** is used only when creating a Customer that doesn't exist yet; the cheat-sheet import remains the authority for names of existing Customers.
- **UI**: ACV upload card with preview/commit on `/admin/imports`, ACV column in the Customer table, feed staleness line; quote screen shows the warning ("a flag for judgment, not a block") or the quiet ACV-unknown note.
