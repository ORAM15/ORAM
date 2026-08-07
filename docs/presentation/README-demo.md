# ORAM — Quick Demo

The fastest path to seeing ORAM analyze a real repository.

## 1. Clone

```bash
git clone https://github.com/ORAM15/G-VAMS-ERP.git
cd G-VAMS-ERP
```

## 2. Install

```bash
npm install
```

## 3. Run

```bash
oram analyze .
```

## Expected output

```
┌───────────────────────┐
│      Repository       │
└───────────────────────┘
            │
            ▼
┌───────────────────────┐
│  Repository Analysis  │
└───────────────────────┘
            │
            ▼
┌───────────────────────┐
│ Engineering Knowledge │
└───────────────────────┘
            │
            ▼
┌───────────────────────┐
│ Engineering Reasoning │
└───────────────────────┘

====================================================
ORAM Engineering Analysis
====================================================

Repository
✔ Name: G-VAMS-ERP
✔ Language: JavaScript
✔ Package Manager: npm
✔ Architecture: Likely Clean/Hexagonal Architecture

----------------------------------------------------
Engineering Knowledge
----------------------------------------------------

Subsystems
  • apps/dashboard
  • packages/core
  • packages/engines
  ...

Relationships
  • G-VAMS-ERP → React
  • G-VAMS-ERP → Express
  • Core → TypeScript
  ...

----------------------------------------------------
Engineering Findings
----------------------------------------------------

ℹ LOW
Opaque Subsystems

Reason:
7 of 10 subsystems have no technology attributed to them specifically -- responsibilities or
dependencies may be undeclared at the module level.

--------------------------------------------

----------------------------------------------------
Statistics
----------------------------------------------------

Files Scanned .......... 341
Subsystems ............. 10
Relationships .......... 23
Findings ............... 1
Execution Time ......... 160 ms

----------------------------------------------------
Pipeline Status
----------------------------------------------------

✔ Repository Analysis Complete
✔ Engineering Knowledge Complete
✔ Engineering Reasoning Complete

Overall Status
SUCCESS

====================================================
```

Exact numbers, subsystems, relationships, and findings will differ per repository and per commit — the
report above is a real, representative run against this project. Output is deterministic: analyzing the
same commit twice produces byte-identical results.

---

### Running it today, in this repository, before `oram` has a published build

The `oram` binary isn't published yet (see `packages/cli/README.md`'s Status section). Until then, `npm
install` at the repository root resolves the `@oram/*` packages as real npm workspace symlinks, and the
same command runs in dev mode via `tsx`:

```bash
npm install
npx tsx packages/cli/src/bin.ts analyze .
```

`packages/cli/src/bin.ts` is the same dev-mode entry point `oram`'s published `bin` will eventually wrap —
the output shown above is not aspirational, it's what this command prints today.
