# Errata — PostHog Data Ruled Invalid

**Ruling (owner, this session):** all PostHog-derived observations came from QA/local testing on a dev subdomain, mid-redeploy, with the team among the visitors. Every quantitative claim sourced from it is **void as evidence**. Downgraded, not deleted: where an observation retains heuristic value it becomes an explicitly labeled anecdote feeding a QA item.

## Corrections

| Invalid claim (was) | Where | Correction (now) |
|---|---|---|
| Funnel: 16→6→4→4 persons; start rate 37.5%; wall pass 67%; completion 100% | phase-0 | **No baseline exists.** First valid measurement occurs at launch with clean instrumentation (test-accounts filtered, dev capture gated). Hypothesis from first principles + tester feedback: entry is the dominant loss point — *to be measured* |
| Device split 67% mobile; completers same split | phase-0 | Void. Replaced by design assumption: mobile-first regardless (cost of assuming desktop-first is catastrophic; cost of over-serving mobile is zero) |
| 12 rage clicks on /survey ⇒ "save-pause friction" | phase-0, phase-5 §1.1, phase-2 | Downgraded to **anecdote under contaminated conditions** (redeploys mid-session). Remains a QA item: make section-save feedback snappy — but its priority is now judgment, not measurement |
| OQ-1 closure: "one real user, 8 reloads, 2 rage clicks, wall victim" | phase-2 | Downgraded to **anecdote** → survives only as QA checklist item (test captcha in Android in-app browsers). Not a finding about the population |
| "Completion among starters is 100% (twice observed)" | phase-5, briefings | Void — starters were plausibly the team. Expected completion at ~31 screens: **~89%** (Hoerger) until measured otherwise |
| Baselines table (37.5%, 100%, wall 33%) | phase-6 §2 | Baseline column replaced with "none — collect at launch"; targets and alarm thresholds unchanged (they were literature-derived) |
| "The leak is the door, not the room" stated as finding | plain-English briefing | Restated as **hypothesis H-1** with a launch measurement plan |

## What survives untouched (never depended on PostHog)

- Phase 1 (psychology), Phase 3 (MENA), Phase 4 (comparables — upstream measured from git; Devographics/SO external), all literature citations
- Phase 2's literature findings; only its OQ-1 "closure" is downgraded
- All handbook chapters (evidence-based, not data-based)
- Engine/model-check numbers (math, not analytics): 53 questions, 11 guards, 4,680 paths, 0 dead nodes, median 40 screens (minors 27, adults 41)

*Quarantine banners added in place on: phase-0, phase-2, phase-5, phase-6. Clean baseline: `phase-0-baseline-v2.md`.*
