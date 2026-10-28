# Phase 1 — Completion Psychology (academic core)

Research-only pass. Every claim carries its source; effect sizes reported where the literature provides them. Verdicts map findings to stateofsec.ma decisions. Companion to `phase-0-baseline.md`.

## RQ1.1 — Goal gradient & endowed progress

**Finding.** Hull (1932/34): effort accelerates as reward nears. Nunes & Drèze (2006), car-wash field experiment (n=300): a 10-stamp card with 2 pre-stamped ("endowed") stamps vs an 8-stamp card — identical remaining effort — completed at **34% vs 19%** (≈ +15pp, 1.8×). Kivetz, Urminsky & Zheng (2006), coffee-card + song-rating field data: inter-action intervals shrink ~20% approaching the reward; pace resets after reward.
**Caveat.** No peer-reviewed replication of the endowed-progress paradigm *inside a web questionnaire* was found — transfer to surveys is an inference, not a demonstrated result.
**Verdict for us.** Supported enough to act: a per-question progress indicator that visibly moves on *every* tap (and never stalls early) is our translation. Do not fabricate head-start progress (dishonesty risk if noticed); instead make early progress *feel fast* (Profile is 7 short questions — count questions answered, not time).
Sources: [Urminsky/Kivetz PDF](https://home.uchicago.edu/ourminsky/Goal-Gradient_Illusionary_Goal_Progress.pdf) · [Columbia summary](https://business.columbia.edu/faculty/research/goal-gradient-hypothesis-resurrected-purchase-acceleration-illusionary-goal)

## RQ1.2 — Progress indicators (when they hurt)

**Finding.** Yan, Conrad, Tourangeau & Couper (2007) + Conrad et al. (2010), two online experiments: progress feedback that *lags expectations* raises abandonment and worsens perceived experience; feedback aligned with or ahead of expectations helps; *intermittent* feedback mitigates the discouragement of slow early signals.
**Verdict for us.** Our 6-axis section bar moves once per ~5–7 questions — slow early feedback by construction. Add question-level progress; ensure the indicator's pace never contradicts the promised duration (also fixes the honest "8 minutes" copy problem from Phase 0).
Sources: [PMC2910434](https://pmc.ncbi.nlm.nih.gov/articles/PMC2910434/)

## RQ1.3 — What predicts breakoff

**Finding.** Peytchev (2009, POQ): more questions per page, sliders, and open-ended items raise breakoff; respondent education lowers it. ML follow-ups (Liu 2022 thesis; 2020+ classifiers): **mobile devices show elevated breakoff hazard**; risk spikes at **topic transitions** and **early open-ended questions**. Baseline dropout arithmetic (Hoerger 2010): web surveys lose ~**10% immediately + ~2% per 100 items**.
**Verdict for us.** (a) Our per-screen paging and zero-slider, no-open-ended design is validated. (b) Topic-transition spikes → the section swap + Rootie/section-title micro-moments have a *breakoff rationale*, not just delight. (c) Benchmark: at ~31 post-trim screens we should *expect* roughly 10–11% in-survey loss; if PostHog shows more, something specific is wrong. (d) Mobile hazard + our 67% mobile traffic = every ergonomics decision in Phase 2 doubles as breakoff defense.
Sources: [Peytchev 2009](https://academic.oup.com/poq/article-abstract/73/1/74/1868871) · [Liu 2022 thesis](https://pure.manchester.ac.uk/ws/portalfiles/portal/261213740/FULL_TEXT.PDF) · [Hoerger 2010](https://pmc.ncbi.nlm.nih.gov/articles/PMC4367493/)

## RQ1.4 — Scales, options, satisficing

**Finding.** Krosnick (1991) + Krosnick & Presser synthesis: **5–7 response categories** optimize reliability/validity; >7–9 raises burden and satisficing; 2–3 loses variance. Explicit **don't-know options increase non-substantive answers without validity gains** (Schuman & Presser 1981; Krosnick et al. 2002); midpoints act as satisficer magnets.
**Verdict for us.** Our rating-style questions (maturity, law perception, job satisfaction, AI-replace) sit at 5–6 options [ok]. Our long lists are *nominal choices*, not rating scales — but the same burden logic drove the trim (22→16 salary, tools→categories). Keep "Prefer not to say" **only on genuinely sensitive items** (income, flaw block) — never as a blanket escape hatch; keep "Not sure" only where genuine ignorance is a real state (AI-replace). Already true; now it's policy with citations.
Sources: [Krosnick 1991](https://web.stanford.edu/dept/communication/faculty/krosnick/docs/1991/1991%20Satisficing.pdf) · [Krosnick 1997 scales](https://web.stanford.edu/dept/communication/faculty/krosnick/docs/1997/1997%20Designing%20rating%20scales%20for%20effective%20measurement%20in%20surveys.pdf)

## RQ1.5 — Question order: the doctrine partially overturned

**Finding.** Dillman (TDM) & Sudman & Bradburn: easy/non-threatening first, sensitive late — doctrine for decades. **But** recent evidence (Shift Project / HKS, 2025): placing **demographics early produces no breakoff penalty** in web surveys and captures demographic data from *partial* dropouts (huge for analysis). Ganassali (2008, 8 randomized questionnaire versions + server logs): sequencing directly dictates attrition points. Sensitive-late remains sound for *accuracy* (early sensitive → cognitive burden; very late → fatigue satisficing): mid-to-late-but-not-last is the honest summary.
**Verdict for us.** Our structure — Profile (easy demographics) first, flaw-block second-to-last section, community last — matches the *corrected* doctrine almost exactly. Keep as-is; record that partial-respondent demographics are recoverable *because* Profile is first (our per-section Firestore saves already do this — the frozen-session design accidentally anticipated the 2025 finding).
Sources: [Shift Project/HKS](https://shift.hks.harvard.edu/dont-save-the-demographics-for-last/) · [Ganassali 2008](https://www.researchgate.net/publication/264138574_The_Influence_of_the_Design_of_Web_Survey_Questionnaires_on_the_Quality_of_Responses)

## RQ1.6 — Anonymity perception & disclosure

**Finding.** Joinson (1999): web + anonymous ⇒ lowest social desirability, highest disclosure. Gnambs & Kaspar (2015) meta-analysis (**460 effect sizes, N=125,672**): self-administered computerized surveys elicit **significantly more reporting of sensitive/undesirable behaviors**, strongest for *highly sensitive* items. Gnambs & Kaspar (2017): effects are topic-specific — general candor isn't guaranteed, it must be cued.
**Verdict for us.** The flaw-disclosure block is exactly the "highly sensitive" category the meta-analysis covers — an anonymity micro-badge *at the block* is evidence-backed, not decoration. Wording cue matters: "anonymous, published in aggregate, nothing identifying stored" — specific, not generic privacy boilerplate.
Sources: [Gnambs & Kaspar 2015](https://www.researchgate.net/publication/282653453_A_Meta-Analysis_of_Breakoff_Rates_in_Mobile_Web_Surveys) (disclosure meta via same program of research) · [Joinson 1999 lineage]

## RQ1.7 — Commitment devices & incentives

**Finding.** FITD: Freedman & Fraser (1966) small-then-large request lifted compliance **22%→53%**; Snyder & Cunningham (1975): small prior survey → .519 later compliance vs .333 control — and a *large* prior request (.219) did **worse than nothing**. Implementation intentions: powerful in goal domains, mixed for low-stakes scheduling. Incentives: small **guaranteed** rewards beat actarially larger lotteries (Dykema et al. 2023: $5 guaranteed > $100–500 lottery).
**Verdict for us.** (a) Our funnel is FITD-shaped; the lesson is the landing page is the "small request" — it must be *small* (one tap, no wall). The captcha wall mid-door risks the "large first request" penalty. (b) We have no budget → our "guaranteed reward" is the **open report itself**: promise it concretely ("results published as open data at stateofsec.ma") — a guaranteed, non-lottery reciprocity token. (c) Implementation intentions: skip — no evidence fit for anonymous one-shot surveys.
Sources: [Freedman & Fraser](https://pubmed.ncbi.nlm.nih.gov/1117412/) · [Dykema 2023 via UWSC](https://uwsc.wisc.edu/thinking-about-using-a-lottery-to-increase-your-response-rate-new-uwsc-research-shows-a-gift-card-for-a-small-amount-is-more-effective/)

---

## Phase-1 scorecard for stateofsec.ma

| # | Intervention | Evidence strength | Pre-launch? |
|---|---|---|---|
| 1 | Question-level progress that never stalls early | Strong (field exp. + direct indicator experiments) | [X] |
| 2 | Anonymity badge at the sensitive block | Strong (meta-analysis, N=125k) | [X] |
| 3 | Keep 5–7-option rating scales; targeted PTS only | Strong | [X] (already true — freeze it) |
| 4 | Demographics-first structure | Moderate→Strong (2025 experiment) | [X] (already true) |
| 5 | Topic-transition smoothing (swap + micro-moments) | Moderate (ML breakoff spikes) | [X] with trim |
| 6 | Landing = one small ask; move friction off the door | Strong (FITD numbers) | [X] copy-level |
| 7 | Guaranteed reciprocity: concrete open-data promise | Moderate (incentive analogy) | [X] copy-level |
| — | Endowed/fake progress head-start | Weak transfer to surveys + honesty risk | [rejected] rejected |

**Benchmark to carry into Phase 6:** expected in-survey loss ≈ 10% + ~2%/100 items (Hoerger) → ~11% at 31 screens. Completion *below* ~85% of starters post-launch signals a fixable in-survey problem, not fate.

*Status: Phase 1 complete. Next: Phase 2 — UI/UX mechanics (paging, auto-advance, persona, gamification meta-analyses, mobile ergonomics).*
