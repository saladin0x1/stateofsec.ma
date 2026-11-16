# State of Sec Morocco 2026: Results

Aggregated results of the first edition of [State of Sec Morocco](https://stateofsec.ma), the community survey of the people who secure, test and audit Morocco's systems. Answers were collected from 2026-10-31 to 2026-11-15; 380+ people took part, from all 12 regions of Morocco and from abroad.

The figures are those printed in the State of Sec Morocco 2026 White Paper (edition 1, [doi.org/10.5281/zenodo.23947850](https://doi.org/10.5281/zenodo.23947850)), in a form a program can read.

This dataset: [doi.org/10.5281/zenodo.24337485](https://doi.org/10.5281/zenodo.24337485).

## Files

| File | Content |
| --- | --- |
| `aggregates.json` | Shares for 50 of the 52 questions, the breakdowns printed in the White Paper, and the Moroccan Cyber Sentiment Index with its method |
| `questions.json` | The 52 questions as asked: labels, choices and routing (`showIf`, `optionShowIf`), generated from `survey/*.yml` |

In the [GitHub repository](https://github.com/saladin0x1/stateofsec.ma), both files are in `results/2026/data/`.

## What Is Published, and What Is Not

- **Aggregates only.** There is no row-level file this year: with a sample of this size, single rows could be traced back to a person (see [`docs/privacy.md`](https://github.com/saladin0x1/stateofsec.ma/blob/main/docs/privacy.md)). No free text, identifier or timestamp is published.
- **Shares, not counts.** Shares are percentages with at most one decimal. Counts are left out, except the few small-group figures the White Paper prints (under `breakdowns`).
- **Withheld.** `work-q-3` and `work-q-18` had too few answers to publish.
- **Not every option.** Where `options_published` is lower than `options_in_survey`, the White Paper does not print the rest ("Other", the least chosen options, or options shown to fewer than 10 people; for gender, it prints the share of women only).

## How to Read `aggregates.json`

```json
"profile-q-1": {
  "question": "What is your age?",
  "section": "profile",
  "multiple": false,
  "base": "all respondents",
  "white_paper": { "page": 14, "figure": "G.02" },
  "options_in_survey": 5,
  "options_published": 5,
  "shares": [{ "option": "18 to 24 years", "share": 58.6 }]
}
```

- `base` says who the share is computed among. Many questions were asked only to some respondents (the routing is in `questions.json`).
- `multiple: true`: several answers were allowed, so the shares do not add up to 100.
- `routed: true` on an option: it was shown to some respondents only, and its share is computed among those who saw it.
- `small_base: true`: few people were asked. Read the shares as directions.
- `combined`: shares the White Paper quotes for several options together. They are computed before rounding, so they can differ by 0.1 from the sum of the parts.
- Question ids are `<section>-q-<index>`, the same as in `questions.json`.

## Read With Care

This is a community sample: open, anonymous and self-selected, shared through community groups and social networks. It is young and leans towards offensive security. Nothing is weighted. The shares describe the people who answered, not all of Morocco's security workforce. The method and its limits are in the White Paper.

Any attempt to re-identify a respondent goes against the purpose of this data. If you see a privacy problem, write to saladin@stateofsec.ma or mchklt@stateofsec.ma.

## License and Credit

The data is released under the [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/), see [`results/LICENSE`](https://github.com/saladin0x1/stateofsec.ma/blob/main/results/LICENSE). You may share and adapt it with credit:

> El Ouali, S.-E., & Mouchquelita, A. (2026). *State of Sec Morocco 2026: Aggregated results* [Data set]. Zenodo. https://doi.org/10.5281/zenodo.24337485

To cite the report:

> El Ouali, S.-E., & Mouchquelita, A. (2026). *State of Sec Morocco 2026: White paper* (Edition 1). Zenodo. https://doi.org/10.5281/zenodo.23947850

State of Sec Morocco is inspired by [stateofdev.ma](https://stateofdev.ma), the Moroccan developer survey run by the [GeeksBlaBla](https://geeksblabla.community) community and its contributors. The survey code is a fork of theirs, and the results follow the same license as theirs.
