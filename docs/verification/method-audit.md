# Method Audit: Plausibility Evidence, Question Audit, Burden

Status: evidence for the pre-launch review (2026-10-27). Nothing here changes `survey/*.yml`:
every change is a proposal, for the owners to accept or reject.

## How To Rerun

```sh
pnpm tsx scripts/verify/plausibility.ts            # sections 1-5 below, from the committed counts
pnpm tsx scripts/verify/plausibility.ts --burden   # adds the burden table (about 90 s)
pnpm tsx scripts/verify/plausibility.ts --grid     # rewrites tests/personas/grid.json
pnpm tsx scripts/verify/plausibility.ts --rebuild  # recounts from the upstream git refs first
pnpm tsx scripts/verify/plausibility.ts --strict   # exit 1 on a reproduction miss or a contradiction
```

`scripts/verify/upstream-counts.json` holds aggregated cross-tabs only (no answer rows), so the
script runs without the upstream data. `--rebuild` regenerates it byte for byte from
`upstream/master` (2021-2024) and `upstream/2025-resultes` (2025, 1,137 respondents, used here for
the first time).

## Data And Matching

- Source: stateofdev.ma open answers, 8,298 rows (2021: 1,098; 2022: 1,617; 2023: 2,131; 2024:
  2,315; 2025: 1,137). 2020 is left out: its age and experience bands do not match ours.
- Matching is by label, year by year: each upstream question is found by its label and each
  upstream choice is mapped by its label to this survey's label (never by index; indices moved
  between years, e.g. the 2024 diploma list gained "Other" and 2025 replaced it with nine school
  types). The counts file lists every upstream label and where it went; none is unmatched.
- Shares are P(later answer | earlier answers), in the order the survey asks them
  (age, education, experience, employment), pooled 2021-2025, with Wilson 95% intervals.
- Verdicts (owner rule): HIDE when the Wilson upper bound is under 0.5%; CHECK (soft check)
  when the share is under 2%; FINE otherwise.

Construct caveats, stated where they change a verdict:

1. Developers, not security people; "years coding professionally" stands in for "years security
   was part of the job". Thresholds are a Moroccan proxy, to revisit with stateofsec's own data.
2. 2021-2024 asked the highest diploma completed; 2025 asked the education background, as we do
   (completed or in progress). Doctorate rules therefore use 2025 only.
3. Upstream MAD pay tops out at "> 30 000", so a "> 60 000" share is bounded from above.
4. Upstream interns and students answered a salary question worded for CDI employees: a
   self-selected group, not an estimate of stipends.
5. 2021-2024 printed the USD band "30 500 - 40 000" and nothing for 25 000 - 30 500 (upstream bug).

Pay bands nest: every MAD, TJM, yearly USD and daily USD band of ours is a union of upstream bands
(checked against the counts file), so the merged bands still compare with stateofdev.ma.

## 1. Published Figures Reproduced

On 2021-2024 (7,161 rows), the basis of `docs/survey-redesign.md` "Validation method":

| Figure | Definition | Computed | Published | Match |
|---|---|---|---|---|
| 18-24 founders | P(founder \| 18-24) | 31/2,838 = 1.09% | ~1.1% | yes |
| 35+ self-taught founders | P(self-taught \| 35+ founder) | 4/27 = 14.8% | ~15% | yes |
| 35+ no experience | P(none \| 35+ in work) | 10/200 = 5.0% | ~5% | yes |
| 18-24 with 11+ years | P(11+ years \| 18-24) | 3/3,617 = 0.083% | ~0.08% | yes |

Two of the published figures used a denominator other than the survey order. In survey order,
P(founder | 35+ self-taught) = 4/14 = 28.6%, and P(none | all 35+) = 16/262 = 6.1%. The
verdict (FINE) is the same either way. The doctorate figure (1.4% of 25-34) also reproduces:
34/2,456 = 1.38%.

## 2. Profile Pair Verdicts (Pooled 2021-2025)

