# Survey redesign: shorter, branched, tree-structured

Status: DRAFT - pending review (Ashraf / senior + mchklt) and QA. Nothing merges to `main` until sign-off.

## Why

A senior reviewer tried the survey on his commute and could not finish it:
"it is very long", "too many options", "I have to scroll too much up and down",
"couldn't finish it on the way to work".

The data backs it up (current `survey/*.yml`):

| section   | questions | required | avg options | worst list |
|-----------|-----------|----------|-------------|------------|
| profile   | 8         | 8        | 7.5         | 17 (region)|
| roles     | 5         | 4        | 16.2        | 21 (domain)|
| learning  | 7         | 6        | 9.6         | 17 (certs) |
| work      | 8         | 6        | 8.4         | 11 (salary)|
| tech      | 6         | 3        | 12.5        | 20 (tools) |
| community | 12        | 4        | 6.2         | 9          |
| **total** | **46**    | **31**   | **9.2**     | -          |

46 questions, 424 options to read, 16 questions with 10+ options (several 20-21).

## Goal / non-goal

- Goal: a survey a phone user finishes in 3-4 minutes, that still produces a
  dataset worth publishing.
- Non-goal: maximum data per respondent. Year one favours completion and reach
  over depth - a finished short survey beats an abandoned long one. We earn the
  right to ask more in year two once there is an audience.

## Theory basis (so each cut has a reason, not a vibe)

- Total Survey Error (Groves): abandonment is nonresponse/breakoff error; adding
  questions trades measurement gains for far worse nonresponse.
- Satisficing (Krosnick): high burden makes respondents pick the first option /
  straight-line, so a long survey also lowers answer quality, not just count.
- Response-process model (Tourangeau): every extra option adds comprehension and
  response load - hence cap lists and group them.
- Tailored Design Method (Dillman): minimise burden, order easy -> sensitive,
  mobile-first.
- Sensitive questions: anonymity and the perception of anonymity drive truthful
  disclosure. Relevant to the reality/drama items (vuln -> jail, hiding breaches).
- Sampling: this is a self-selected convenience sample. Results describe
  "security people reachable through our network who opted in", not all Moroccan
  professionals. State this caveat when publishing (same nature as stateofdev.ma).

## Design principles

1. Every question earns its place as one of: (D) a cross-tab dimension,
   (H) a publishable headline stat, or (V) the project's unique voice. Else cut.
2. Cap option lists at ~10; long lists -> multi-select + "Other"; granular lists
   (region, domain) get grouped.
3. Order: easy demographics -> engaging -> sensitive/reality last.
4. Branch so nobody answers irrelevant questions (the "tree", below).

## Targets

- Per person: ~15-18 questions (path-dependent), 3-4 minutes.
- File total: ~28-30 questions. Branching keeps breadth in the file while each
  person walks a short path - this resolves the depth-vs-reach tension.
- Options: ~424 -> ~190.

## The tree

Fork variables (the answers that decide what comes next): employment, role
(red/blue/purple + domain), and "have you found a vuln?". Everything else hangs
off these. Keep it shallow (2 levels max) so no subgroup is too small to report.

```
TRUNK  (everyone, ~6)
  - experience (years)
  - region
  - gender, age
  - employment ................. FORK A
  - primary domain + red/blue/purple ... FORK B

FORK A - employment -> Money & market
  - in Morocco      -> salary MAD, org type, biggest MA challenge
  - abroad          -> salary EUR/USD, what would bring you back
  - freelance       -> day rate, local vs foreign clients
  - founder         -> team size, funding reality
  - student/looking -> (skip salary) first-job blocker, aspiration

FORK B - role -> Tools & skills
  - red / offensive -> offensive tools, CTF, bug bounty (gated)
  - blue / defense  -> blue/SOC tools, detection stack
  - purple          -> condensed both
  - GRC / other     -> frameworks (ISO/NIST), skip technical tools

COMMON - learning  (everyone, light)
  - how you learned
  - hold certs? ............ FORK D -> which certs
  - who pays for training

COMMON - the reality  (everyone, internally gated)
  - found a vuln in a MA system? ...... FORK C
       yes -> what did you do -> (didn't report?) why -> ever pressured to hide?
       no  -> straight to perception
  - does the law protect researchers? (perception)
  - DGSSI / Law 09-08 awareness
  - Morocco security maturity
```

