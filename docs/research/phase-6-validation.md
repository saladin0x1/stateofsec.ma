# Phase 6 — Validation Design (final)

> WARNING: **BASELINES VOID** — the "Baseline (Ph0)" column below is quarantined QA data; treat every entry as *none — collect at launch*. Targets and alarm thresholds stand (literature-derived). See `errata.md` and `phase-0-baseline-v2.md`.

Closes the research program: metric definitions, the funnel-event specification, A/B mechanics at our traffic scale, pre-launch QA gates, and decision rules. Specs only — implementation is separate work (and stays outside this research loop).

## 1. Event specification (the instrument)

**Client-side (PostHog, consent-gated — declined users invisible here by design):**

| Event | Properties (never answer values) |
|---|---|
| `captcha_completed` / `captcha_failed` | error code |
| `survey_started` | — (first NEXT on question 1) |
| `section_completed` | section label, `duration_ms` |
| `soft_check_shown` / `soft_check_confirmed` | question id |
| `validation_error_shown` | question id, error kind |
| `question_back` | section label |
| `question_skipped` | question id |
| `survey_completed` | total `duration_ms`, questions answered count |

**Server-side (operational, consent-independent — legitimate monitoring, not user tracking):** `session_init_succeeded/failed {reason}`, `submit_succeeded/failed {section}` keyed by the anonymous session id.

**Identity rule (constraint A):** server session id and PostHog distinct id are **never joined**. Two lenses on the same funnel, no linkage to answers.

**Hygiene gates:** no analytics init when `import.meta.env.DEV` (Phase-0 test artifacts polluted before-start counts); our own devices in the test-account cohort.

## 2. Metric definitions

| Metric | Definition | Baseline (Ph0) | Target / alarm |
|---|---|---|---|
| **Completed responses** | Firestore submissions (server, exact) | 4 (test) | 500–1,500 (field total) |
| Start rate | `survey_started` persons ÷ landing persons | 37.5% | ≥50% post-interventions |
| Wall pass rate | `survey_started` ÷ before-start persons | ~67% (artifacts included) | ≥80%; **<70% on in-app browsers → Turnstile escalation** |
| Section survival | `section_completed(n+1)` ÷ `section_completed(n)` | unmeasured | per-section ≥95% |
| Completion of starters | `survey_completed` ÷ `survey_started` | 100% (n=4) | **≥89%** (Hoerger-implied floor at ~31 screens); <85% week-1 → section-level investigation |
| Rage density | `$rageclick` per survey screen | 12/5 sessions | trend to ~0 post save-pause fix |
| Duration | median active time to complete | ~9.4 min (n=1) | within ±20% of the promised copy |

## 3. A/B mechanics at our traffic scale

Reality: expected ~1–2k visitors over a 2–3-week field; completions 500–1,500. Binary-outcome math (two proportions, α=.05, power .80), baseline start rate 37.5%:

| Effect we could detect | n per arm | Feasible? |
|---|---|---|
| +12.5pp (37.5→50%) | ≈170 | [X] within week 1 |
| +7.5pp (37.5→45%) | ≈450 | [partial] only over the full field |

**Rules that follow:**
1. **One experiment per field period** — the landing framing A/B (community vs neutral CTA). Everything else ships as a fixed intervention.
2. 50/50 split, randomized at landing (no accounts: session-cookie arm assignment).
3. **Pre-registered decision rule:** primary metric = start rate; interim peek at D7 (stop only for a ≥12.5pp lead), final decision at D14; winner locked, loser archived with data.
4. Effects smaller than ~8pp are **below our resolution** — don't run experiments hoping to see them; ship them as judgment calls instead.
5. PostHog experiments or a simple cookie flag both work; no new infra.

## 4. Pre-launch QA gates (blocking checklist)

*Every item traces to a phase finding.*

- [ ] **Content freeze**: trim complete (Wave 0); model-check re-proves DAG; Playwright personas re-walk
- [ ] **Touch targets**: compacted choice rows ≥44px effective height at 390px viewport (Ph2)
- [ ] **Captcha wall**: manual pass on Android in-app browsers (WhatsApp + Instagram links), iOS Safari, desktop — the 8-reload rage user is the failure persona (Ph2/OQ-1)
- [ ] **Honest duration copy**: recompute median post-trim; update `/before-start` and thanks share text (Ph1 — expectation-lagging progress causes abandonment)
- [ ] **Sensitive block**: anonymity badge present, formal tone, skip affordance, PTS options (Ph1/Ph2/Ph4)
- [ ] **Instrumentation**: client events fire post-consent, server events fire for all, `survey_completed` set as web-analytics conversion goal, dev capture gated off
- [ ] **Data safety**: Firestore backup/PITR on; SDC export anonymization (random ids, no timestamps) verified on a dry export
- [ ] **Prod config runbook**: `stateofsec.ma` route in wrangler, Firebase authorized domains, prod Turnstile key pair (separate from dev's)
- [ ] **Replay policy**: record 100% until 200+ sessions, then review sampling

## 5. Field-period operating rhythm

D1 / D3 / D7 / D14 snapshots (same cadence as the comms playbook): north star, start rate by browser class, section survival, rage density. Escalation triggers per §2. After field close: data cleaning flags → SDC pass → report with the bias-honesty limitations section (Ph4).

## 6. Honesty ledger — what this program cannot measure

- **Satisficing** (straightlining quality): not instrumented (no per-answer timing telemetry by design — burden & privacy). Mitigated only by structure (short lists, no grids, no Likert).
- **Social desirability bias**: unmeasurable directly; mitigated by design choices (Ph3) and consistent with the anonymity meta-evidence.
- **Language friction**: only a proxy analysis (bounce cohorts by browser language) — never a survey question about the survey.
- **Small-n reality**: every baseline here is n≤16 directional. The plan treats them as hypotheses with priors, not truths.

---

## Research program — complete

| Doc | Subject |
|---|---|
| `phase-0-baseline.md` | our own funnel, devices, rage, wall victims |
| `phase-1-psychology.md` | goal gradient, progress, breakoff, scales, order, anonymity, commitment |
| `phase-2-uiux.md` | layout, auto-advance (rejected), persona, gamification (rejected), touch, progress shape, microcopy |
| `phase-3-mena.md` | Arab Barometer/HCP practice, language architecture, acquiescence, framing gap |
| `phase-4-comparables.md` | Devographics, Stack Overflow, stateofdev measured, security-industry safe harbor, distribution playbook |
| `phase-5-synthesis.md` | the ranked, constraint-checked roadmap |
| `phase-6-validation.md` | this document — measurement, experiments, QA gates |

All findings carry sources; two vendor claims were retracted along the way; four literature gaps were converted into self-experiments. Research loop closed — implementation decisions now have an evidence trail from question to citation.