| Rule | x/n | Share | Wilson 95% | Verdict | Survey now |
|---|---|---|---|---|---|
| 5-6 years \| 18-24 | 61/4,120 | 1.48% | 1.15-1.90% | CHECK | soft check |
| 7-10 years \| 18-24 | 6/4,120 | 0.15% | 0.07-0.32% | HIDE | hidden |
| 11+ years \| 18-24 | 3/4,120 | 0.07% | 0.02-0.21% | HIDE | hidden |
| 11-16 years \| 25-34 | 53/2,897 | 1.83% | 1.40-2.39% | CHECK | soft check |
| 16+ years \| 25-34 | 5/2,897 | 0.17% | 0.07-0.40% | HIDE | hidden |
| No experience \| 35+ | 19/318 | 5.97% | 3.86-9.14% | FINE | none |
| Doctorate \| 18-24 (2025 only) | 3/503 | 0.60% | 0.20-1.74% | CHECK | soft check |
| Doctorate \| 25-34 (2025 only) | 9/441 | 2.04% | 1.08-3.83% | FINE | soft check (warning) |
| Founder \| 18-24 | 33/3,143 | 1.05% | 0.75-1.47% | CHECK | soft check |
| Founder \| under 3 years | 35/3,750 | 0.93% | 0.67-1.30% | CHECK | soft check |
| Founder \| 35+ self-taught | 5/17 | 29.4% | 13.3-53.1% | FINE | none |
| Intern \| 35+ | 1/250 | 0.40% | 0.07-2.23% | CHECK | soft check |
| Intern \| 5+ years | 2/963 | 0.21% | 0.06-0.75% | CHECK | soft check |
| Student \| 35+ | 2/250 | 0.80% | 0.22-2.87% | CHECK | soft check |
| Student \| 7+ years | 3/483 | 0.62% | 0.21-1.81% | CHECK | soft check |
| Looking for work \| 35+ | 4/250 | 1.60% | 0.62-4.04% | CHECK | none (owner decision) |

The YAML matches every verdict except two:

- Looking for work at 35+ is unchecked by owner decision.
- Doctorate at 25-34 sits right at the 2% line (2.04% in 2025; 1.48% on the pooled diploma
  data). The extra soft check costs one confirmation, so no change is proposed. Dropping it
  would reverse the earlier calibration and needs an owner call.

Doctorate at 18-24 pooled would say HIDE (10/4,120, upper bound 0.45%), but 2021-2024 counted
only completed diplomas. On the construct-matched 2025 data we are not 95% sure the share is
under 0.5%, so the existing soft check is right, not a hide.

## 3. Edit Rules Beyond The Profile Pairs

Classes: hard = impossible as worded, soft = rare (soft check), fine = no rule.

| Rule | Evidence | Class | Proposal |
|---|---|---|---|
| MAD > 60 000 with under 3 years | > 30 000 (upper bound): 21/1,813 = 1.16% (0.76-1.76%) | soft | soft check on work-q-0 "> 60 000" when profile-q-5 in [1, 2] |
| Intern stipend > 8 000 MAD | 55/100 = 55% (biased group, caveat 4) | fine | none: no basis for a check |
| MAD < 4 000 with 7+ years, employee | 1/204 = 0.49% (0.09-2.72%) | soft | soft check on work-q-0 "< 4 000" when profile-q-5 in [5, 6, 7] and profile-q-6 = 0 |
| TJM > 5 000 MAD with under 3 years | 74/667 = 11.1% | fine | none |
| USD < 20 000/yr, employee living abroad | 3/420 = 0.71% (0.24-2.08%); 8.9% for those remote from Morocco | soft | soft check on work-q-2 "< 20 000" when profile-q-2 in [12..15] |
| USD >= 2 000 per day, freelancer abroad | 287/1,003 = 28.6%; 14.9% claim $5,000+ a day | unit error | soft check "per DAY, not per month" on work-q-3 (outside the rarity rule, see conflicts) |
| Junior with 11+ years | no upstream field | soft (judgment) | soft check on roles-q-1 "Junior / entry-level" when profile-q-5 in [6, 7] |
| "Still exploring" with 7+ years | no upstream field | soft (judgment) | soft check on roles-q-0 when profile-q-5 in [5, 6, 7] |
| "Currently working outside Morocco" while living in Morocco | 149/6,677 = 2.2%; 75/965 = 7.8% of those paid in USD by a foreign employer | hard | fix the wording (finding A2), do not hide |
| Same, while looking for work or a student | 65/1,879 = 3.5% | hard | same wording fix |

