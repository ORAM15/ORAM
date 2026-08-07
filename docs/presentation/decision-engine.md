# ORAM — The Adaptive Decision Engine

Every stage before this one answers a narrower question: did the patches validate, what should a human do
about each issue, is this batch healthy overall. The Adaptive Decision Engine answers the question all of
that was building toward — **what should ORAM do next?** — by synthesizing four already-computed sources
into exactly one `EngineeringDecision`, deterministically, with no AI and no prompts.

```
Validation ──────────┐
                      │
Recommendation ───────┼──►  Adaptive Decision  ──►  EngineeringDecision
                      │
Reflection ───────────┤
                      │
Engineering Memory ───┘
(latest run only)
```

## Why four inputs, not one

Every prior stage in the pipeline transforms exactly one upstream artifact into one downstream artifact —
Validation turns a patch into a report, Recommendation turns an issue into a suggestion, Reflection turns a
whole batch into one verdict. The Decision Engine is architecturally different on purpose: a good "what
next" call cannot be made from any single one of those views alone.

- **Validation** gives the raw facts: did the patches themselves earn a passing score.
- **Recommendation** gives the actionable guidance: what, specifically, would need to change.
- **Reflection** gives the batch-level verdict: is this run, as a whole, healthy, and does it already
  recommend a retry.
- **Engineering Memory (latest run only)** gives history: did the *previous* run for this same repository
  also recommend a retry? A single bad run and a *second consecutive* bad run call for very different
  responses — only Memory can tell the two apart.

## The six decisions

Policies are evaluated in a fixed order, most severe first; the first one whose condition matches wins. Every
condition is a plain check against a fact some earlier stage already computed — a `ReflectionFinding`'s own
title, a `ValidationIssue`'s own severity, a `RunSnapshot`'s own `retryRecommended` flag. Nothing here
re-parses a patch or re-walks a repository.

| Decision | Fires when | Why |
|---|---|---|
| `STOP` | Both the previous recorded run **and** this run recommend a retry | A repeated failure — another automated attempt is unlikely to succeed on its own |
| `ESCALATE_TO_HUMAN` | Reflection's own "Confidence reduced due to many errors" finding is present (3+ `ERROR`-severity issues) | Too severe and widespread for an automated fix alone |
| `CHANGE_PROVIDER` | Reflection's own "Critical validation failures" finding is present (at least one `ERROR`), but not severe enough for the rule above | An isolated structurally-broken patch points at the Provider, not the plan |
| `SPLIT_MISSION` | Reflection's own "Large number of validation issues" finding is present | Too much volume for one batch to stay reviewable |
| `RETRY` | The aggregate validation score is below a fixed threshold, with nothing more severe already matched | Room to improve, no blocking failure |
| `CONTINUE` | Nothing above matched | Validation acceptable and no blocking findings |

## What an `EngineeringDecision` carries

Beyond the `decisionType` itself: a human-readable `reason` and `nextAction`, a fixed-tier `confidence` (the
same "fixed template confidence, never computed from anything probabilistic" convention Reflection and
Recommendation both already established), a `riskLevel`, and two id lists — `evidenceIds` (the real upstream
facts that justify the call: `ValidationIssue` ids, `ReflectionFinding` ids, `Recommendation` ids, or a
previous run's own `runId`) and `policyIds` (which named policy produced it). Nothing is ever asserted
without a traceable id behind it.

## What this stage never does

No AI call, no prompt, no model of any kind. No filesystem write. No git operation. No re-validation of a
patch — every fact this stage reasons over was already produced, and already trusted, by an earlier stage.
