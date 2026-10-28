# The Survey Architect's Handbook

A practitioner's manual for designing surveys people finish and answer honestly. Every rule carries its evidence; every chapter ends in a checklist. Distilled from the stateofsec.ma research program (phases 0–6) and the methodology canon (Dillman, Krosnick, Tourangeau, Couper, Groves).

---

## Chapter 1 — The Economics of a Question

Every question has a price. Drop-off runs **~10% at the start + ~2% per 100 items** (Hoerger). After ~question 4, each added question costs **~5 percentage points** of completion. Past ~20 minutes, completion collapses below 30% (Kantar).

**Rules**
- A question earns its place only as: (a) a cross-tab dimension, (b) a publishable headline, or (c) the project's unique voice. Else cut.
- Prefer **branching over cutting**: keep breadth in the file, shorten each person's path. One person's skipped question is free.
- Write the report headlines FIRST. If a question appears in no headline and no cross-tab, it's decoration.

[ ] *Checklist: every question maps to a headline or a cross-tab; total promised time is honest and tested, not guessed.*

## Chapter 2 — Flow Architecture (the shape)

A survey is a narrative arc, not a list: **warm-up → core → sensitive → identity/close**.

- **Warm-up (first 3–5):** easy, fast, zero-threat. Builds momentum (foot-in-the-door: small request → 22%→53% later compliance; a *large* first ask does worse than none).
- **Demographics early is fine** — modern experiments show no breakoff penalty, and you recover profile data from partial dropouts (HKS 2025). This reverses the old "demographics last" doctrine.
- **Sensitive questions: late, but not last.** Early = threat + dropoff; very last = fatigue and satisficing. Second-to-last section is the sweet spot. Transition into them deliberately.
- **Section rhythm:** alternate load (heavy → light → heavy). Topic transitions are measured breakoff spikes (ML breakoff models) — smooth them with clear section titles and a visual breath.
- **End with identity/community**, not with a chore: the last screens should feel like belonging, not paperwork.

[ ] *Warm-up is trivially easy; sensitive block sits late-but-not-last; sections alternate weight; the final screen is warm.*

## Chapter 3 — Question Design

- **One construct per question.** Double-barreled ("Are you satisfied with the pay and the tools?") is data poison — split it.
- **Plain language, short sentences.** Many respondents answer in their second language; plain wording measurably improves data quality exactly there (Bauer 2025). No idioms, no jargon unless the audience owns it.
- **Concrete timeframes:** "in the last 12 months", not "these days".
- **Ask behavior, not attitude-projections:** "Did you report it?" not "Would you report if...". Hypotheticals measure imagination.
- **Pretest wording on 3 real people** from the audience; where they hesitate, the question is broken.

[ ] *No double-barreled items; every question survives a read-aloud test; timeframes explicit.*

## Chapter 4 — Option Design

- **Exhaustive + mutually exclusive.** Overlapping bands ("1–2, 2–3") create noise; gaps force wrong answers.
- **Cap lists at ~7–10.** Satisficing rises with list length; top options harvest primacy-bias clicks (serial position effect).
- **Long lists:** group by type with headers, merge second-tier items into labeled groups, or — for known items (regions, countries) — a **typeahead with synonyms** ("casa" → Casablanca) beats any wall of radios (GOV.UK pattern).
- **"Other" always gets a text field** — it's your free idea generator and your list-quality sensor (a fat Other means the list is wrong).
- **Exclusive options** ("None of these", "Prefer not to say") must auto-clear conflicting picks — enforce in the engine, not in the user's memory.
- **Order long lists by frequency** (most common first) so primacy bias works *with* reality, or randomize for rating items.

[ ] *Bands don't overlap; no list >10 without grouping; Other has a text box; exclusives enforced mechanically.*

## Chapter 5 — Branching Architecture (the tree)

- **Nobody answers a question that doesn't apply to them.** Irrelevant questions are the #1 perceived-disrespect signal.
- **Depth ≤ 2 levels** from any fork; deeper trees make subgroups too small to report.
- **Guards before dependents, always** (a DAG): conditions may only reference earlier answers. This makes the whole tree mechanically verifiable.
- **Model-check before launch:** exhaustive or equivalence-class walk proving — no dead questions, every visible question shows ≥2 choices, every path terminates, numbering never jumps. If your survey engine can't prove this, you're shipping on hope.
- **Freeze the structure at launch.** Positional IDs / column layouts make post-launch reordering a data-corruption event. Restructure *before* respondent #1, never after.
- **Target the median path, not the file.** File can hold 50 questions; the median respondent should walk the promised time.

[ ] *DAG verified by machine; no dead nodes; median path length measured and honest; structure frozen at launch.*

## Chapter 6 — Sensitive Questions

- **Why people lie:** social presence. Self-administered + anonymous modes get significantly more true disclosure of sensitive behavior — strongest for the most sensitive items (meta-analysis, N=125,672).
- **Say "anonymous" AT the question**, not just at the intro. A promise made 30 screens earlier is forgotten exactly when fear peaks.
- **Safe-harbor framing** (the security-industry standard): anchor behavior in an authorized or passive role — "while simply using the service, did you notice...", never "did you access...". Never ask *how*. Never ask *which organization*.
- **Offer "Prefer not to say"** — a graceful exit converts a would-be liar into an honest skip.
- **Tone shift is a tool:** deliberately more formal wording in the sensitive block signals seriousness and raises credibility (CHI persona line).

