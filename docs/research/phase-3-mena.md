# Phase 3 — Morocco / MENA Cultural Layer

Research-only pass. Companion to phases 0–2. Two honest gaps declared upfront: (1) no published study quantifies survey dropout by questionnaire language in Morocco; (2) no MENA RCT isolates community- vs individual-framing on survey response. Where direct evidence is missing, we say so and mark the item for our own Phase-6 testing rather than importing Western findings uncritically.

## RQ3.1 — Arab Barometer in Morocco (the professional benchmark)

**Finding.** Wave VIII (2023–24): n=2,411, ±2pp, all 12 regions; Wave IX (2025): n=1,210, ±3pp. Mode: **face-to-face CAPI only** — online modes deliberately avoided (digital divide). Response rate ~**55%** (Wave V figure). Language practice: questionnaires scripted in Modern Standard Arabic, **interviewers translate orally into Darija** live. Sensitive-topic protocol: physical privacy, full anonymity (no identifiers stored), explicit right to skip/stop.
**Verdict.** Not mode-comparable (door-to-door vs our self-administered web), but two transfers: (a) the *formal-written + dialect-comprehension* layering is the national norm — see RQ3.6; (b) their sensitive-topic protocol (anonymity + skip rights, stated up front) mirrors our before-start list — validated practice, keep.
Sources: [AB methodology](https://www.arabbarometer.org/survey-data/methodology/) · [AB8 Morocco report](https://www.arabbarometer.org/wp-content/uploads/AB8-Morocco-Report-ENG.pdf)

## RQ3.2 — HCP (the official statistical machinery)

**Finding.** ENNVM 2022/23: 18,000 households, year-long collection, CAPI; ENE: ~90,000 households/year. Questionnaires **written in Arabic; oral adaptation into Darija** by trained enumerators. RGPH 2024: Darija spoken daily by **91.9%** of the population; French mastered by **57.7%** of literate persons 10+. Published response rates: absent from public method notes.
**Verdict.** Confirms the two-layer language norm at state scale. The Darija 91.9% / French 57.7% / MSA-fluent ~29% (RQ3.6) numbers become our language-planning baseline.
Sources: [HCP ENNVM](https://www.hcp.ma/Enquete-Nationale-sur-le-Niveau-de-Vie-des-Menages_a96.html) · [HCP ENE](https://www.hcp.ma/Enquete-nationale-sur-l-emploi_a89.html) · [RGPH 2024 results](https://casainvest.ma/sites/default/files/2025-02/R%C3%A9sultats%20du%20RGPH%202024.pdf)

## RQ3.3 — Survey language effects (the honest gap)

**Finding.** No empirical Moroccan (or Maghreb) study quantifies dropout/disclosure by questionnaire language — declared gap. Adjacent evidence: processing in a non-dominant language raises cognitive load (education studies); literal translation produces a stiff bureaucratic register that **pushes respondents toward guarded, socially desirable answers** — the mitigation is *transcreation* (tone + structure adaptation), not translation. Sociolinguistics for our segment: English fluency is rising fastest among under-34 urban tech Moroccans (~17% and climbing; French fading in the same cohort), and our audience (security practitioners) is the most English-exposed slice of the workforce.
**Verdict.** English question text is the right year-1 call **for this audience** — but the plain-language mandate from Phase 2 becomes doubly load-bearing (we are asking many respondents in their L2/L3). Practical adoption: keep questions short and concrete; avoid idioms; transcreate outreach copy rather than translate it. Log language as a candidate explanation if start-rate lags (Phase 6: survey-language perception question? no — observe via bounce cohorts instead; don't add burden).
Sources: [English in Morocco (Cambridge)](https://www.cambridge.org/core/journals/english-today/article/spread-of-english-in-morocco/D2270677337464378D0F8E3EF21E9A7F) · [language shift reporting](https://en.hespress.com/112190-report-french-fades-english-grows-as-morocco-sees-generational-language-shift.html?print)

## RQ3.4 — Acquiescence & extreme responding in Arab-language instruments

**Finding.** Comparative studies: extreme response style **6–29% (Arab samples) vs 2–14%** (comparison); acquiescence **5–19% vs 2–10%**; adjusted odds ratios for extreme responding up to **OR ≈ 2.3–2.9**. Mitigations with consensus: avoid long agree/disagree Likert chains; prefer **item-specific labeled scales** (frequency/evaluation formats); balanced/reversed items help but introduce their own artifacts.
**Verdict — our design is accidentally optimal.** The survey contains *zero* agree/disagree batteries: every question is a nominal choice or an item-specific labeled scale (maturity, law protection, satisfaction, AI-replace — all construct-labeled, not agreement-labeled). Freeze this as an explicit content rule: **no Likert-agreement questions, ever.** Analysis-side warning carried to Phase 5: expect inflated extreme/satisfied tails vs Western benchmarks; compare within-Morocco (and against stateofdev.ma), not against US/EU survey norms.
Sources: [comparative response styles (PubMed)](https://pubmed.ncbi.nlm.nih.gov/20439322/) · [agreement-scale rewrite guidance](https://researchscape.com/blog/rewrite-agreement-scales-to-eliminate-acquiescence)

## RQ3.5 — Collectivist framing (plausible, unproven → test it ourselves)

**Finding.** No RCT on community- vs individual-benefit framing for survey participation in MENA (declared gap). Indirect support: collectivist/communal-solidarity norms (family, Zakat tradition, civic-tech patterns); the strongest *local* pattern is GeeksBlaBla itself — community-first, dialect-based, peer-knowledge framing built the largest Moroccan tech community without formal structure.
**Verdict.** Community framing stays a **hypothesis with cultural plausibility** — and we happen to have the perfect cheap test: Phase-6 A/B on the landing CTA ("Help map Morocco's security community" vs neutral). Don't claim it as fact; measure it.
Sources: [GeeksBlaBla](https://geeksblabla.community/) · [civic participation initiatives](https://civictech.africa/initiative/simsim-participation-citoyenne/)

## RQ3.6 — Darija in the communication stack

**Finding.** Darija: ~94–100% spoken reach, the language of trust/authenticity; MSA fluent ~29%; French = professional/elite register; heavy code-switching is the norm in digital Moroccan tech spaces. GeeksBlaBla/BlaBlaConf demonstrate Darija as the engagement layer for technical content.
**Verdict — a two-layer language architecture** (mirroring HCP/Arab Barometer practice, translated to our medium):
- **Questions & UI: English (plain)** — audience-appropriate, year-1, per RQ3.3.
- **Outreach & community copy: Darija-first (Darija/French mix)** — Instagram stories, share texts, community announcements. This is where the trust language lives; it's also where our start-rate problem (Phase 0) actually sits.
- Later (data-permitting): Darija microcopy on the sensitive block only.
Sources: [GeeksBlaBla](https://geeksblabla.community/) · [BlaBlaConf](https://blablaconf.com/)

## Phase-3 scorecard

| # | Decision | Basis |
|---|---|---|
| 1 | No Likert-agreement questions, ever (item-specific scales only) | Strong (ERS/acquiescence data, ORs 2.3–2.9) |
| 2 | Analysis norm: compare within-Morocco / vs stateofdev, never vs Western benchmarks on scale questions | Strong (same data) |
| 3 | Two-layer language: EN-plain survey + Darija-first outreach | Moderate (state practice + sociolinguistics + GeeksBlaBla precedent) |
| 4 | Community framing = hypothesis → Phase-6 landing A/B | Declared gap → self-test |
| 5 | Anonymity + skip-rights protocol on before-start | Validated (Arab Barometer protocol parallel) |
| 6 | Transcreate, don't translate, any future FR/AR materials | Moderate (register effects on guardedness) |

*Status: Phase 3 complete. Next: Phase 4 — comparable surveys teardown (State of JS/CSS, Stack Overflow, stateofdev.ma, security-industry surveys).*
