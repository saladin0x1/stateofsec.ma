# Survey System

End-to-end survey flow, session management, and answer data structures.

## Survey Flow

### 1. Session Initialization (`/before-start`)

- The visitor reads the rules and completes the Cloudflare Turnstile captcha
- The browser signs in anonymously with Firebase and gets an ID token
- `initSession` verifies the captcha (required in production, hostname checked) and the ID token, then sets a signed `session` cookie
- Redirect to `/survey`

### 2. Survey Submission (`/survey`)

- The page redirects to `/before-start` without a valid session
- Questions come from `src/lib/survey.ts` (the YAML files), organized by sections
- Answers are collected as `{ "question-id": choiceIndex, "question-id-others": "text" }`
- Each section is submitted through `submitAnswers` with all answers collected so far
- The server rejects unknown ids, invalid choice indexes and empty required answers, deletes answers to questions now hidden by `showIf`, and saves to Firestore with the anonymous user id as document id

### 3. Data Export (manual)

- `pnpm export-results --output=results/<year>/data` dumps all Firestore documents to `results.json`
- `pnpm generate-questions --output=results/<year>/data` creates `questions.json` from the YAML
- Run both before changing the survey for the next edition

### 4. Results Display (`/{year}` pages, once published)

- `getQuestion({ id, condition?, groupBy?, year })` filters and aggregates data
- Charts render with percentages

## Answer Data Structure

- **Single choice**: `{ "profile-q-0": 1 }` (choice index)
- **Multiple choice**: `{ "profile-q-2": [3, 2] }` (array of choice indexes)
- **With "other" text**: `{ "profile-q-3": 6, "profile-q-3-others": "custom text" }`, only kept while an "Other" choice is selected
- **Skipped**: `{ "profile-q-4": null }` (single) or `[]` (multiple), only for questions that are not required

An "Other" choice is one whose text is exactly "Other" or "Others", optionally followed by a parenthesis, e.g. "Other (please specify)".