## Implementation notes

- `showIf` only references backward (by 0-based choice index), so every fork
  question must sit before the questions it gates. Order is load-bearing.
- Question IDs are positional (`<section>-q-<index>`), so reordering rewrites
  stored answer keys. There are no real responses yet, so now is the right time
  to restructure - but after launch this becomes expensive.
- The whole flow is one question per screen already, so the fix is content +
  branching, not layout.

## Open decisions (for review)

1. Fork variables: employment + role + vuln-found. Add/drop any?
2. Branch depth: 2 levels (recommended) vs a tighter single-fork tree.
3. gender + age: keep both, keep one, or cut (low cross-tab value).
4. Tools: merge offensive + defensive into one "tools you use" multi-select
   (recommended) vs keep two capped lists.

## Process / gate

1. This doc reviewed by Ashraf (senior) + mchklt; decisions above resolved.
2. Build the restructured `survey/*.yml` on this branch (`survey-redesign`) as
   incremental test commits.
3. QA locally on workerd (`wrangler dev`) + a branch preview deploy; walk every
   branch of the tree, verify `showIf` paths and that `pnpm check`/tests pass.
4. Only then decide to merge to `main`.

## Implemented (on this branch)

Built and verified by an automated model-check + semantic review (graph-integrity,
exhaustive enumeration of all fork combinations, and semantic if-then judging):

- Profile kept full (all demographics, incl. age) per project decision - we need
  the year-one profile data.
- The redundant red/blue/purple "side" question was merged into the domain
  question; the tools section now branches off domain (`roles-q-0`).
- Result: 46 -> 27 questions. Per-respondent median 21 (range 18-25), 78% of
  profiles in the 15-22 target band. Option-reads 424 -> ~150.
- Structure proven sound: no dead nodes, every `showIf` backward and in range,
  all guards single-select.
- Contradictions resolved: intern seniority, freelancer org, student role,
  research/malware tools asymmetry, exploring-has-no-tools, employment-Other org.
- A full rendered decision-tree diagram was produced for review.

### Expert panel pass

A second review by four personas (survey statistician, cybersecurity consultant
for the Moroccan market, senior practitioner walking three respondent paths,
sociologist) was applied where at least three agreed, plus the localized lists:

- The vuln block now separates finding from reporting: "outside paid work or an
  official bug bounty, have you come across a flaw?" -> did you report (every
  time / some / never) -> reasons (multi) and outcome (multi). The old
  single-select mixed the three and could not hold "reported one, withheld one".
- Neutral law-perception scale, asked before the specific vuln items; the loaded
  "treats us like criminals" option is gone. "Keep it or sell it" removed.
- Students and job seekers skip "pressured to hide". Under-18s see the vuln
  block like everyone else (owner decision: teens are active in bug bounty).
- Experience and income band edges no longer overlap; MAD top band split at
  40k/60k; EUR-only abroad scale. Gender stays Male / Female only (owner decision).
- Employment is split by employer (Moroccan vs foreign org, incl. remote from
  Morocco) so the income currency follows the employer without engine changes.
- Local stack: network & infrastructure domain, vendor certs (Fortinet, Cisco,
  Microsoft, CRTP/CRTO/PNPT/BSCP), Fortinet / Palo Alto / EDR tools, KQL/SPL,
  Big Four / ESN / regie / public sector org types.
- Primary OS cut; replaced by "which rules have you dealt with" (Law 05-20 /
  DGSSI, maCERT, 09-08 / CNDP, Bank Al-Maghrib, EU rules via clients).

Model-check (real `evaluateCondition`, all 17,280 fork combinations): 29
questions, median 21 per person (range 16-27; 24+ only for people who found a
flaw and withheld some), no dead nodes, no structural or semantic violations.

### Architecture council + synthetic respondents