[ ] *Anonymity microcopy sits at the block; framing is safe-harbor; no how/which-org questions; PTS present; tone shifts formal.*

## Chapter 7 — Scales & Measurement

- **Never use agree/disagree batteries.** They amplify acquiescence — severely in MENA samples (ORs 2.3–2.9). Use item-specific labeled scales: "Very weak → Very strong", "Never → Daily".
- **5–7 labeled points.** Fewer loses variance; more invites satisficing. Label every point; never bare numbers.
- **No midpoint for satisficers to hide in** unless genuine neutrality is a real state.
- **Compare within your population.** Extreme-response styles differ by culture; benchmark against your own previous editions, never against foreign surveys' "satisfied" rates.

[ ] *Zero Likert-agreement items; all points labeled; comparisons are in-population.*

## Chapter 8 — Progress & Motivation

- **Progress must never lie or lag.** Feedback slower than the promised pace *causes* abandonment (Conrad/Tourangeau experiments). Percent bars lie under branching; **count what's monotonic** ("12 of 31 answered").
- **Goal gradient is real:** effort accelerates near the end — give it something to accelerate toward, and make early progress feel fast (short warm-up questions).
- **Honest duration promise,** stated up front, matched to reality. Under-promise by a little; never over-promise.
- **The best incentive is the result itself:** guaranteed open data/report beats lotteries (guaranteed-small > lottery-large, robustly). Say it concretely: "results published as open data at ...".
- **No gamification mechanics.** Points/badges/timers increase rushing and satisficing; delight belongs in chrome (transitions, thanks page), never in answer capture.

[ ] *Monotonic progress; honest time promise; open-results reciprocity stated; zero game mechanics.*

## Chapter 9 — Wording, Tone & Errors

- **One voice, two registers:** conversational in the flow; formal at sensitive moments. The shift is the signal.
- **Errors = problem + solution**, never blame. "Invalid input" is an accusation; "Pick at least one — or choose Skip if none apply" is help. No humor in error states.
- **Direct beats over-polite.** Clarity is politeness.
- **Transcreate, don't translate,** for any localization: literal translation reads bureaucratic and makes respondents guarded.

[ ] *Error copy follows problem+solution; one consistent voice; register shifts only at the sensitive block.*

## Chapter 10 — Mobile-First Rules

Most respondents are on phones (ours: ~70%), and **mobile breakoff runs 2.6–12× desktop** (Mavletova/Couper).

- **One question per screen.** Grids/matrices triple item-missing (26.6% vs 8.5%) — never use them.
- **Touch targets ≥44px**, whole-row tappable, primary button in the bottom thumb zone.
- **Vertical option stacks** (scannable, low error), 2-column grids only for short uniform labels.
- **Test on a real mid-range phone, in-app browsers included** (WhatsApp/Instagram browsers are a distinct, buggier habitat — and exactly where community-shared links open).

[ ] *No grids; 44px verified on-device; tested inside in-app browsers, not just Chrome.*

## Chapter 11 — The Culture Layer

- **Language architecture:** questions in the audience's working lingua franca (plain!), outreach in the vernacular that carries trust (for Morocco: Darija-first social copy, English-plain questions). The state's own surveys run formal-written + dialect-spoken — mirror that split in your medium.
- **Expect and design against acquiescence/extreme-responding** in collectivist contexts: choice-based questions, labeled scales, no yes/no agreement chains.
- **Frame the ask as community contribution,** not self-exposure — and A/B it, because the framing effect is plausible but unproven in your market until you measure it.
- **Community champions > ads:** distribution through trusted peers (Discord/WhatsApp, one champion nudge mid-field) is the response-rate engine for small surveys.

[ ] *Vernacular outreach + lingua-franca questions; framing A/B planned; champion nudge scheduled.*

## Chapter 12 — Pre-Launch Verification

- **Machine:** validator + model-check (Chapter 5) green.
- **Human:** persona walkthroughs (the extremes — youngest, oldest, weirdest path) on real devices.
- **Door test:** the start flow, on in-app browsers, with a flaky connection. The front door is where surveys die.
- **Instrumentation live before respondent #1:** funnel events, section survival, completion — you cannot retrofit the baseline later.
- **Freeze:** structure locks at launch. Everything after is copy, not architecture.

## Chapter 13 — Launch & Learning

- **Field for 2–3 weeks** with a cadence: pre-notice → launch → value reminder (D3) → champion nudge (D7) → final call (D14).
- **One experiment per field.** At small n (hundreds), you can only detect big effects (~+12pp with ~170/arm) — don't squander resolution on trivia.
- **Watch:** start rate, wall pass rate, section survival (≥95% each), completion of starters (defend the literature floor ~89% at ~30 screens).
- **Publish with bias honesty:** self-selected sample, network-reachable population, limitations stated in the open — the Devographics discipline. Visible impact of edition N is the response engine of edition N+1.

---

### The one-page cheat sheet

| Designing a question | Building the flow | Guarding the truth |
|:---|:---|:---|
| earns its place · one construct · plain words · concrete timeframe | easy warm-up · sensitive late-not-last · branch irrelevant away · smooth transitions | anonymous-at-the-moment · safe-harbor framing · PTS exits · no agree/disagree |
| 5–7 labeled points · caps on lists · Other+text · exclusives enforced | median path honest · monotonic progress · freeze at launch | within-population comparison · publish limitations |

*Companion docs: `phase-0` … `phase-6` carry the receipts for every rule above.*
