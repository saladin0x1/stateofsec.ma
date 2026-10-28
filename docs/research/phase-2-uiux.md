# Phase 2 — UI/UX Mechanics

> WARNING: **PARTIAL QUARANTINE** — literature findings below stand; the "OQ-1 closed" section is downgraded to anecdote (QA-contaminated paradata). See `errata.md`.

Research-only pass. Companion to `phase-0-baseline.md` / `phase-1-psychology.md`. Includes a correction to a Phase-2-preview claim (gamification) and closes Phase-0 open question OQ-1 with our own replay data.

## RQ2.1 — Paging vs scrolling vs grids

**Finding.** Toepoel, Das & van Soest (2009; 1/4/10/40 items per screen): item nonresponse **rises with items-per-screen**; scrolling is faster but liked less. Couper, Tourangeau & Conrad (grids): item-missing **26.6% (grid) vs 8.5% (item-by-item)**. Mavletova & Couper (2014/15): **mobile breakoff 2.6–12× desktop**, mobile completion time 1.5–3× longer; grids compound both.
**Verdict.** Our one-question-per-screen, zero-grid design is the evidence-maximal layout — validated, frozen. The mobile breakoff multiplier + our 67% mobile traffic means *every screen saved matters most on phones* (the trim is a mobile intervention first).

## RQ2.2 — Auto-advance on selection

**Finding.** The honest literature is thin and cautionary: Tilburg multi-device studies flag elevated measurement error and fat-finger lock-in (selection submits before the list is scanned); platform accessibility docs class auto-advance as **WCAG-non-compliant** (focus moves without user command — disorients screen-reader/keyboard users); last-question auto-submit creates anxiety; long option lists amplify misclick cost. **No peer-reviewed completion-lift isolation found** — benefits are vendor claims for short mobile screens.
**Verdict — REJECTED** (overriding my own earlier enthusiasm): our lists are long, we have soft-check interactions, and we promise accessibility. The *motive* behind auto-advance (tap thrift) is served instead by: instant visual selection feedback, a fast Next, and killing the section-save pause (Phase 0's rage-click source).

## RQ2.3 — Persona / conversational tone

**Finding.** Kim et al. (CHI 2019, 2×2 platform × style): chat platform + **casual style → less satisficing, more differentiated answers**; casual tone alone (on a form) did nothing — interactivity and tone must combine. Follow-ons: conversational formats show higher completion/stickiness (~54% vs ~24% in comparative settings); **formal tone increases credibility for sensitive topics**.
**Verdict.** Our terminal persona is a mild conversational frame, not a chatbot — take the transferable part: **casual-terminal voice in normal sections; neutral-formal voice exactly at the flaw-disclosure block.** The tone *shift* itself signals "now this is serious" — a feature, not inconsistency.

## RQ2.4 — Gamification

**Finding.** Academic record is **mixed** (Cechanowicz 2013; Harms 2015): sometimes more time/enjoyment, sometimes *lower* initial response; reward-per-answer mechanics **increase** satisficing (rush-to-harvest); novelty decay is well documented (Hamari/Koivisto line). **No survey-specific meta-analysis exists.**
**Correction logged:** the "+10–30% completion" figure I quoted in the earlier synthesis came from a vendor blog and is **not academically supported**. Retracted.
**Verdict.** No points/badges/timers — ever. Delight is allowed only where it can't distort answers (section transitions, thanks page). Data integrity > engagement theatre.

## RQ2.5 — Touch ergonomics (mobile)

**Finding.** Targets: Apple HIG 44pt / Material 48dp / WCAG 2.5.5 AAA 44px (2.5.8 AA floor 24px). Tap error ≈ **15% at 24px → 3% at 44px**. Hoober: ~49% one-handed thumb use; bottom-center = green zone; edges = precision floor.
**Verdict + flag.** Sticky bottom Next [ok] sits in the green zone; whole-row tappable choices [ok]. **Flag carried to implementation review:** this session's row compaction (`py-2.5` + `text-sm`) must keep effective row height ≥44px — check on a 390px viewport before launch (doc-level note; no code touched here).

## RQ2.6 — Progress bar shape

**Finding.** Decelerating bars (fast early, slowing later) beat linear, which beats accelerating — 32-experiment summary (Irrational Labs) + Gronier & Baudet (2019) satisfaction data. Percentage display helps, **but branching skip-logic makes raw percentages jump**, and jumpy progress degrades trust (Qualtrics guidance).
**Verdict.** Use **answered-questions count** ("12 / 31" style): monotonic — can only go up, never lies — and naturally fast early (Profile's 7 quick ones front-load momentum = the honest version of endowed progress from Phase 1). Never show `% of total`: our denominator is path-dependent and would jitter.

## RQ2.7 — Microcopy & tone

**Finding.** NN/g: errors as `[problem] + [solution]`, never blame words ("invalid/illegal"); humor **out** of error states (Mailchimp-contention confirmed); direct beats over-polite for clarity (2025 tone study); plain language specifically improves data quality for **non-native speakers and lower-literacy respondents** (Bauer et al. 2025).
**Verdict.** Morocco angle makes the plain-language finding load-bearing: many respondents are FR/AR-first answering in EN. Question text stays plain (already true); error/validation copy gets the problem+solution treatment; personality lives in chrome (banner, steps, thanks), never in errors.

## OQ-1 closed — who dies at the before-start wall (our data)

All 8 `/before-start` sessions decoded from PostHog paradata:

| Session | Outcome | Read |
|---|---|---|
| 4 sessions | started (2 after 1–2 views) | wall passable |
| 1 session | 15 clicks, never started | our own localhost testing (Oct 22, matches the 3 `Script error` exceptions) — **test artifact, not a user** |
| 1 session | 1 click, left | instant curiosity bounce — no wall contact |
| **1 session** | **8 page views, 22 clicks, 2 rage clicks, never started** | **the wall victim: retried 8×, raged twice, gave up** |

**Conclusions.** (a) Phase 0's "2/6 lost at the wall" over-counted: one loss was our own test session, one an instant bounce — the *real* wall leak is the single rage-retrier. (b) That profile (repeat reloads + rage on a captcha page) matches Turnstile silently failing on specific mobile browsers — and our error tracker already caught the Android **in-app browser** cohort (`iabjs://`). Cross-link: captcha-wall testing on Android in-app browsers (WhatsApp/Instagram links!) goes on the pre-launch QA checklist — Phase 6 will define it as a metric (start-rate by browser class).

## Phase-2 scorecard

| # | Decision | Direction |
|---|---|---|
| 1 | One-per-screen, no grids | [X] keep (strongest evidence in the file) |
| 2 | Auto-advance | [rejected] **rejected** (accessibility + misclick + no proven lift) |
| 3 | Tone: casual-terminal → formal at sensitive block | [X] adopt |
| 4 | Gamification mechanics | [rejected] rejected (data-quality risk; vendor claims retracted) |
| 5 | Progress: answered-count, never %, no fake head-start | [X] adopt |
| 6 | ≥44px touch rows post-compaction | WARNING: verify at launch QA |
| 7 | Errors: problem+solution, zero blame/humor | [X] adopt |
| 8 | Android in-app-browser captcha QA + start-rate-by-browser metric | [X] → Phase 6 |

*Status: Phase 2 complete. Next: Phase 3 — Morocco/MENA cultural layer (Arab Barometer methods, HCP practice, survey-language effects, social desirability, collectivist framing).*
