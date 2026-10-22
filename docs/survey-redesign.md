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
  seniority / CISSP only from 2 years of experience, no university or bootcamp
  for teens, no "on-the-job" without experience, Morocco payout barriers hidden
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

Pending: human review (Ashraf + mchklt) before merging to `main`.