Rule-set check (survey rules plus the six proposed soft checks, real engine, every reachable
class of answers):

- No soft check is dead: each one can fire on some path.
- No question is left with fewer than 2 visible choices.
- No choice is never shown.
- No HIDE verdict is implemented as a soft check.
- On profile-q-6, two checks can fire on the same pick for founders, interns and students
  (18-24 founder with under 3 years, for example). Only the first message shows, so there is
  no double prompt and no contradiction.

## 4. Question Audit

Stages (Tourangeau): C = comprehension, R = recall, J = judgment, M = response mapping.
Severity: High = corrupts a headline or misroutes the tree; Medium = biases an item or breaks
comparability; Low = wording.

### Findings, By Severity

**A1. roles-q-0, domain: three constructs in one fork (C, J). High.**
"Best describes your role, focus, or main interest" lets a SOC analyst who wants red team
pick Offensive. Tools (tech-q-0/1), seniority options and the CISO path branch on this answer,
so that respondent never sees the defensive list. Evidence: the YAML routing. Upstream has no
domain field. Proposed:
```yaml
  - label: Which cybersecurity domain best describes your current security work? (No security work yet? The area you focus on)
```

**A2. work-q-17/18, "Currently working outside Morocco" (C, M). High.**
Remote employees of foreign organizations, whom our employment question explicitly includes
("remote from Morocco"), read this as their situation, and the pick then asks them whether they
plan to "come back to Morocco". Evidence (upstream, pooled):

- 2.2% of residents of Morocco pick it.
- 7.8% of residents of Morocco paid in USD by a foreign employer pick it.
- 3.5% of students and job seekers pick it.
- 9.6% of residents abroad do not pick it.

