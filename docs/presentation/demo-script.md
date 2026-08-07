# ORAM — 2-Minute Demo Script

A talk track for a live demo of `oram analyze`. Approximate timings assume a calm, unhurried pace.

---

## 1. What ORAM is (≈25 seconds)

> "ORAM stands for Orchestrated Repository Autonomous Manager. It's a system that reads a codebase the way a
> senior engineer would during a first pass — it doesn't run your code or call out to an AI model, it reads
> the repository itself: the files, the manifests, the config, the structure. From that, it builds up an
> understanding in stages, and at the end it tells you things about the codebase's architecture and its
> risks, with evidence for every claim."

## 2. How it works (≈35 seconds)

> "It's a four-stage pipeline. First, **Repository Analysis** scans the repo and detects facts — languages,
> frameworks, dependencies, whether there's CI/CD, whether it's a monorepo — each one backed by the actual
> files that proved it. Second, **Engineering Knowledge** takes those facts and organizes them into
> subsystems and the relationships between them — which part of the codebase depends on which technology.
> Third, **Engineering Reasoning** looks across that knowledge for patterns a single fact can't show — like
> one subsystem owning most of the dependency graph, or an API with no tests and no authentication attached
> to it. Every one of those is a deterministic rule, not a guess."

## 3. Run it (≈20 seconds)

> "Let's run it against this repository, right now, live."

```bash
oram analyze .
```

> Let the ASCII pipeline diagram and the report print. Give it a beat before talking over it.

## 4. Explain the output (≈30 seconds)

> "At the top you see the four stages flow past. Then the report: the **Repository** section is what stage
> one found — name, language, package manager, architecture style. **Engineering Knowledge** lists the
> subsystems it identified and the relationships between them and their dependencies. **Engineering
> Findings** is the output of stage three — here's a real one it just found in this repository, with a
> plain-English reason. Then **Statistics** — files scanned, subsystems, relationships, findings, and how
> long the whole pipeline took — and a **Pipeline Status** footer confirming every stage completed."

## 5. Why deterministic reasoning matters (≈20 seconds)

> "Nothing you just saw came from an LLM. Every Detection and every Finding is reproducible — run this twice
> on the same commit and you get byte-identical output. That matters because these results feed into
> decisions: if you're going to tell an engineer 'this subsystem is a risk,' you need to be able to show
> them exactly why, every time, not a plausible-sounding guess that might change on the next run. Language
> models come in later, in a future stage, to help explain or prioritize — never to replace this evidence
> layer."

---

**Total: ~2 minutes.** If time is tight, sections 3–4 (the live run and reading the output) are the part to
never cut — everything else can be compressed into one sentence each.
