# Browser Tests (Playwright)

These tests walk the real survey UI in Chromium, one screen at a time, the way a respondent does.

## Requirements

- **The local playground page.** The survey normally needs a Turnstile captcha and a session cookie, so the tests drive `src/pages/playground.astro` instead: a dev-only page that renders the survey without a session and answers the per-section save with an empty 204. It is gitignored and must never be committed (`src/lib/production-routes.test.ts` enforces that). Copy it in from a maintainer's checkout before running; `playwright.config.ts` stops with an error when it is missing.
- **Chromium for Playwright 1.55** (`chromium-1187`). The config uses `channel: "chromium"`, so only that browser is needed, not the separate headless shell. Install it once with `pnpm exec playwright install chromium` if it is missing.
- **Port 4322 free.** `pnpm test:e2e` starts `pnpm dev --port 4322` itself and stops it afterwards (`reuseExistingServer: false`).

## Not in CI Yet

The playground is local-only, so CI has no page to drive. Running these in CI needs either a test-only route that stays out of production builds, or a test session cookie for `/survey`: an owner decision. The screenshot baselines are also macOS (`-darwin`) only; a Linux CI would need its own baselines.

## Running

```sh
pnpm test:e2e                                # everything (about 4 minutes)
pnpm test:e2e personas.e2e.ts                # one file
pnpm test:e2e -g "abroad-canada"             # one test
pnpm test:e2e visual.e2e.ts --update-snapshots  # accept intended visual changes
```

Failures keep a trace and a screenshot in `tests/e2e/test-results/` (gitignored); open a trace with `pnpm exec playwright show-trace <path>/trace.zip`.

## What Is Covered

| File | What it checks |
|---|---|
| `personas.e2e.ts` | One persona per leaf of the profile tree, plus five extreme profiles. Each walks to `/thanks` and checks numbering, soft checks, the questions it must or must not see, one submit per section, and that the final submission holds exactly the questions shown |
| `viewports.e2e.ts` | Three personas at 390x844, 768x1024 and 1280x800: no horizontal scroll, and choice rows at least 44px tall at 390px |
| `keyboard.e2e.ts` | A full walk with Tab, Space, arrow keys and Enter only (no mouse events reach the page), Back by keyboard, and accessible names on every choice |
| `resilience.e2e.ts` | Reload mid-section, double-click on Next, submitting while offline, and going back to hide then show an answered question |
| `visual.e2e.ts` | Screenshot baselines (`__screenshots__/`) of a long list, the tool categories, the Other text box, the soft check prompt and the required error at the three viewports |

## How It Works

- `personas.ts` maps question labels (exact YAML text) to the choice text a persona picks; questions it does not list get the first visible choice. Labels and choices are checked against `survey/*.yml`, so a survey edit that renames one fails loudly instead of silently falling back.
- `support/walker.ts` reads the current question from the page (`<section>-q-<n>` containers, the `N. label` heading, the choice inputs), answers it with the mouse or the keyboard, presses Next, confirms soft checks, and stops at `/thanks`. Without a session, `/thanks` redirects to `/before-start`; the walker counts the request for `/thanks` as the end.
- `support/page-setup.ts` adds init scripts that run before the playground's own script: decline analytics, hide the Astro dev toolbar, record every `submitAnswers` call (and fail it while the browser is offline, since the playground stub never touches the network), and, when a test asks, keep the saved progress over a reload the way the production `/survey` page does (the playground wipes it on load).
- Tests named `*.e2e.ts` so Vitest, which picks up `*.test.ts` and `*.spec.ts`, never runs them.

## Known Bug Kept as an Expected Failure

`the Next bar stays on screen on a long list (390x844)` is marked `test.fail()`: `overflow-x: hidden` on `html` and `body` in `src/globals.css` stops the sticky actions bar from sticking. When that is fixed the test passes, Playwright reports it as an unexpected pass, and the `test.fail()` line should be removed.