Confirmed. Proposed (index 3 kept, so work-q-18's `equals: 3` gate now means "lives abroad"):
```yaml
    choices:
      - Yes, in the next 12 months
      - Yes, in the next 24 months
      - Still hesitating
      - I already live and work outside Morocco   # was "Currently working outside Morocco"
      - "No"
    optionShowIf:
      - options: [I already live and work outside Morocco]
        showIf: { question: profile-q-2, in: [12, 13, 14, 15] }
```

**A3. work-q-3, daily USD rate (R, M). High.**
Upstream, 28.6% of freelancers abroad give $2,000 or more per day, and 14.9% give $5,000 or
more. At 220 days that is $440k+ a year: monthly or project rates entered as daily ones.
Proposed: the unit soft check below (checked by the script: reachable, no conflict), or ask a
monthly rate.
```yaml
    softChecks:
      - options: ["2 000 - 5 000", "> 5 000"]
        message: "Just checking: this is your rate per DAY, not per month. Is that right?"
```

**A4. work-q-11, unemployment after graduation, shown to the self-taught (C). Medium-High.**
Confirmed. Upstream, 421 self-taught respondents answered it, and 57.0% of them said they
"worked straight after graduation". There was no graduation. Proposed:
```yaml
    showIf: { question: profile-q-4, notIn: [0, 1] }
```

**A5. community-q-7, asked to hide (C, R, M). Medium-High (headline item).**
Confirmed on three counts:

- It mixes experienced with witnessed: "Not to me, but I've seen it" makes "asked and also saw
  it" impossible to express.
- It has no timeframe: "ever" grows with career length, so experience bands are not comparable.
- Witnessing is not a prevalence measure, since one event has many witnesses.

Proposed (indices kept):
```yaml
  - label: "In the last 3 years, has an employer or a client asked you to hide or play down a security incident, or to remove or downgrade an audit or pentest finding for non-technical reasons? (a bug bounty program's normal disclosure rules don't count)"
    choices:
      - Yes, to hide or play down an incident
      - Yes, to remove or downgrade a finding
      - I have seen it asked of someone else
      - No, neither
      - Prefer not to say
    exclusive: ["No, neither", Prefer not to say]
```

**A6. "pick up to 3" not enforced: learning-q-3, work-q-13, community-q-11, community-q-12 (M). Medium.**
In upstream 2025, the same unenforced wording was over-selected by:

- 8.1% (6.5-10.1%) on learning challenges
- 12.6% (10.3-15.3%) on "most need"
- 21.1% (18.2-24.2%) on content type

Shares of "top 3" answers are therefore not top-3 shares. Proposed: a `maxPicks: 3` key
(schema, engine and server change, outside these files). Until then, report these as
select-all items.

**A7. community-q-10, "How has the community helped your career?" (J). Medium.**
The stem presumes help. In 2025 upstream, 53.2% (371/698) picked "It hasn't helped my career
yet". Confirmed. Proposed: `label: Has the Moroccan security community helped your career? If so, how?`

**A8. community-q-13, primary social network, no None / Facebook / WhatsApp (M). Medium.**
This is required and has no exit. Upstream shares when the choices existed:

| Year | Facebook | WhatsApp | None |
|---|---|---|---|
| 2021 | 12.4% | 3.5% | 8.6% |
| 2024 | 2.6% | 2.2% | 2.7% |

In 2025, with those choices removed, "Other" got 2.4%. Confirmed. Proposed: append
`Facebook`, `WhatsApp groups` and `None` (append keeps indices).

**A9. Required multi-selects without an exit (M). Medium.**
Affected: learning-q-3, community-q-8, community-q-9, community-q-11, community-q-12 (and
A8). A respondent with no challenge, no barrier or no need must invent one, which is
satisficing noise. The exits that do exist are heavily used (53% on A7). Proposed: append an
exclusive exit to each, for example:
```yaml
    choices: [..., No particular challenge]
    exclusive: [No particular challenge]
```
The exits per question: "Nothing in particular" (q-8), "Nothing, I don't plan to attend"
(q-9), "Nothing right now" (q-11), "None of these" (q-12).

**A10. tech-q-0 / tech-q-1, Nessus in both tool lists (M). Medium-Low.**
AppSec, DevSecOps, "Still exploring" and "Other" see both lists, each naming Nessus. A Nessus
user ticks two categories, and vulnerability scanning is double-counted. Confirmed, and it
contradicts the "no tool listed twice" claim. Proposed:

- Offensive item: `Mobile testing (Frida, MobSF, objection)`.
- Defensive item: `Vulnerability scanning, code & cloud (Nessus, OpenVAS, Qualys, SonarQube, Snyk, Semgrep, Wiz, Prowler)`.
- Update the offensive `optionShowIf` label reference to match.

### Further Findings

| Id | Stage | Problem | Proposal | Severity |
|---|---|---|---|---|
| profile-q-4 | C, J | "is/was ... completed or in progress" with no rule for several paths; level (Bac +5) and school type (private engineering) overlap. Fork and cross-tab | "What is your highest IT or security education? (completed or in progress; if several, the highest)" | Medium |
| work-q-0 | C | 41-word stem for three audiences, read in a second language. "NET" is defined, but founders and "Other" get one sentence or none | Shorten: "Your usual NET monthly pay in MAD (as on your pay slip; 13th month, bonuses, side jobs out. Interns: stipend. Founders: what you take home)" | Medium |
| community-q-1 | C, J | "dealt with" is vague. "Police cybercrime units" can read as having been investigated | "worked with or had to comply with"; police option "(e.g. a complaint or an investigation you supported)" | Medium |
| profile-q-6 | J, M | Single choice for multiple statuses (employee + freelance side work). Only students are told what to pick | Stem: "(if several, the one that takes most of your time)" | Low-Medium |
| profile-q-5 | J | "part or all of your job" has no threshold for IT staff | "(count years where security was a regular part of your tasks)" | Low-Medium |
| work-q-18 | C | "If you are working abroad" is redundant once gated (A2) | "Do you plan to come back to live in Morocco?" | Low |
| tech-q-3 | M | "Only where allowed" is a constraint, not a use | Drop, or ask as a separate yes/no | Low |
| tech-q-1 | J | "(you or your team)" mixes personal and team use | "that you use yourself" | Low |
| work-q-15 | M | "under 10" then "between 11 and 30": 10 employees fit nowhere | "1 to 10 employees" | Low |
| roles-q-2 | J | "regularly" is a vague quantifier | "Yes, regularly (most months)" | Low |
| community-q-3 | R | "ever" is lifetime prevalence and grows with experience. The safe-harbor framing stays | Analyse by experience band; no wording change | Low |
| learning-q-0 / learning-q-1 / work-q-10 / work-q-12 | M | 13-15 choices (cap about 10) | Grouping headers (`groups`) | Low |

No issue found: profile-q-1, profile-q-2, profile-q-3, roles-q-1, learning-q-2, work-q-1,
work-q-2 (bands nest; see A3 for the daily rate), work-q-4, work-q-5, work-q-6, work-q-7,
work-q-8, work-q-9, work-q-14, work-q-16, work-q-19, tech-q-2, tech-q-4, community-q-0,
community-q-2, community-q-4, community-q-5, community-q-6. The under-18 learning options
(lycee classes and OFPPT, no university) match the owner decision.

## 5. Burden Per Profile Leaf

From the YAML with the real engine: 3,426,640 class paths, 22 to 47 screens. This matches the
earlier model-check (22-47, median 40).

Time model:

- Words read at 150 wpm, for second-language readers. L1 adult silent reading of non-fiction
  is about 238 wpm (Brysbaert 2019), and L2 readers are slower.
- 3 s per single choice, 6 s per multi-select, 5 s per soft check fired.
- The typical path is Casablanca, 25-34, Bac +5 and 3-4 years. Experienced respondents get
  the SOC domain and no bug bounty. Others get "Still exploring" and "Not yet". AI is used
  occasionally, no flaw is noticed, and the answer on abroad is "Still hesitating".

| Leaf | Screens min/med/max | Options read (med) | Req. multi | Soft max | Typical @150 / @200 wpm |
|---|---|---|---|---|---|
| Under 18 | 22/26/30 | 183 | 9 | 0 | 25 screens, 8.8 / 7.1 min |
| Lycee (18-24) | 23/27/31 | 195 | 9 | 1 | 26 screens, 9.3 / 7.5 min |
| No experience: employee, founder, intern, freelancer, other | 33-35/38-40/42-44 | 266-276 | 10 | 3 | 36-38 screens, 12.8-13.5 / 10.2-10.8 min |
| No experience: student, looking for work | 31/36/40 | 256 | 10 | 3 | 34 screens, 12.2-12.3 / 9.8 min |
| Experience: employee (MA / foreign), intern, founder | 37-38/42-43/46-47 | 295-301 | 10 | 3 | 38-39 screens, 13.7-14.1 / 10.9-11.3 min |
| Experience: freelancer, other | 35-36/40-41/44-45 | 282-287 | 10 | 3 | 36-37 screens, 13.1 / 10.4-10.5 min |
| Experience: student, looking for work | 33/38/42 | 271 | 10 | 3 | 34 screens, 12.4-12.5 / 10.0 min |

(`--burden` prints each of the 18 leaves separately.)

Against the "about 8 minutes" on before-start and thanks: only under-18s and lycee students
fit it, and only at the faster reading speed. An adult reads 245-300 options over 34-43 screens,
which is about 12-14 minutes at 150 wpm (10-11 at 200). The claim understates by 50-75%.
Proposed copy: "about 12 minutes" (corrections.md B1). Confirm with time-on-survey once
instrumentation is live.

## 6. Persona Grid

`tests/personas/grid.json`: 61 personas, answers keyed by question label and then choice
label, with each persona's expected screen count and soft-check prompts. It covers:

- every value of every fork answer (80 of 80);
- every pair of answer classes that meet in one question's conditions (198);
- full pairwise over age, education, experience and employment classes (174);
- all 9 soft checks;
- 5 extremes: the longest and shortest paths, the longest minor path, the oldest with 16+
  years, and the longest path with every optional question skipped.

The grid was built by a seeded greedy cover over 40,000 random walks. `surveySha256` tells when
to regenerate it.

## Conflicts With Owner Decisions (Listed, Not Re-Opened)

1. Gender is required, Male/Female only, with no "Prefer not to say". Standard practice offers
   an exit on a required demographic. The decision stands.
2. Looking for work at 35+ is 1.6% (CHECK by the rule) but is never checked, by decision
   (sensitive). The decision stands.
3. The daily USD unit check (A3) and the two judgment soft checks (Junior with 11+ years,
   "Still exploring" with 7+ years) go beyond the plausibility rule. The first is not rare but
   wrong, and the other two have no data. They need an owner OK as exceptions.
4. Not a decision conflict, flagged as a possible reversal: the doctorate soft check at 25-34
   sits at 2.04% on construct-matched data. It is kept, and no change is proposed.
