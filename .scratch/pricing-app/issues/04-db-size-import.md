# 04 — DB-size import (Customers + Environments)

Status: ready-for-agent

## What to build

Admin uploads the `spaceused` export (CSV or xlsx: identifier + database size). The import creates/updates **Customers** (4-letter Company Code) and their **Environments**, converting size from **MB to GB at the import boundary** — the only place that conversion ever happens (see CONTEXT.md, IMOS DB Size). Most rows are a bare Company Code (one Environment, 1:1); some rows are full environment names like `MOLH_imos_MPCC_PROD` — the same Customer can own several Environments and each is priced separately.

Admin UI: upload, a preview/confirmation of what will change, and a browsable Customer/Environment list showing sizes and when the feed was last imported, with a staleness warning past an age threshold.

Also import the Company Code ↔ Account Name mapping (the workbook's cheat-sheet data) so Customers display names, either as part of this feed or as a second upload on the same screen.

## Acceptance criteria

- [ ] Uploading the current workbook's spaceused data yields ~366 Environments with sizes in GB (e.g. a 672,758 row is stored as ≈672.8 GB)
- [ ] A Customer with two Environments (MOLH case) shows both, separately sized
- [ ] Re-import updates existing Environments rather than duplicating; rows that disappear from the feed are flagged, not silently deleted
- [ ] Malformed rows (non-numeric size, bad identifier) are rejected with a per-row report; nothing partial is committed
- [ ] List view shows last-import timestamp and a staleness warning
- [ ] Import parsing and MB→GB conversion covered by tests

## Blocked by

- 02-auth-two-roles.md
