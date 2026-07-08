# 09 — ACV import + Proportionality Guardrail

Status: ready-for-agent

## What to build

Admin uploads the ACV feed (Company Code, Account Name, ACV — a Salesforce export). ACV attaches to **Customers**, not Environments, and is consumed only by the **Proportionality Guardrail** (CONTEXT.md): the quote screen shows a warning when List Price exceeds an Admin-set share of the Customer's ACV (Assumption, seeded 25%). It flags, never blocks — the judgment call belongs to Sales. Per ADR-0002 there is no value uplift; ACV must not influence the price itself. Customers in the feed with no Environment are fine (they exist commercially); no User Count feed exists in this app.

## Acceptance criteria

- [ ] Uploading the current workbook's ACV data attaches values to ~373 Customers, including ones with no Environment
- [ ] Quote screen warns when List Price > threshold × ACV; no warning otherwise; quietly notes when ACV is unknown
- [ ] The computed List Price is identical with and without ACV present (asserted in a test)
- [ ] Threshold is an Assumption; changing it changes warning behavior without re-import
- [ ] Feed staleness shown like the other imports

## Blocked by

- 06-quote-screen-v1.md