A five-seat council (tree architect, bug bounty hunter, hiring manager, Moroccan
sociologist, cyber lawyer) redesigned the tree in two rounds (proposals, then a
ballot), within Moroccan law and norms:

- Bug bounty fork for everyone, teens included (`roles-q-2`, authorized programs
  only), unlocking yearly earnings (USD) and "what makes it harder from Morocco"
  (payouts, KYC, age limits, Office des Changes...).
- The vuln block only asks about flaws noticed while using a service; the
  hypothetical "what would you do" is gone; "asked to hide" no longer names
  authorities.
- Client location for freelancers and founders; a two-year outlook question;
  languages cut; certifications merged into one question with "None yet".

Nine synthetic respondents then took the survey (student, teen hunter, junior
SOC, senior lead, Bac-only public-sector head, OFPPT sysadmin doing security,
career switcher on regie, auto-entrepreneur freelancer, non-technical GRC).
Their gaps were fixed inside existing questions: experience counts security as
part of any job, education asks level only, IT/sysadmin staff fit the network
domain, income rules for allowances / bounty / freelancers, more Moroccan market
blockers, GRC and CISOs see a tools list, sector regulators beyond Bank
Al-Maghrib.

Model-check: 31 questions, median 22 per person (range 17-28), no dead nodes,
no structural or semantic violations.

### Logic audit (6 agents: one per fork + a red team)

- Engine bug fixed: answers to questions that became hidden after going back were
  kept, so a stale guard answer could re-show its dependents (e.g. under-18 after
  first answering as an adult still saw employment and income) and the server
  saved them. `pruneHiddenAnswers` (src/lib/conditions.ts) now walks the survey in
  order and drops them, on every answer change (client) and in `sanitizeAnswers`
  (server).
- Age and education are forks: under-18s skip experience, education, employment
  and the market question; lycee students skip employment and the market question.
- "First security job" barriers go to anyone with no professional experience
  (not to laid-off seniors); under-18s get a forward-looking copy (work-q-7,
  merge with work-q-6 at export).
- "Rules at work" and "asked to hide" go to anyone with professional experience,
  including job seekers who left a job.
- Every domain except GRC/CISO sees a tool list; the defensive list now covers
  AppSec/cloud, DFIR, firewalls beyond Fortinet.
- Bug bounty barriers also go to "Not yet" (age limits, KYC keep teens out).

Data-cleaning flags (the engine cannot hide options): age 18-24 with 8+ years,
lycee with 5+ years, "No experience" with Lead/Manager seniority, Freelancer
"incl. full-time bug bounty" with bug bounty "No", contradictory multi-selects
("None yet" + a cert, "I don't use AI" + a use), "pick up to 3" not enforced.

Model-check: 32 questions, 1,036,800 fork combinations, 675 distinct paths,
median 22 per person (range 14-28), no dead nodes, no violations.

### Organigram leaf review + engine upgrade

An organigram (age -> education -> experience -> employment, 18 leaves) was
reviewed leaf by leaf, down to every option, by 5 agents. Most findings were
options that made no sense for one leaf, which the engine could not express, so
the engine gained three features (syntax in `docs/survey-system.md`):

- `showIf` with `all` / `any` of several conditions.
- `optionShowIf`: hide choices per respondent. Hidden choices keep their index;
  the client and the server drop picks of hidden choices.
- `exclusive`: a multiple-choice pick that clears the others, enforced server-side.

Tree changes:

- Profile order is now age -> education -> experience -> employment, so lycee
  students skip experience as well as employment.
- Under-18s no longer get a "first job later" copy (dropped); teens and lycee
  students get "After your studies, where would you like to work?" instead of
  the two-year outlook.
- Income, organization type and seniority need security experience (a non-security
  salary is not a security salary). Employment "Other" gets the income question.
  Interns get stipend bands; employees no "No income".
- Options now follow the respondent: 8+ years hidden for 18-24, CISO domain /
  seniority / CISSP only from 3-4 years of experience (hidden up to 1-2 years), no
  university or bootcamp for teens, "on-the-job" only with experience or a job (an IT
  employee new to security does learn on the job), Morocco payout barriers hidden
  for respondents abroad, age-limit barriers only for under-25s, tool lists per
  domain (no Nessus twice, DFIR for SOC/IR/TI, GRC platforms for GRC/CISO).
