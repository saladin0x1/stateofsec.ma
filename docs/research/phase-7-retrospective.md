# Phase 7 — Retrospective: Our Mistakes vs The Handbook

What the stateofsec project actually got wrong, chapter by chapter — including the author's own. This is the cheapest education in the library: we already paid for these lessons.

## Mistake ledger

| # | What happened | Handbook rule violated | Lesson |
|---|---|:---|:---|
| M1 | **Goal drift**: the redesign promised 15–18 questions / 3–4 min; calibration enthusiasm drifted it to median 40 screens while the site still said "about 8 minutes" | Ch.1 (question economics) + Ch.8 (honest duration) | Adding questions is a budget decision; re-read the promise every time you spend |
| M2 | **Option walls shipped**: 22 salary bands, 22 defensive tools in one list. Testers revolted; research confirmed (~5pp/question, primacy bias) | Ch.4 (cap ~7–10, group, typeahead) | Nobody checked the *mobile* render of long lists before humans saw it |
| M3 | **The door was never tested**: weeks perfecting the DAG; zero tests of landing→captcha→start on in-app browsers until a user fought the captcha 8× and quit | Ch.12 (door test) | The front door is where surveys die; test it first, hardest, on the worst browsers |
| M4 | **QA data treated as truth**: our own localhost/test sessions polluted the funnel; then the "n=16" numbers got repeated into briefings as findings ("everyone finishes!") | Ch.13 (honest baselines) | Caveats are not jargon — they travel with the number into every summary, or the number doesn't travel |
| M5 | **Uncontrolled paradata storytelling**: 12 rage clicks attributed to "the save pause" — under conditions where *we were redeploying mid-session under testers*. Attribution never controlled | Ch.13 | One anecdote = a QA checklist item, not a finding |
| M6 | **Recommendations on vibes**: I pushed auto-advance twice (accessibility violation) and quoted a vendor "+10–30%" gamification stat that died on source-check | Ch.8/Ch.10 + program rule (academic > vendor) | If it has no citation, it's a hypothesis — label it as one *before* someone acts on it |
| M7 | **Visual regression shipped live**: adding group headers silently broke the 2-column grid (`display: contents` bug); the user caught it from the live tab | Ch.12 (verify after every structural change) | Structural UI change ⇒ screenshot diff on the canonical viewports, every time |
| M8 | **Re-solving solved problems**: "i cannot start wtf" — I re-diagnosed a captcha/env issue the previous session had already solved with the playground, wasting a debugging cycle | (meta) institutional memory | Read your own history (the JSONL) before debugging; the repo's past is documentation |
| M9 | **Policy that lived only in memory**: the "no bypass code in git" rule was enforced by manual discipline, got violated the moment the discipline-holder changed, and the bypass quietly vanished between sessions | Ch.12 (machine verification ethos) | If a rule matters, encode it in a test/CI gate; humans forget, machines don't |
| M10 | **Redeploying under live testers**: mid-review builds changed questions/screens under people walking the survey | Ch.12 (freeze) | A field under review is production; freeze or fork before touching it |

## What we got right *before* the book existed (instinct ≡ chapters)

- Demographics-first → Ch.2 (validated later by the 2025 experiment)
- Sensitive block late, safe-harbor framing, never *how*/*which org* → Ch.6
- Zero Likert batteries, item-specific labeled scales → Ch.7
- One-question-per-screen, no grids, per-section saves → Ch.5/Ch.10
- Open-data results as the incentive → Ch.8

**The pattern:** our instincts about *content* were consistently good; our failures clustered in *verification* (M2, M3, M7, M9, M10) and *epistemics* (M4, M5, M6). The handbook's chapters 12–13 aren't appendix material — they're where we actually bled.

*Companion: `errata.md` (what was corrected in the docs) and `phase-0-baseline-v2.md` (the clean re-baseline).*
