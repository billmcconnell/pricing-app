# 04 — DB-size import (Customers + Environments)

Status: done

## What to build

Admin uploads the `spaceused` export (CSV or xlsx: identifier + database size). The import creates/updates **Customers** (4-letter Company Code) and their **Environments**, converting size from **MB to GB at the import boundary** — the only place that conversion ever happens (see CONTEXT.md, IMOS DB Size). Most rows are a bare Company Code (one Environment, 1:1); some rows are full environment names like `MOLH_imos_MPCC_PROD` — the same Customer can own several Environments and each is priced separately.

Admin UI: upload, a preview/confirmation of what will change, and a browsable Customer/Environment list showing sizes and when the feed was last imported, with a staleness warning past an age threshold.

Also import the Company Code ↔ Account Name mapping (the workbook's cheat-sheet data) so Customers display names, either as part of this feed or as a second upload on the same screen.

## Acceptance criteria

- [x] Uploading the current workbook's spaceused data yields ~366 Environments with sizes in GB (e.g. a 672,758 row is stored as ≈672.8 GB)
- [x] A Customer with two Environments (MOLH case) shows both, separately sized
- [x] Re-import updates existing Environments rather than duplicating; rows that disappear from the feed are flagged, not silently deleted
- [x] Malformed rows (non-numeric size, bad identifier) are rejected with a per-row report; nothing partial is committed
- [x] List view shows last-import timestamp and a staleness warning
- [x] Import parsing and MB→GB conversion covered by tests

## Blocked by

- 02-auth-two-roles.md

## Comments

Implemented 2026-07-12. Notes and decisions:

- **Schema**: `customers` (companyCode unique, accountName), `environments` (identifier unique — the raw feed identifier, bare code or full name like `MOLH_imos_MPCC_PROD`; dbSizeGb; missingFromLastImport flag), `imports` (feed, importedAt, rowCount, filename).
- **MB→GB is ÷1000** (matches the workbook's `/150/1000` multiplier), applied only in the import layer.
- **Exact counts from the current workbook**: 367 spaceused rows contain a duplicate bare `EVSG` → **366 Environments**. Duplicates within a file are first-occurrence-wins (matching Excel VLOOKUP behavior) with a preview warning. The cheat sheet's 378 rows contain 5 duplicate codes (EVSG, IXCP, NMAP, MNDU, EKPW) → **373 named Customers**. After both imports: 417 Customers, of which 52 have no Environment — exactly the "52 codes with no database size" from CONTEXT.md.
- **Account names** are a second upload on the same screen (the issue offered either option). Column order is auto-detected per row; Customers not in the spaceused feed are created (they exist commercially, unpriceable).
- **Flow**: preview and commit are separate endpoints taking the same multipart file; commit runs in one transaction. Any malformed row → 422 with per-row errors, nothing committed. Disappeared identifiers are flagged `missingFromLastImport` (cleared if they return); never deleted.
- **Formats**: CSV (hand-rolled parser with quoting) and xlsx (exceljs — chosen over SheetJS's npm package, which is stale and has known vulnerabilities). Fixtures in `server/test/fixtures/` are the real workbook data extracted once.
- **Staleness threshold**: 30 days, currently a UI constant (`STALE_AFTER_DAYS` in `Imports.tsx`) — not an Assumption, since it's not a cost-model input. Say the word if it should be Admin-editable.
- **UI**: `/admin/imports` — two upload cards (auto-preview on file pick → Confirm) + the browsable Customer/Environment table with per-feed last-import timestamps, staleness and missing-from-feed warnings.