- Exclusive "None" / "Prefer not to say" options on certifications, barriers,
  tools, AI use, rules and the flaw block.
- Wording: experience counts bug bounty only as a main income; first-job
  barriers also for job seekers ("first (or next)"); flaw block asks about "one
  or more" flaws, adds "Wasn't sure it was a real flaw", "No reporting contact",
  "No answer yet".

Data-cleaning flags left: "pick up to 3" is still not enforced.

Model-check (equivalence classes of every guard, real engine including option
visibility): 32 questions, 540 distinct paths, median 19 per person (range
13-28), no dead nodes, every visible question shows at least 2 choices, no
violations.

### Second swarm (5 leaf reviewers + an engine red team)

Engine bugs found by the red team (reproduced with the real machine) and fixed:

- A required multi-select emptied by a hidden option after going back blocked
  every submit ("required"). Emptied picks now count as unanswered on the client,
  and the server drops an empty required answer instead of rejecting the payload.
- Stored answers that became hidden stayed in Firestore, because the client no
  longer sent them. The server now deletes every answer field it does not save.
- One misclick on an earlier answer erased later answers for good. The client now
  keeps every answer given and only prunes the view, so undoing restores them.
- Validator: condition indices are range-checked, unknown keys (`exlusive:`, a
  leaf mixed with `all`) are errors, and a required question whose every choice is
  conditioned is a warning. The steps bar opens a section on its first visible
  question; choices are reachable by keyboard.

Tree changes:

- First-job barriers also go to interns, students and job seekers who already
  have some experience (an internship counts), with barriers matched to the level.
- Students get "After your studies, where would you like to work?".
- Legal safety: tool questions say "at work or in labs / CTFs"; the payout barrier
  no longer mentions a "workaround"; "worried about legal trouble" and (under 25)
  "family or school against it" added.
- Minors' bug bounty earnings stop at one "$2,000 or more" band, so top teen
  hunters cannot be singled out in published data.
- Income wording (pay slip of the main job; 13th month, side jobs out; bug bounty
  only as main income), MAD 20-30k and EUR 2-3k bands split; founders describe
  their company; public administration split from state-owned companies.
- Tools: no tool listed twice, Moroccan vendors (Huawei, Stormshield, ESET, Trend
  Micro, Sophos), TI / malware / forensics / SOAR split, enterprise tools hidden
  for teens and people still exploring.
- Flaw block: "Other" and (minors) "too young to be taken seriously" reasons;
  "asked to hide" splits incident vs finding and also reaches IT staff.

Model-check: 32 questions, 630 distinct paths, median 20 per person (range
13-28), no dead nodes, no violations.

### Calibration on stateofdev.ma

stateofdev.ma has surveyed Moroccan developers for five years, so its survey is the
Morocco baseline. Where both surveys ask the same thing, stateofsec now uses its
wording and bands, so dev and sec results compare side by side:

- Age labels, location (12 official regions in its order, plus Europe, US & Canada,
  Middle East, Others; a follow-up asks the country), education background (plus a
  lycee option for 18-24), experience bands (none, <1, 1-2, 3-4, 5-6, 7-10, 11-16, 16+).
- Pay: its MAD net monthly bands (interns get sub-bands of "< 4 000", seniors get the
  top band split; every band nests into one of its bands), freelancer daily rate (TJM)
  in MAD, gross yearly USD for foreign employers, daily USD for freelancers abroad.
- Its questions that fit security people: languages, learning challenges, remote
  arrangement, overtime, job satisfaction, unemployment after graduation, job offer
  factors, company and work-mode preference, plans to work abroad and to come back,
  AI frequency and "will AI replace us", and its community block.

Kept on purpose: employment split by employer (Moroccan vs foreign), the security
core, and the regulation question instead of the operating system one.

### Validation method

1. Logic, proved by exhaustion: conditions only test equality or membership on
   earlier single-choice answers, so answers that every condition treats the same
   are interchangeable. A depth-first search over these classes visits every
   reachable path and checks every rule on each one (model checking).
