# Phase 0 — Baseline: our own evidence

> WARNING: **QUARANTINED** — all PostHog-derived numbers below are QA/test data, ruled invalid as evidence. Kept for archaeology only. Read `phase-0-baseline-v2.md` + `errata.md` for the clean baseline.

Read-only research pass. All numbers from PostHog (project StateOfSec, EU, `dev.stateofsec.ma`, Oct 21–24 2026) unless noted. **n is tiny — treat as directional, not statistical.**

## The funnel (unique persons)

| Step | Persons | Step conversion |
|---|---|---|
| Landing `/` | 16 | — |
| `/before-start` | 6 | **37.5%** ← biggest leak |
| `/survey` (started) | 4 | 66.7% |
| `/thanks` (completed) | 4 | **100%** |

- Overall landing→completion: **25%**.
- **Completion among starters is perfect (4/4, again).** The measured problem is *entry*, not endurance — consistent with the earlier Oujda session (516 taps, 9.4 active min, finished clean).
- One wall sits at before-start→survey (lost 2 of 6): captcha + Firebase sign-in friction is the second leak.

## Devices

- Visitors: **12 mobile (67%) / 6 desktop (33%)**
- Completers: **3 mobile / 1 desktop** — mobile completes at the same rate it visits. No mobile penalty in completion (yet).

## Rage clicks

- **12 of 19 total rage clicks land on `/survey`** (5 sessions!) — the highest friction density on the site.
- All have no element text (`$el_text` null) → they are taps on **non-text areas**: consistent with hammering the **Next button during the section-save pause** (machine is `submitting`, button shows "Loading...") rather than confusion about choices.
- Hypothesis (to verify in Phase 2): the end-of-section save feels like a freeze → users multi-tap. Auto-advance + snappier save feedback directly target this.

## Sessions quirk

`thanks` pageviews appear in 6 sessions vs 5 survey sessions — small-n artifacts (direct visits / redirect tests). Ignore.

## Upstream baseline (stateofdev.ma, from prior calibration work)

- ~9,448 raw respondents over 5 editions; 2,315 in 2024; ~100 under-18s total.
- Their survey length ≈ our current median (40 screens) — and they still pull 2k+/year, proving a motivated niche finishes long surveys. Their funnel/entry numbers are unpublished → not comparable.

## Working conclusions for later phases

1. **Entry is the bottleneck**: landing→start at ~37.5%, and 2/6 lost at the captcha wall. Phases 1–3 should weight *start-rate* interventions ≥ completion interventions.
2. **Save-pause rage** is the one in-survey friction signal we can already see → Phase 2 RQ2.2 (auto-advance) + save feedback evidence now has a local motive.
3. **Mobile-first confirmed** (67% mobile, no completion penalty) — Phase 2 mobile ergonomics priority stands.

## Open questions carried forward

- OQ-1: Does the captcha wall account for both before-start losses, or is it Turnstile-on-mobile latency? (needs a replay watch — Phase 2)
- OQ-2: Which section (if any) shows micro-dropoff at scale? (needs the planned funnel events — Phase 6 dependency)
- OQ-3: Is rage-clicking correlated with eventual completion? (n too small now)

*Status: Phase 0 complete. Next: Phase 1 — completion psychology (academic).*
