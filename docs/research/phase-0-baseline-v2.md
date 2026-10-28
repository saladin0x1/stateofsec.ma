# Phase 0 (v2) — Clean Baseline: No Analytics

Re-baseline of the research program after the ruling that all PostHog data is invalid QA contamination (see `errata.md`). This document establishes what we know from **valid sources only**: engine mathematics, upstream measured data, tester testimony, and literature. Everything unknown is stated as a hypothesis with a measurement plan.

## Valid source 1 — The engine (math, not analytics)

Measured by exhaustive model-check of the working tree (`archcheck`, equivalence-class DFS over all reachable answer paths):

| Metric | Value |
|---|---|
| Sections | profile → roles → learning → work → tech → community |
| Questions in file | 53 (11 fork/guard questions) |
| Distinct respondent paths | 4,680 |
| Dead nodes | **0** |
| Screens: minor (<18) | 27 |
| Screens: lycée student | 28 |
| Screens: adult (all ages, 576 profile combos) | min 36 · **median 41** · max 43 |
| Always-visible questions | 6 |

Today's edits (band coarsening, tool categories) cut **reading load**, not screen count. Screen-count reduction requires the pending structural moves (community merges −2; work-section diet −2/−3; deeper cuts trade calibration).

## Valid source 2 — Upstream stateofdev.ma (measured from its git)

60 questions, flat, unbranched → **2,315 responses in 2024**; 9,448 over five editions; Moroccan dev-community distribution; no incentives. Implication (valid): community goodwill in this exact market carries long surveys; a 500–1,500 target for a friendlier instrument is conservative.

## Valid source 3 — Tester testimony (qualitative, n=2)

"Heavy, not interactive/quick" · "duplicates can merge" · "tools should be grouped by type" · "late questions more interesting than early ones." Consistent with the literature (burden, primacy, pacing) — treated as convergent qualitative signal, not measurement.

## Valid source 4 — Literature benchmarks (external)

- In-survey dropout expectation: ~10% + ~2%/100 items (Hoerger) → **~11% at 31 screens, ~10.8% at 40**
- Mobile breakoff 2.6–12× desktop (Mavletova/Couper) → design mobile-first regardless of measured split
- 5–10 min surveys sustain 60–75% completion; >20 min collapses (benchmarks)

## Hypotheses (replace all former "baselines")

| ID | Hypothesis | Basis | Measured at launch by |
|---|---|---|---|
| H-1 | Entry (landing→start) is the dominant loss point | first principles (funnel logic) + tester fatigue testimony + stateofdev precedent | start rate, wall pass rate |
| H-2 | Completion of starters ≈ 89–95% at ~31–40 screens | Hoerger formula | completion of starters |
| H-3 | Section-save pause and topic transitions are the main in-survey friction points | M5 anecdote + ML breakoff literature | section survival, rage density |
| H-4 | Community framing beats neutral framing at the door | MENA collectivism plausibility (no RCT exists) | the launch A/B |
| H-5 | In-app browsers underperform at the captcha wall | M3/M5 anecdotes | start rate by browser class |

**Launch-day obligation:** instrument first (test-account filters, dev capture gated), then the H-table converts to the baseline table of `phase-6` — with real numbers, replacing this document's hypotheses one by one.

*Status: clean re-baseline complete. Corpus order: phases 0v2 → 7 (retrospective) → errata → 1–6 (with quarantine banners where affected).*
