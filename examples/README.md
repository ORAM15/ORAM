# examples/

Example target repositories ORAM can be pointed at, used to prove and demonstrate repository-independence.

## Why this directory exists

Today, every System A engine assumes it *is* the repository it analyzes (e.g.
`path.resolve(__dirname, "..")` in `scripts/repository-intelligence.js` and every other engine). That
assumption — not any missing feature — is the real architectural blocker to "install ORAM once, point it at
any Git repository." `ORAM_V3_MIGRATION_PLAN.md` Milestone 5 ("Repository-independent ORAM") retires that
assumption, and this directory is where the proof lives: at least one example repository ORAM operates on
as an external target, never as its own host.

## Current status

Empty. The G-VAMS ERP application (`frontend/`, `backend/`) that ORAM's pipeline was originally built and
proven inside of is planned to become this directory's first example (`examples/g-vams-erp/`) — but **not
yet**. Per the current phase's explicit instructions, no working code is being moved. G-VAMS remains exactly
where it is today until Milestone 5 begins.
