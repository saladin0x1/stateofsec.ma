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

Pending: human review (Ashraf + mchklt) before merging to `main`.
