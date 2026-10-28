# Architecture

Codebase structure and file organization for stateofsec.ma.

## Directory Structure

### `/survey/`
YAML files defining survey questions organized by sections.

- Format: `{position}-{section-name}.yml`
- Structure: `{ title, label, position, showIf?, questions: [{ label, required, multiple, choices, max?, showIf?, optionShowIf?, exclusive?, softChecks? }] }` (condition syntax in `docs/survey-system.md`)
- Questions referenced by ID: `{section-label}-q-{index}` (e.g., `profile-q-0`); ids are positional
- Loaded once in `src/lib/survey.ts` and shared by the survey page and the server

### `/results/{year}/`
Exported survey results and metadata (none published yet).

- `data/results.json` - Raw response data (answers indexed by question ids)
- `data/questions.json` - Questions map with choices, generated from the survey YAML
- `sections/*.mdx` - Report sections using `<Chart id="..." />`
- Licensed under ODC-ODbL

### `/src/actions/`
Astro server actions.

- `init-session.ts` - Checks the Turnstile captcha and the Firebase ID token, then sets the signed session cookie
- `submit-answers.ts` - Checks the session, validates answers against the survey (`src/lib/answers.ts`) and saves them
- Both reject requests when `SURVEY_OPEN` is false (`src/site-config.mjs`)

### `/src/lib/`
- `firebase/client.ts` - Browser Firebase SDK (anonymous sign-in)
- `firebase/server.ts` - ID token verification and Google access tokens with `jose` (Workers-compatible)
- `firebase/database.ts` - Firestore REST writes (merge via update mask; masked fields absent from the body are deleted)
- `session.ts` - HS256-signed session cookie (`httpOnly`, `secure` in production, `sameSite=lax`, 5 days)
- `captcha.ts` - Turnstile siteverify, required in production
- `answers.ts` - Server-side answer validation and hidden-question cleanup
- `conditions.ts` - `showIf` evaluation shared by client and server
- `secrets.ts` - Request-time secret access (`getSecret`)

### `/src/components/survey/`
Survey form components.

- `survey-machine.ts` - XState machine driving navigation, validation and submission
- `survey-context.tsx` - Actor context and progress persisted in localStorage (keyed by a hash of the questions)
- `survey-form.tsx`, `question.tsx`, `steps.tsx`, `survey-controls.tsx` - UI
- Answers are stored as `{ "question-id": choiceIndex }`, a number (single) or an array (multiple)

### `/src/components/chart/` and `/src/components/report/`
Results visualization, used once a year's results are published.

- `chart/data.ts` - Registry of published years (empty until the first report)
- `chart/utils.ts` - `getQuestion()` aggregation
- `report/index.astro` - Renders a year's MDX sections

### `/src/pages/`
- `index.astro` - Landing page
- `faq.astro` - FAQ
- `before-start.astro` - Rules, captcha and session start
- `survey.astro` - Survey form (requires a session)
- `thanks.astro` - Thank-you page with share posts (requires a session)

### `/scripts/`
- `export-results.ts` - Dump Firestore responses to results.json (Node, `firebase-admin`)
- `generate-questions.ts` - Create questions.json from the survey YAML
- `query-results.ts` - Query results from the CLI (see [query-results.md](./query-results.md))
- `validate-survey.ts` - Validate the survey YAML
