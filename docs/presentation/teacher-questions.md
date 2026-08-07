# ORAM — Likely Viva Questions

Concise answers for a live Q&A after the demo.

---

**1. What is ORAM?**
A system that builds up a structured, evidence-backed understanding of a software repository through a
deterministic pipeline of stages, without executing the code or calling an LLM.

**2. What is Repository Analysis?**
The first pipeline stage. It scans the repository once and produces a set of Detections — facts like
language, frameworks, dependencies, CI/CD presence — each backed by confidence and file evidence.

**3. What is Engineering Knowledge?**
The second stage. It reorganizes Repository Analysis's raw facts into subsystems (the repo's real internal
boundaries) and relationships between those subsystems and the technologies they use.

**4. What is Engineering Reasoning?**
The third stage. It applies deterministic rules across Engineering Knowledge's facts to surface patterns —
like one subsystem owning most of the dependency graph — producing a list of Findings.

**5. What is the difference between Knowledge and Reasoning?**
Knowledge organizes and connects facts; it doesn't judge them. Reasoning looks at combinations of Knowledge
facts and draws a conclusion — a Finding — about risk, quality, or architecture.

**6. What are Findings?**
The output of Engineering Reasoning: a category (e.g. architectural-smell, security-concern), a severity
(High/Medium/Low), and a plain-English reason, each backed by the Knowledge facts that produced it.

**7. Why not use an LLM for this?**
Determinism. The same repository at the same commit must produce identical output every run, so results are
trustworthy and diffable. An LLM's output can vary between runs and can't be traced back to a specific,
checkable piece of evidence.

**8. Why deterministic rules instead of AI-based reasoning?**
Deterministic rules are auditable — anyone can read the rule's source and know exactly why it fired.
That's a requirement before this output can be trusted enough to feed decisions or automation.

**9. How many rules does Engineering Reasoning currently have?**
Five, deliberately kept small to prove the pipeline works end-to-end before scaling up the rule set.

**10. Can you give an example of a rule?**
"Untested API Surface" — fires when a subsystem uses an API framework (e.g. Express) but the repository has
no automated testing framework detected at all.

**11. What does "confidence" mean on a Detection?**
An honest signal of how certain the detection is — High/Medium/Low — based on how directly the evidence
supports it (e.g. an explicit config field vs. a naming-convention guess).

**12. What is "evidence" on a Detection or Finding?**
The specific file paths and descriptions that back the claim — so every conclusion can be traced back to
something real in the repository, not asserted on faith.

**13. Why does every object have a stable ID?**
So relationships between objects can be expressed as references (an ID pointing at another object) rather
than duplicated or flattened text labels — preserving information for whatever consumes this data next,
without needing a full graph database today.

**14. Does ORAM modify or execute the code it analyzes?**
No. It only reads files — source, manifests, config — and never runs, imports, or executes anything from the
target repository.

**15. What does "monorepo detection" mean here?**
Recognizing (from workspace config and multiple package manifests) that a repository contains several
independent packages, which changes how architecture and subsystem boundaries are interpreted.

**16. Why is each pipeline stage separated instead of one big function?**
Each stage has a single, testable responsibility and a stable output contract. A later stage can be improved
or replaced without needing to touch or re-verify earlier stages.

**17. What would happen if Repository Analysis found nothing (an empty or minimal repo)?**
Every downstream stage degrades gracefully — Knowledge would show no subsystems, Reasoning would show no
findings, rather than crashing or guessing.

**18. Is the CLI report itself part of the reasoning system?**
No — `oram analyze` is purely a presentation layer. It calls the same three pipeline functions any other
consumer would and formats their output; it computes nothing itself.

**19. What's the current scope limitation of Engineering Reasoning?**
It only reasons over Engineering Knowledge, never raw Repository Analysis data directly — this keeps each
stage's responsibility clean, at the cost of not (yet) catching patterns visible only in the raw facts.

**20. What's the future scope?**
A Planning stage that turns Findings into prioritized, actionable recommendations, and later an optional LLM
Augmentation stage that explains or elaborates on already-deterministic results — never replacing them.

**21. Why is this useful for a real engineering team?**
It gives a fast, honest, zero-cost-per-run first pass on a codebase's architecture and risk profile — the
kind of read a senior engineer would give in an hour of manual review, available instantly and consistently.
