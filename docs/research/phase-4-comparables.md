# Phase 4 — Comparable Surveys Teardown

Research-only pass. Companion to phases 0–3. Four comparables: Devographics (State of JS family), Stack Overflow, **stateofdev.ma (measured locally from `upstream/master` — our most important benchmark)**, and security-industry surveys. Plus a distribution playbook.

## RQ4.1 — Devographics / State of JS

**Findings.** Current surveys run **15–20 minutes**; the 2016 inaugural had **89 questions**. **Every question is optional** (skippable) — their core anti-dropout mechanism. **No monetary incentives ever**: motivation = community goodwill + **open public datasets/reports** (the results *are* the reward). Response volumes: historical single-survey peaks ~20k; modern per-survey **5,000–10,000**. Section-level completion can reach **95.8%** (TokyoDev 2022 module). Sampling bias is publicly acknowledged (open-web distribution captures early adopters; Greif's "Hype & Garbage" retrospectives) — treated as a known limitation, triangulated with download/star data. Design evolves via **open GitHub issues + working group**, balancing continuity (longitudinal questions) with relevance.
**Verdicts for us.** (a) The "open data as the incentive" model is exactly our plan — validated at 5–10k scale with zero budget. (b) All-optional is *their* answer to dropoff; ours is branching + required-core (we need the cross-tab spine) — both are defensible, but their existence proof says: if a question's answer is never published, don't make it required. (c) Their bias honesty = a template for our report's limitations section (self-selected sample, network-reachable security people).
Sources: [How Devographics surveys are run](https://dev.to/sachagreif/how-the-devographics-surveys-are-run-2023-edition-1p6a) · [Track-record retrospective](https://dev.to/sachagreif/hype-garbage-an-honest-look-at-the-state-of-javascript-surveys-track-record-3p5g) · [Outreach & diversity report](https://dev.to/sachagreif/state-of-js-2024-outreach-and-diversity-report-n0e)

## RQ4.2 — Stack Overflow Developer Survey

**Findings.** 2026: **103 questions**, 5 categories; **30,903 valid** responses (39,266 raw, 169 countries, ~6-week field). **No monetary incentives** — distribution via own properties + opt-in email. Validity pipeline: Qualtrics quality fields (reCAPTCHA, straightlining, duration) + a **recovery rule**: any response answering the 10 core fielding questions (country, compensation, languages, etc.) is kept even if flagged.
**Verdicts.** (a) 103 questions ≫ the 5–10-min sweet spot — SO succeeds on brand gravity + a captive audience; *we do not have that luxury; their length is not a precedent, it's a warning with a budget*. (b) The **10-core-questions recovery rule** is the industrial version of our Profile-first + per-section saves — partials still yield analyzable rows. Freeze our per-section persistence as a data-recovery feature (matches Phase-1's demographics-early finding). (c) Their bot/quality filtering mirrors our captcha + soon server-side validation — we're aligned.
Sources: [SO 2026 methodology](https://survey.stackoverflow.co/2026/methodology) · [results post](https://stackoverflow.blog/2026/10/06/the-results-of-the-2026-developer-survey-are-here/)

## RQ4.3 — stateofdev.ma (measured, not blogged)

**Measured from `upstream/master` (local git):**

| Section | Questions |
|---|---|
| profile | 9 |
| learning-and-education | 5 |
| work | 15 |
| ai | 7 |
| tech | 17 |
| community | 7 |
| **Total** | **60** |

Plus prior calibration work: **~9,448 respondents over 5 editions, 2,315 in 2024**, one screen-flow, no incentives, Moroccan dev community distribution (GeeksBlaBla channels, French/Darija-adjacent outreach).
**Verdicts.** (a) The direct comp: a **60-question, unbranched, Morocco-only survey** still collects **2,315/yr** — community goodwill in this exact market carries long surveys. (b) Our redesigned instrument is strictly friendlier: **53 questions on file but 22–47 per respondent (median ~40, trim pending → ~30)**, branched, mobile-first — every respondent reads far fewer options than any stateofdev edition. If they hit 2.3k at 60 flat, our target band for year 1 (500–1,500 responses) is conservative and achievable. (c) Their per-year growth curve (published yearly since 2020) is the expectation-setting template for our report.
Source: `git show upstream/master:survey/*.yml` (this repo's upstream remote) + prior session calibration notes.

## RQ4.4 — Security-industry surveys (sensitive-question handling)

**Findings.** ISC2 Workforce Study: n>14,000 global, modeled estimates layered on survey data. SANS domain surveys: **~400–500 qualified respondents** per study — our realistic scale peer. HackerOne hacker surveys: **~1,800 active hackers**. Sensitive/legally-ambiguous behavior is never asked raw: it is **anchored in safe-harbor framings** (authorized programs, CVD guidelines, platform codes of conduct); platform surveys ask about *professional challenges and barriers*, not admissions; anonymity/pseudonymity is structural (identity handled separately from responses).
**Verdicts.** Our flaw-disclosure block already follows the industry pattern to the letter: questions scoped to *"noticed while simply using a service"* (user role, not attacker role), bug-bounty/VDP framing for paid work, never asking *how* or *which organization* (our standing rule), "Prefer not to say" present, anonymity structural (anonymous session, no IDs in analysis). The before-start explainer sentence for under-18s is exactly the safe-harbor anchoring move. Frozen — and now citable as industry-standard practice, which matters for the report's credibility section.
Sources: [ISC2 study](https://cybergovernancealliance.org/wp-content/uploads/2024/01/ISC2_Cybersecurity_Workforce_Study_2023-1.pdf) · [SANS CTI 2026](https://www.sans.org/research/cyber-threat-intelligence-report) · [HackerOne disclosure guidelines](https://www.hackerone.com/terms/disclosure-guidelines)

## Bonus — Distribution playbook (community survey growth)

**Findings** (field-tested cadence, 2–3 week window): **Pre-notice (D−3)** "why this matters" → **Launch (D0)** CTA + honest time estimate + deadline → **Value reminder (D3)** → **Peer nudge (D7)** via a community champion in native channels (Discord/WhatsApp) → **Final call (D14)** with stakes + closing date. Partner assets: pre-written post templates + co-branded graphics remove friction for allies (GeeksBlaBla, campus clubs, CTF teams). Visible impact of *past* results drives *future* response rates — year-2 growth depends on publishing year-1 impact.
**Verdict.** Adopt verbatim for launch: 2–3 week field, D−3/D0/D3/D7/D14 touches, partner asset pack (this is where the Darija-first outreach from Phase 3 gets deployed), and a "what happened with last year's answers" section in the 2027 edition.
Source: [SNA response-rate playbook](https://visiblenetworklabs.com/2025/09/22/boosting-response-rates-for-sna-surveys-scripts-cadence-incentives/)

## Phase-4 scorecard

| # | Decision | Source |
|---|---|---|
| 1 | Open dataset/report as THE incentive (no prizes) | Devographics at 5–10k scale |
| 2 | Per-section saves = partial-response recovery (SO-style) | Stack Overflow recovery rule |
| 3 | Year-1 target 500–1,500 = conservative vs stateofdev's 2.3k @ 60 flat questions | measured upstream |
| 4 | Sensitive block framing frozen as industry-standard safe-harbor | SANS/HackerOne practice |
| 5 | Launch cadence D−3/D0/D3/D7/D14 + partner asset pack + Darija-first copy | field playbook + Phase 3 |
| 6 | Report limitations section in the Devographics bias-honesty style | Greif retrospectives |
| 7 | Never justify length with "Stack Overflow does it" | 103Q = brand luxury we lack |

*Status: Phase 4 complete. Next: Phase 5 — synthesis: merge all findings into one ranked, constraint-checked intervention roadmap.*
