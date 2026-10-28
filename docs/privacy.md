# Privacy of the Published Data

The owners' decision (see "Verification and QA plan" in `docs/survey-redesign.md`) is to
**protect at export**: the survey is unchanged, the public data file is coarsened, the
sensitive flaw block is published as a separate file that cannot be joined back, and a
release gate refuses to write anything unless k-anonymity thresholds pass. The code lives
in `scripts/privacy/`.

## Threat Model

**Who might try.** A colleague, manager, client, recruiter or journalist who already knows
some facts about a respondent (from LinkedIn, a conference badge, a CV, a CTF team page)
and looks for their row in the open data.

**What they know** (quasi-identifiers, checked as nested sets):

| Set | Fields |
| --- | --- |
| S1 | gender, age, region (and country, in the raw data) |
| S2 | S1 + education, security experience, employment situation |
| S3 | S2 + domain, seniority, organization type, pay (MAD, daily rate, USD salary, USD daily rate), bug bounty status |
| Minors | gender, age, region, domain, bug bounty status, bug bounty earnings, certifications |

**What they want.** To find a person's row and read the rest: pay, job satisfaction,
plans to leave, and above all the flaw block (noticed a flaw, reported it or not and why,
what came back) and "asked to hide or downgrade a finding". Employers and clients have a
direct interest in the last two. Minors need stronger protection (they cannot weigh the
risk, and a teen bug hunter is easy to single out).