2. Plausibility, measured: stateofdev.ma publishes its raw answers. On 7,161
   respondents (2021-2024, the same experience bands as ours), each profile pair
   (age, education, experience, employment) gets its share with a Wilson 95%
   interval. A choice is hidden when we are 95% sure it is under 0.5% (18-24 with
   7+ years, 25-34 with 16+ years). A rare but real pick (under 2%) gets a soft
   check instead: founders aged 18-24 (1.1%), 18-24 with 5-6 years, 25-34 with
   11-16 years, a doctorate before 35, founders with under 3 years, interns or
   students aged 35+, interns with 5+ years, students with 7+ years. Self-taught
   founders over 35 (15%) and 35+ career switchers with no experience (5%) are
   common enough to need neither. "Looking for work" at 35+ is not checked (a
   sensitive situation).
3. Meaning: every question shown keeps at least two choices for that respondent.

Caveat: stateofdev.ma measures developers, not security people, and only about
100 under-18s answered; these thresholds are a Moroccan proxy to revisit with
stateofsec's own first results.

Model-check (depth-first over every reachable class of answers): 53 questions,
4,680 distinct paths, 22-47 questions per person (median 40, stateofdev.ma's
length), no dead nodes, no violations. The class count grew from 916,720 to
1,827,280 when the learning options became age-dependent. These figures came from
throwaway scripts that were lost; they were re-proved by the in-repo verification
(see "Verification results" below for the current figures).

### Research corrections (docs/research/)

A research program (completion psychology, UI/UX, Morocco/MENA, comparable
surveys, validation design, retrospective; see `docs/research/`) led to:

- Shorter lists: MAD, TJM and USD pay bands merged (22 to 16 MAD bands; every band
  is a union of stateofdev.ma bands, so pay still compares); tool lists replaced by
  5 offensive and 6 defensive categories.
- Overtime (7 to 4 levels) and job-offer factors (14 to 8) shortened because peers
  found the HR-profiling questions redundant: these two are not comparable with
  stateofdev.ma.
- A steps bar that lists every section the respondent can still reach, so it no
  longer pops sections in mid-survey; compact choice rows; optional choice groups
  (display only).
- CI now runs the survey validator, and a test fails on any validation error.

### Verification and QA plan (2026-10-27)

Four planners (formal methods, survey methodology, software QA, disclosure
control) produced the plan; owner decisions: shorter lists above kept, open data
protected at export (survey unchanged; the public file is coarsened, the flaw block
is published as a separate unlinked file, and a release gate checks k-anonymity),
Playwright, fast-check and z3 (in CI) approved. Verification tools live in the
repo this time (scripts/ and CI), with a lock on positional ids before launch.

Pending: human review (Ashraf + mchklt) before launch.

### Later fixes (mchklt)

- "Pick up to 3" is enforced: `max: 3` on the question (schema, validator, form, `sanitizeAnswers`); the hint is no longer in the label.
- Blank "other" text is dropped and the rest trimmed on the server.
- Question labels shortened; ids, order and choice indexes unchanged.
- An expired session on submit sends the respondent back to /before-start (answers stay in
  localStorage); the captcha renders even when Cloudflare's script loads first.

### Verification results and owner decisions (2026-10-28)

The plan above was carried out by six agents, each in its own worktree, then merged:

- Model checker (`pnpm verify-survey`, src/lib/verify): sound equivalence classes (a guard's
  answers share a class only if every condition, option rule, soft check, exclusive and
  "Other" membership agrees, plus a "no answer" class), cross-checked by brute force on
  fixtures and 150 random surveys, with seeded defects it must catch. Proves the 64
  invariants of `scripts/verify/spec.yml` (external review reported, not a gate), pins
  golden statistics and locks positional ids (`survey/survey.lock.json`).
- Independent z3 cross-check (`pnpm verify-smt`): 550 queries (dead questions and options,
  options per question, soft checks, the age, income and outlook properties), written from
  the docs only.
