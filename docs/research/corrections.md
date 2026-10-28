# Corrections — Research → Survey

The execution bridge: every research finding that dictates a change, mapped to the defect it names, the correction, and its status. Grade tags per the audit: [research] research · [measured] measured/practice · [testers] testers · [judgment] judgment · [hypothesis] hypothesis.

## A. Corrections already applied (uncommitted in working tree)

| # | Finding | Defect it corrected | Correction | Grade |
|---|---|:---|:---|:---:|
| A1 | Choice overload: caps ~7–10, long lists group or typeahead (Ph1/Ph2) | 22 salary bands, 22-tool wall | Bands 22→16; tools → 5–6 category picks | [research][testers] |
| A2 | Serial-position/primacy on long lists (Ph1) | flat ungrouped tool lists | category labels carry the grouping | [research] |
| A3 | Touch ergonomics 44px floor (Ph2) | fat rows wasting mobile space | compacted rows (44px QA pending) | [research] |
| A4 | Progress must not mislead; sections pop-in late (Ph2 fix session) | steps bar jumped 5→6 mid-survey | optimistic section visibility (shipped + tested) | [judgment] |
| A5 | Vendor claims ≠ evidence (Ph7 retraction discipline) | — | gamification/auto-advance never shipped | [research] |

## B. Corrections pending (the execution queue)

| # | Finding | Defect | Correction | Effort |
|---|---|:---|:---|:---:|
| B1 | Expectation-lagging feedback causes abandonment (Ph1) | "about 8 minutes" vs median 41 screens | trim (B2) + re-measure + honest copy on before-start & thanks | S |
| B2 | Question economics: ~5pp/question, Hoerger floor (Ph1) | median 41 screens | community merges −2 · preference cuts −2 · section swap (pacing) → ~36 | M |
| B3 | Known-item long lists → typeahead + synonyms (Ph2) | 16-row region wall | region typeahead ("casa" → Casablanca-Settat) + grouped fallback | M |
| B4 | Progress must move every tap, never lie (Ph1/Ph2) | 6-axis bar static for ~7 questions | monotonic answered-count ("12 / 31") | S |
| B5 | Anonymity perception at the moment of asking (meta N=125k, Ph1) | anonymity promised 30 screens before the flaw block | badge at the block: "Anonymous · aggregate only · nothing identifying" | S |
| B6 | Formality → credibility on sensitive topics (Ph2) | uniform casual-terminal tone | formal register at the flaw block only | S |
| B7 | Errors = problem + solution, no blame (Ph2) | generic validation copy | copy pass on machine ERRORS + soft-check text | S |
| B8 | FITD: first ask must be small (Ph1); H-5 in-app-browser wall | heavy door (landing→captcha→Firebase) | friction audit of entry; captcha QA on WhatsApp/Instagram browsers | M |
| B9 | Guaranteed > lottery; open-data incentive (Ph1/Ph4) | reciprocity promise buried | "results published as open data" stated at door + thanks + outreach | S |
| B10 | Darija = trust layer for outreach (Ph3) | English-only assets | Darija-first story/share texts + partner pack | M |
| B11 | No baseline without instrumentation (Ph6, post-quarantine) | hypotheses H-1…H-5 unmeasurable | funnel + server events live before respondent #1 | M |
| B12 | Encode rules or they decay (Ph7 M9) | list-caps & no-Likert live in docs only | validator warnings: >10 choices → warn; agreement-scale pattern → warn | S |

## C. "Defects" the research says we never had (freeze as rules)

| Finding | Our state | Action |
|:---|:---|:---|
| Demographics early = no penalty, recovers partials (Ph1, 2025) | already profile-first | freeze |
| Grids triple item-missing (Ph2) | zero grids | freeze |
| Likert agreement amplifies MENA acquiescence, OR 2.3–2.9 (Ph3) | zero Likert items | freeze (+ B12 enforcement) |
| Safe-harbor framing for sensitive behavior (Ph4) | flaw block already compliant | freeze, cite in report |
| Per-section saves = partial-response recovery (Ph4, SO rule) | already built | freeze, document |

## D. Corrections deliberately NOT made

| Temptation | Why rejected | Source |
|:---|:---|:---:|
| Auto-advance | WCAG violation, misclick lock-in, no proven lift | [research] Ph2 |
| Gamification points/badges | increases satisficing; novelty decays | [research] Ph2 |
| Fake progress head-start | no survey replication + honesty risk | [research] Ph1 |
| Cut stateofdev-calibration core (overtime/satisfaction/AI) | breaks year-1 comparability; goodwill carries length (2,315 @ 60Q) | [comparables] Ph4 |
| % progress bar | lies under branching | [research] Ph2 |

## Sequencing rule

B1–B3 are **pre-launch only** (positional IDs freeze at launch — B2/B3 change structure). B4–B9 ride the same branch. B10–B11 are launch-week. B12 is any time. Everything after launch: copy only.

*Receipts: phases 1–4 docs · audit table (session log) · errata for the two retracted claims.*