**Other routes to a person.** Firestore document ids and timestamps (session linkage),
free text (people type their employer's name), the country of people abroad, row order,
and the survey's branching: which follow-up questions a row answered reveals the answers
that opened them, so a blanked field can be read back from the questions around it.

**Out of scope.** The owners (they hold the raw data), Firestore access control, and
analytics (constraint A: never linked to answers). Constraint D (never *how*, never *which
org*) is enforced by the survey itself; the export adds the protections below.

## What Gets Published

`pnpm export-public` (or `export-results --public=...`) writes four files, and only when
the gate passes:

| File | Content |
| --- | --- |
| `results.json` | One row per respondent: coarsened answers, rows shuffled |
| `questions.json` | The published questions with their coarsened choices |
| `flaws.json` | The flaw block (`community-q-3` to `community-q-7`), one row per person who answered it, shuffled separately |
| `flaws-questions.json` | Those questions, plus `age-group` and `region-group` |

Removed from `results.json`: the user id, `lastUpdated` and any other non-answer field,
every `-others` free text, the country (`profile-q-3`), and the whole flaw block.
Unanswered and not-asked questions are both left out, so a gap does not say which.

`flaws.json` has no join key: only an age group (under 18 / 18 or older) and a coarse
region (Casablanca-Settat or Rabat-Salé-Kénitra / elsewhere in Morocco / abroad), coarsened
further when needed. Free text is dropped there too.

## Every Merge

Level 0 is the owners' decision. Higher levels are fallbacks the release uses, coarsest
last, only when level 0 needs more than the suppression budget; the gate report lists the
levels used.

| Field | Level 0 (owners) | Fallback levels |
| --- | --- | --- |
| Age | 35-44 and 45+ -> "35 or older" | none |
| Region | Casablanca-Settat, Rabat-Salé-Kénitra, Marrakech-Safi, Tanger-Tétouan-Al Hoceïma, Fès-Meknès kept; Souss-Massa + Guelmim-Oued Noun + Laâyoune-Sakia El Hamra + Dakhla-Oued Ed Dahab; L'Oriental + Béni Mellal-Khénifra + Drâa-Tafilalet; Europe, US & Canada, Middle East, Others -> "Abroad" (country dropped) | 1: Casablanca / Rabat / elsewhere in Morocco / abroad; 2: Morocco / abroad |
| Experience | 11-16 and 16+ -> "11 years or more" | 1: none, <1, 1-2, 3-6, 7+; 2: none, <3, 3+ |
| Education | kept | 1: lycée; self-taught (apart: they skip the unemployment question); coding school or other field's diploma; Bachelor's or other; Master's, doctorate or private engineering school; vocational |
| Seniority | Manager + Head of security / CISO -> "Manager or head of security / CISO" | 1: junior or mid; senior or lead; manager or head |
| Income (MAD) | 30 000-60 000 and > 60 000 -> "> 30 000" | 1: < 4 000 (incl. intern sub-bands), 4-8k, 8-16k, 16-25k, > 25k, interns' "> 8 000" |
| Daily rate (MAD), salary (USD), daily rate (USD) | kept | 1: three wide bands each |
| Organization type | kept | 1: five groups; 2: private / public / other |
| Bug bounty status | kept | 1: "regularly" + "now and then" |
| Bug bounty earnings | adults' $5,000-19,999, $20,000-49,999, $50,000+ -> "$5,000 or more" (minors already have one "$2,000 or more") | 1: nothing or swag; < $2,000; $2,000 or more |
| Certifications | 13 choices -> 5 tiers: none; entry-level (free certificates, CompTIA); intermediate (CEH, hands-on offensive, INE / HTB, ISO 27001, vendor, cloud); advanced (OSCP and other OffSec, CISSP / CISM / CISA); other | none |
| Employment, domain, gender | kept | none (employment and domain decide which questions follow; no merge is branch-safe) |

**Branch-safe merges only.** Merging two choices that lead to different follow-up
questions or options would be undone by the questions a row answered.
`guardViolations()` checks every level against the survey's `showIf` and `optionShowIf`,
a test runs it, and the release refuses to start if a survey edit breaks it.

**Leftover rare values.** After recoding, a value held by fewer than k rows (5 for S2
fields and minors, 3 for S3-only fields) is hidden wherever it appears. Then each row
still in a too-small class has one cell hidden at a time, choosing the cheapest cell
that moves it into a big enough class. How a cell is hidden:

- gender, seniority, organization type, pay, bug bounty earnings, certifications: removed;
- education, experience, employment, domain, bug bounty status: removed **with every
  other answer whose presence or options depend on it** (e.g. hiding the domain also
  removes the two tool questions it opens), so the branching cannot give it back;
- region (Morocco only): replaced by "Morocco (region not shown)";
- age: never (minors and adults are reported separately); a row that still cannot
  reach the threshold is withheld.

## Thresholds

| Check | Threshold |
| --- | --- |
| Adults, S2 | k >= 5 |
| Adults, S3 | k >= 3 |
| Minors, every identifying field they answer, in both files | k >= 5 |
| Flaw file, each sensitive question in each class | l >= 3 |
| Cells suppressed | at most 5% of identifying cells in `results.json`; at most 5% of rows withheld from `flaws.json` |

Definitions, all computed on the files as written:

- **k** of a row: how many rows share its exact values on the set; a missing value is a
  value of its own (so a blank only hides among blanks). This is classic k-anonymity of
  the release: every published combination appears at least k times.
- **l** of a class in the flaw file (same age group, region group and presence of "asked
  to hide", which tells whether the person had security work): the number of distinct
  answers to a question in the class, a missing answer counting as one; a question nobody
  in the class answered is skipped. Multi-select answers are compared as whole sets.
- **Suppression**: identifying cells hidden, plus all identifying cells of withheld rows,
  over all non-empty identifying cells. Answers removed along with a hidden cell are
  counted separately in the report.

The gate also checks that `results.json` holds only published question ids (no ids,
timestamps, free text, country or flaw block) and that `flaws.json` holds only the age
group, region group and flaw questions.

## How to Run

```sh
pnpm privacy:simulate                          # n = 300, 800, 2000; minors 2% and 5%; seed 1
pnpm privacy:simulate --n=800 --minors=0.03 --seed=4
pnpm privacy:simulate --k-s3=1                 # what-if thresholds (simulate and check only)
pnpm privacy:check --input=scripts/<raw export>.json      # dry run, writes nothing, exit 1 on FAIL
pnpm export-public --input=scripts/<raw export>.json --output=results/<year>/data
pnpm export-results --public=results/<year>/data           # straight from Firestore, same gate
```

`export-results` without `--public` still writes the full private export (default
`scripts/<timestamp>.json`, git-ignored). It now warns when `--output` points under
`results/`: that folder is published, so the private export must not be committed there.
The README and `docs/survey-system.md` still show `--output=results/<year>/data` as the
publishing step and should be updated to `--public` (not changed here). Run
`generate-questions` as before for the full question list; `export-public` writes its own
`questions.json` with the coarsened choices, so run it last.

The simulator resamples stateofdev.ma's 2023-2024 answers (open data, ODbL, by GeeksBlaBla
and contributors; extract in `scripts/privacy/data/upstream-profiles.csv`, rebuilt by
`scripts/privacy/extract-upstream.ts`) without replacement, maps them onto our bands (pay
bands nest), and draws the security fields from planning priors in `simulate.ts`. Every
simulated row passes the server's own `sanitizeAnswers` unchanged (tested).

## Simulation Results (seed 1)

Share of rows unique and smallest k, all respondents, before (raw export) and after
(released file):

| n (minors) | S2 unique raw -> released | S3 unique raw -> released | Minors unique raw -> released | Suppression | Gate |
| --- | --- | --- | --- | --- | --- |
| 300 (2%) | 68% -> 0% (min k 5) | 99% -> 0% (min k 3) | 100% -> 0% (min k 6) | 49% | FAIL |
| 300 (5%) | 67% -> 0% | 98% -> 0% | 100% -> 0% | 50% | FAIL |
| 800 (2%) | 52% -> 0% | 97% -> 0% | 100% -> 0% | 41% | FAIL |
| 800 (5%) | 51% -> 0% | 97% -> 0% | 100% -> 0% | 41% | FAIL |
| 2,000 (2%) | 38% -> 0% | 95% -> 0% | 90% -> 0% | 31% | FAIL |
| 2,000 (5%) | 38% -> 0% | 93% -> 0% | 82% -> 0% | 32% | FAIL |

Raw S2 uniqueness matches the planning baseline measured on stateofdev.ma (66% at n=300).
The owners' merges alone barely move it (S2 63% unique at n=300, S3 still 98-99%).

The flaw block, if left in the main file, would sit in classes with l < 3 for 83-100% of
the people who answered it. In the separate file l >= 3 holds at every size; with 2%
minors at n=300 and n=800 there are too few minors to keep their flaw answers diverse, so
those 6 and 14 rows are withheld (within the 5% budget).

**What this means.** Every k and l threshold can be met, but not within the 5% budget:
S3 is the binding constraint. Even at every coarsest level, 82% of adults at n=2,000
(91% at n=800) share their S3 values with fewer than two others, so even perfect
suppression would hide at least about 7% of cells. Dropping the S3 check (what-if,
`--k-s3=1`, 3% minors) passes at n=2,000 (4.9%) but not at 800 (7.7%) or 300 (15%).
The simulated security fields are drawn more independently than real answers would be,
so real data should be somewhat less unique, but not enough to close that gap.

**Owners' decision (2026-10-28): option 3.** This year only aggregates and charts are
published, no row-level file; the site copy (FAQ, home, share text) says so. The pipeline
and gate stay for later years: a row-level release needs the gate to pass. The options were:

1. Keep the S3-only fields (domain, seniority, organization type, pay, bug bounty status)
   out of the row-level file and publish them as aggregate charts only; the remaining file
   passes from about n=2,000.
2. Publish them in a third unlinked file with few quasi-identifiers (e.g. gender, age,
   domain, bug bounty status: about 5% of adults below k=3 at n=2,000, 15-33% at n<=800).
3. Publish aggregates only this year, and row-level data from a year with enough answers.

## What Coarsening Costs

- Region: 12 regions become 8 groups at level 0 (Morocco / abroad in every simulation);
  no country for people abroad.
- Age 45+, experience 16+, pay above 30 000 MAD and bug bounty earnings above $5,000 are
  no longer visible as such; Head of security / CISO is not told apart from Manager in the
  seniority question.
- Certifications are tiers only: no count of OSCP, CEH or CISSP holders from the file.
- No free text anywhere (charts lose their "other" answers), no timestamps (no
  answers-over-time chart), no difference between skipped and not asked.
- The flaw block can only be crossed with age group and coarse region: no flaw or
  "asked to hide" rate by domain, sector, seniority or employer type from open data.
- Hidden cells are not missing at random: gender is the most often hidden field (women
  are rarer), so a gender split computed from the file undercounts women unless the
  report says so. Charts on the site are computed from the public file.

## What the Results README Must Say

Each `results/<year>/` README (or data page) should state:

- The data is a coarsened, shuffled copy of the answers: list the merges above for that
  year and the levels the gate report shows were used.
- Free text, identifiers and timestamps were removed; some cells were hidden or rows
  withheld to keep every published combination shared by at least 5 people (S2) or 3
  (S3), 5 for minors; give the year's suppression share from the gate report.
- Blank means not answered, not asked, or hidden; it is not a "no".
- `flaws.json` is a separate file that cannot be linked to `results.json`; it only keeps
  age group and broad region, and minors' rows may be withheld.
- Any attempt to re-identify a respondent is against the purpose of the data; report a
  privacy problem to the owners instead.
- License: ODbL (`results/LICENSE`), with credit to stateofdev.ma / GeeksBlaBla, whose
  open data the survey and this pipeline build on.

## Survey-Side Proposals

Owners' decisions (2026-10-28): proposal 1 declined (the "Other" box stays; its text never
leaves the private export), proposal 2 settled by option 3 (this year the badge can say
"published only as totals").


1. **Drop "Other" from `community-q-5`** ("Why did you not report it?"). Its free-text
   box is the one place where a respondent is likely to name the organization ("the bank
   I use..."). The export drops it, but the raw text would still sit in Firestore and in
   every private export. Removing the choice means no organization name is ever stored,
   which is constraint D at the source. "Prefer not to say" stays.
2. **Word the planned anonymity badge (Wave 1.3) to match what is published.** Raw but
   coarsened rows are published, so the badge must not promise "only aggregates". For
   example: "Your answers to this block are published in a separate file, shuffled and
   with no link to your other answers, showing only whether you are under 18 and roughly
   where you live. We never ask which organization." If the owners choose option 3
   above, it can say "published only as totals" for that year.

## Maintenance

- Field ids are positional: `privacy.test.ts` checks each id in `fields.ts` still holds
  the expected question, and that every recoding level still maps every choice and stays
  branch-safe. Update `fields.ts` and `coarsen.ts` together with any survey change.
- Thresholds are in `THRESHOLDS` (`scripts/privacy/release.ts`); `export-public` ignores
  what-if overrides.