- Client/server parity fuzzer (fast-check), pruning laws, machine invariants and an
  endpoint abuse table; Playwright walks of every profile leaf at 3 viewports, keyboard
  only, reload, double click, offline and screenshot baselines.
- Plausibility rebuilt from stateofdev.ma 2021-2025 (`scripts/verify/plausibility.ts`),
  question audit and burden (`docs/verification/method-audit.md`), persona grid.
- Privacy simulator, coarsened public release and release gate (`docs/privacy.md`).

Bugs found and fixed: an emoji split at the 200-character cut of "other" text; choice rows
under 44px on phones; choices without an accessible name; Back not keyboard reachable; a
double click on Next skipping a question; the Next bar never sticky (`overflow-x: hidden`);
a client that lost its saved answers wiping later sections on its first submit (deletes
now stop at the submitted section); a deploy mid-survey failing every retry (unknown ids
are now ignored).

Owner decisions:

- Survey changes from the audit, all applied: the domain question asks about current work;
  "I already live and work outside Morocco" replaces "Currently working outside Morocco"
  and is offered only to respondents abroad; the unemployment question is hidden from the
  self-taught; the "asked to hide" question has a 3-year timeframe and separates being
  asked from seeing it; "has the community helped" no longer presumes help; Facebook,
  WhatsApp groups and None added to social networks; exits on five required
  multi-selects; Nessus listed once per respondent (pentesters keep a scanner choice).
- Six new soft checks: 60 000+ MAD with under 3 years, under 4 000 MAD for an employee
  with 7+ years, under $20,000 a year abroad (stateofdev.ma: under 2% each); a daily USD
  rate of $2,000+ (a unit check: 28.6% of stateofdev.ma's freelancers abroad typed a
  monthly rate), Junior with 11+ years and "Still exploring" with 7+ years (judgment).
- HR block cuts (peers found it redundant): "What type of company do you prefer?" dropped;
  the preferred work mode only for those not asked their current remote arrangement; the
  job-market question only for practitioners (students, interns, job seekers and people
  without experience answer the first-job question instead).
- Docs and YAML disagreed twice; the YAML wins (CISO from 3-4 years, on-the-job for
  employees new to security).
- "Other" stays on "Why did you not report it?" (free text never leaves the private
  export).
- Open data: charts and totals only this year, no row-level file (`docs/privacy.md`).
- Time: the start and share pages say about 10 to 15 minutes. Measured on typical paths:
  adults 11.5-14.4 minutes at 150 wpm (second-language readers), 9.4-11.0 at 200;
  under-18s 7.4-9.2.

Fresh review (an agent with no prior context, before the push) found no high-severity
defect; fixed:

- A respondent who went back, turned out to be a minor and left kept their stored pay and
  seniority: a submit now also deletes later answers that its own answers settle as hidden,
  and the public release prunes every row of hidden answers before anything else.
- The public export could still write row-level files: it now refuses unless
  `--allow-rows`, matching "charts and totals only this year".
- Threat-intel and malware people had no reverse-engineering choice, and minors in SOC,
  DFIR or threat intel had lost the free DFIR tools: a defensive "Malware analysis &
  reverse engineering" choice (SOC, IR, threat intel only, so it is never listed twice),
  and only the enterprise suites stay hidden from minors.
- The income question says "fixed allowances included" again.

DAG map review (2026-10-28): every question and option was partially evaluated for a
ladder of 12 profiles (teen, lycee, student, intern, junior, mid, senior, remote lead, head of
security, founder, freelancer, abroad). Changes:

- "Unemployed after graduation" only for graduates with 0-2 years of experience who are not
  students: seniors would describe the market of 15-20 years ago.
- Heads of security get SIEM and network tools ("you or your team").
- Respondents living abroad skip "plans to work outside Morocco" and go straight to "Do you
  plan to come back to live in Morocco?" (a student abroad had no fitting answer); the "I
  already live and work outside Morocco" choice is gone. Every respondent gets exactly one
  of the three outlook questions.

Current figures: 52 questions, 4,680 distinct complete paths, 22-44 screens per path
(median 36, p90 40), no findings; adults about 11.5-13.6 minutes at 150 wpm, 9.2-10.9 at
200.
