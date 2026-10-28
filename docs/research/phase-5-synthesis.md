# Phase 5 — Synthesis: The Intervention Roadmap

> WARNING: **REVISED BASIS** — the "start is the leak" priority is now hypothesis H-1 (see `phase-0-baseline-v2.md`), not a measurement. Interventions and their literature citations stand; the 1.1 save-pause item is judgment-backed, not data-backed. See `errata.md`.

Capstone of the research program (phases 0–4). Every intervention below is traceable to a cited finding in the phase docs. Ranked, constraint-checked, and sequenced. **Nothing here is implemented — this is the plan of record.**

## The objective, restated with data

Phase 0 measured the problem: completion among starters is 100% (n=4, twice observed); the leak is **entry** (landing→start 37.5%; the wall eats a third of those who try). Therefore: **start-rate interventions outrank completion interventions**, and completion work is *insurance for scale* (mobile breakoff runs 2.6–12× desktop — Mavletova/Couper — so the day traffic grows, in-survey friction starts to bite).

## Constraints (checked against every row)

A. Full anonymity — no accounts, no identity↔answer linkage, ever.
B. Zero budget — no monetary incentives, no paid distribution.
C. **Positional question IDs freeze at launch** — all content restructuring must land before respondent #1.
D. Sensitive-block protections are immutable (never *how*, never *which org*).
E. English question text year-1 (plain-language mandate applies).
F. No dev/bypass machinery in tracked code (established policy).

## The roadmap

### Wave 0 — content freeze (deadline-driven, before launch)
*Constraint C makes this the only time-critical wave.*

| # | Intervention | Evidence | Status |
|---|---|---|---|
| 0.1 | Finish trim: community merges (14→12) + section swap (Tools before Work) | Ph1 RQ1.3 (transition spikes), testers | [in progress] in progress, uncommitted |
| 0.2 | Freeze "no Likert-agreement questions ever" as content rule | Ph3 RQ3.4 (ORs 2.3–2.9) | rule adopted |
| 0.3 | Keep 5–7-option labeled scales; PTS only on genuinely sensitive items | Ph1 RQ1.4 | already true → freeze |
| 0.4 | Demographics-first + per-section saves = partial-response recovery | Ph1 RQ1.5 + SO recovery rule | already true → freeze as feature |

### Wave 1 — pre-launch UX (ride on the trim branch)

| # | Intervention | Evidence | Expected direction |
|---|---|---|---|
| 1.1 | **Save-pause fix** (the Phase-0 rage source: 12 rage clicks on section saves) | own paradata | kills the one measured in-survey friction |
| 1.2 | **Answered-count progress** ("12 / 31"), monotonic, never % | Ph1 RQ1.1–1.2 + Ph2 RQ2.6 (decelerating > linear; % lies under branching) | momentum without lying; effect size honestly unquantified for surveys |
| 1.3 | **Anonymity micro-badge on the sensitive block** | Ph1 RQ1.6 (meta, N=125,672: disclosure ↑ on sensitive items) | more honest flaw-block answers |
| 1.4 | Tone pass: casual-terminal everywhere, **deliberately formal at sensitive block** | Ph2 RQ2.3 (casual→quality; formal→credibility) | the tone shift is the signal |
| 1.5 | Error copy = problem+solution, zero blame/humor | Ph2 RQ2.7 (NN/g) | fewer abandons at friction moments |
| 1.6 | Verify compacted rows ≥44px on 390px viewport | Ph2 RQ2.5 (15%→3% tap error) | QA gate, not redesign |
| 1.7 | Landing = one small ask; move every gram of friction off the door | Ph1 RQ1.7 (FITD 22→53%; large first request *worse than nothing*) | attacks the measured 37.5% leak |
| 1.8 | Android in-app-browser captcha QA pass (the 8-reload rage user; `iabjs://` cohort) | Ph2 OQ-1 closure | recovers wall victims |

### Wave 2 — launch machinery (must be live before day 1)

| # | Intervention | Evidence |
|---|---|---|
| 2.1 | Funnel events (`survey_started`, `section_completed`, `survey_completed` + friction events) — the instrument that makes Wave 3 measurable | program-wide dependency |
| 2.2 | Guaranteed reciprocity: concrete open-data promise everywhere ("results published as open data at stateofsec.ma") | Ph1 (small-guaranteed > lottery) + Ph4 Devographics model |
| 2.3 | Distribution cadence D−3 / D0 / D3 / D7 / D14 over a 2–3 week field | Ph4 playbook |
| 2.4 | **Darija-first outreach assets** (stories, share texts, partner pack: ready-made posts for GeeksBlaBla, clubs, CTF teams) | Ph3 RQ3.6 two-layer architecture |
| 2.5 | Community-champion peer nudge on D7 (native channels) | Ph4 playbook + Ph3 collectivism |

### Wave 3 — launch-window experiments (cheap, our traffic can support)

| # | Experiment | Why ours |
|---|---|---|
| 3.1 | Landing CTA A/B: community framing ("help map Morocco's security scene") vs neutral | Ph3 declared gap → we test it ourselves |
| 3.2 | Start-rate by browser class (in-app vs real browser) — the wall victim detector | Ph2 OQ-1 |
| 3.3 | Section-level dropoff watch vs Hoerger benchmark (~11% expected in-survey loss at ~31 screens) | Ph1 RQ1.3 |

### Year 2 (data-gated)

- Language expansion decision (FR/AR survey text) — gated on Wave-3 bounce-cohort analysis; transcreate, never translate (Ph3 RQ3.3).
- "What happened with 2026's answers" impact section — future response rates depend on visible impact (Ph4).
- Report limitations section in Devographics bias-honesty style (Ph4).

## The rejected list (equally important, all cited)

| Rejected | Reason | Source |
|---|---|---|
| Auto-advance on selection | WCAG violation, misclick lock-in on long lists, no proven completion lift | Ph2 RQ2.2 |
| Gamification mechanics (points/badges/timers) | Mixed evidence, reward-mechanics *increase* satisficing, novelty decays; the "+10–30%" figure retracted as vendor-origin | Ph2 RQ2.4 |
| Fake endowed-progress (pre-filled bar) | No survey replication + honesty risk | Ph1 RQ1.1 |
| Likert agree/disagree batteries | Acquiescence amplifier in MENA samples | Ph3 RQ3.4 |
| Justifying length via Stack Overflow | 103Q = brand luxury, not method | Ph4 RQ4.2 |
| Linking analytics identity to answers | Violates constraint A — permanently | program rule |

## The measurement contract (hands to Phase 6)

- **North star:** completed responses (target 500–1,500 = conservative vs stateofdev's 2,315 @ 60 flat).
- **Start rate** (landing→survey): baseline 37.5% — the number Waves 1.7/1.8/3.1/3.2 exist to move.
- **Completion of starters:** baseline 100% (n=4) — defend ≥ ~89% (Hoerger-implied) as traffic scales.
- **Wall loss rate** (before-start→survey): baseline 33% incl. artifacts — true wall victims tracked by 3.2.

*Status: Phase 5 complete. Next (final): Phase 6 — validation design: metric definitions, the funnel-event spec, A/B mechanics at our traffic scale, and the pre-launch QA checklist (44px, in-app browsers, honest duration copy).*
