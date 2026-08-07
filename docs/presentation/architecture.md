# ORAM — Architecture at a Glance

ORAM turns a raw repository into a chain of increasingly meaningful artifacts. Each stage consumes only the
artifact produced by the stage before it — never the raw filesystem again, and never a stage further back.
That discipline is what makes the pipeline replayable and each stage independently testable.

```
Repository
   │
   ▼
Repository Analysis
   │
   ▼
Engineering Knowledge
   │
   ▼
Engineering Reasoning
```

## Repository

The raw project on disk: source files, manifests (`package.json`, `requirements.txt`, ...), config files, git
history. Nothing has been interpreted yet — this is just what a developer would `git clone`.

## Repository Analysis

Scans the repository once and produces a structured, evidence-backed set of **Detections** — language,
frameworks, package manager, dependencies, CI/CD, Docker, monorepo structure, and more. Every Detection
carries a confidence level and the file evidence it was derived from, so nothing is asserted without a
reason.

## Engineering Knowledge

Reorganizes those raw Detections into something closer to how an engineer thinks about a codebase:
**subsystems** (the repo's real internal boundaries) and **relationships** between those subsystems and the
technologies they depend on, plus a narrative summary of the architecture and tech stack.

## Engineering Reasoning

Applies a small set of deterministic rules *across* Engineering Knowledge's facts — looking at combinations
a single fact can't reveal on its own, like one subsystem owning most of the dependency graph, or an API
surface with no tests and no auth. The output is a list of **Findings**, each with a category, a severity,
and a plain-English reason.

## Why this shape

Every stage's output is a plain, versionable data structure — not a live object graph — so any future stage
(planning, an LLM layer, a dashboard) can be built against a stable contract without touching the stages
that already work.
