## Project Overview

State of Sec Morocco (stateofsec.ma) is an annual community survey of Morocco's cybersecurity people, by saladin0x1 and mchklt. It is a fork of geeksblabla/stateofdev.ma: keep visible credit to stateofdev.ma, GeeksBlaBla and its contributors (README, footer, FAQ, LICENSE) when changing branding.

## Tech Stack

- **Framework**: Astro 5 (server output, Cloudflare Workers via `@astrojs/cloudflare` 12)
- **UI**: React 18 + Tailwind CSS 3, theme tokens in `src/globals.css`
- **Auth/data**: Firebase anonymous sign-in in the browser; on the server, `jose` verifies ID tokens and signs the session cookie, and Firestore is written through its REST API. `firebase-admin` does not run on Workers and is only used by `scripts/export-results.ts`
- **Survey state**: XState machine (`src/components/survey/survey-machine.ts`)
- **Validation**: Zod schema for survey YAML, `src/lib/answers.ts` validates submitted answers server-side
- **Analytics**: PostHog (EU), loaded only after cookie consent (`src/components/analytics-consent.astro`)
- **Testing**: Vitest (schema and conditions tests)

## Commands

- `pnpm dev` - Dev server (http://localhost:4321)
- `pnpm build` - Validate survey, type-check, build
- `pnpm check` - Validate survey and type-check
- `pnpm lint` / `pnpm lint:ci` - ESLint with fix / check only
- `pnpm test` / `pnpm test:ci` - Vitest / with coverage
- `pnpm export-results` / `pnpm generate-questions` - Results export (see README)

## Key Files

- `survey/*.yml` - Questions. Ids are positional (`<section label>-q-<index>`): reordering breaks stored answers
- `src/lib/survey.ts` - The survey sections shared by the page and the server
- `src/site-config.mjs` - `SURVEY_OPEN` switch (pages and server actions)
- `src/actions/` - `initSession` (captcha + ID token -> session cookie), `submitAnswers`
- `src/lib/firebase/server.ts`, `database.ts`, `src/lib/session.ts`, `src/lib/captcha.ts` - Server layer
- `src/website.ts` - Name, URL, authors and upstream credit used across the site
- `astro.config.mjs` - Adapter and `env.schema` (server secrets are optional there on purpose: a missing secret must only break the survey flow, not every page)

## Conventions

- pnpm 11 with supply-chain policies in `pnpm-workspace.yaml`: approve install scripts explicitly, and prefer an older patch release over excluding a just-published version from `minimumReleaseAge`
- Read secrets at request time with `getSecret`/`requireSecret`, never at module load
- Use theme tokens (`bg-primary`, `text-muted-foreground`), not hard-coded colors; keep text contrast at WCAG AA

More detail: `docs/architecture.md`, `docs/survey-system.md`, `docs/theme-system.md`, `docs/query-results.md`.
