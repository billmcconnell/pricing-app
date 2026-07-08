# 13 — Deployment

Status: ready-for-human

## What to build

Get the app running where Sales and Admin can reach it: an internal VM or container, TLS, and a backup story for the single SQLite file (ADR-0003 chose SQLite partly because backup is one file). Margin and ACV data are sensitive — hosting must not be world-readable, and access stays behind the app's auth.

HITL: the hosting target, domain, TLS approach, and backup destination are infrastructure decisions only Bill can make. Capture what's decided here in comments as it firms up.

## Acceptance criteria

- [ ] App reachable by Sales and Admin at a stable internal URL over HTTPS
- [ ] SQLite database backed up on a schedule to a location that survives the host
- [ ] A documented, repeatable deploy procedure (script or few-step runbook) from a clean checkout
- [ ] Restore-from-backup tested once

## Blocked by

- 06-quote-screen-v1.md

## Comments
