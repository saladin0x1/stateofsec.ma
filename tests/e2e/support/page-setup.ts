import type { Page } from "@playwright/test";

// Everything a test can observe from outside the page while it walks the playground

export interface SubmitRecord {
  answers: Record<string, unknown>;
  // The browser was offline, so the request failed like a real network error
  offline: boolean;
}

export interface PageProbe {
  // Every call to the submitAnswers action, in order
  submits: SubmitRecord[];
  // The survey asked for /thanks (the end of the survey)
  thanksRequested: boolean;
  // Status of that /thanks response, when the navigation goes through (the playground cancels it)
  thanksStatus: number | null;
  // Trusted mouse or touch presses the pages received, across navigations (keyboard-only
  // walks expect none)
  pointerEvents: number;
}

export const KEEP_PROGRESS_FLAG = "e2e-keep-progress";

interface SetupOptions {
  // Delay every submitAnswers call, like a slow network (the playground answers instantly)
  submitDelayMs?: number;
}

// The playground (src/pages/playground.astro, local only) answers submitAnswers with an
// instant 204 from a window.fetch stub and wipes saved progress on every load. These init
// scripts run before it and:
// - decline analytics like a visitor would, so a consent banner never covers the survey
// - hide the Astro dev toolbar (dev server only; production has none)
// - wrap whatever window.fetch the page installs, to record each submit and to fail it
//   while the browser is offline (the stub never reaches the network on its own)
// - when a test sets the keep-progress flag, skip the playground's one wipe so a reload
//   restores progress the way the production /survey page does
export async function preparePage(page: Page, options: SetupOptions = {}): Promise<PageProbe> {
  const submits: SubmitRecord[] = [];
  const probe: PageProbe = {
    submits,
    thanksRequested: false,
    thanksStatus: null,
    pointerEvents: 0
  };

  await page.exposeFunction("__e2eSubmit", (body: string, offline: boolean) => {
    let answers: Record<string, unknown> = {};
    try {
      answers = (JSON.parse(body) as { answers?: Record<string, unknown> }).answers ?? {};
    }
    catch {}
    submits.push({ answers, offline });
  });
  await page.exposeFunction("__e2ePointer", () => {
    probe.pointerEvents++;
  });

  page.on("request", (request) => {
    if (request.isNavigationRequest() && new URL(request.url()).pathname === "/thanks")
      probe.thanksRequested = true;
  });
  // The local playground cancels the navigation to /thanks (which needs a session and would
  // bounce to the captcha) and shows its own finished screen: the attempt still counts
  await page.exposeFunction("__e2eThanks", () => {
    probe.thanksRequested = true;
  });
  await page.addInitScript(() => {
    const win = window as unknown as {
      navigation?: { addEventListener: (type: string, listener: (event: { destination: { url: string } }) => void) => void };
      __e2eThanks?: () => void;
    };
    win.navigation?.addEventListener("navigate", (event) => {
      if (new URL(event.destination.url).pathname === "/thanks")
        win.__e2eThanks?.();
    });
  });
  page.on("response", (response) => {
    if (response.request().isNavigationRequest() && new URL(response.url()).pathname === "/thanks")
      probe.thanksStatus = response.status();
  });

  await page.addInitScript(({ submitDelayMs, keepProgressFlag }) => {
    const win = window as unknown as {
      __e2eSubmit?: (body: string, offline: boolean) => void;
      __e2ePointer?: () => void;
    };

    try {
      localStorage.setItem("analytics-consent", "denied");
    }
    catch {}

    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = "astro-dev-toolbar { display: none !important; }";
      document.head.append(style);
    });

    for (const type of ["pointerdown", "mousedown", "touchstart"]) {
      window.addEventListener(type, (event) => {
        if (event.isTrusted)
          win.__e2ePointer?.();
      }, true);
    }

    try {
      if (sessionStorage.getItem(keepProgressFlag) === "1") {
        sessionStorage.removeItem(keepProgressFlag);
        const removeItem = Object.getOwnPropertyDescriptor(Storage.prototype, "removeItem")?.value as (this: Storage, key: string) => void;
        let skipped = false;
        Storage.prototype.removeItem = function (this: Storage, key: string) {
          if (!skipped && key === "survey-state" && this === localStorage) {
            skipped = true;
            return;
          }
          removeItem.call(this, key);
        };
      }
    }
    catch {}

    type Fetch = typeof window.fetch;
    const wrap = (inner: Fetch): Fetch => async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL ? input.href : input.url;
      if (url.includes("/_actions/submitAnswers")) {
        const offline = !navigator.onLine;
        win.__e2eSubmit?.(typeof init?.body === "string" ? init.body : "", offline);
        if (offline)
          throw new TypeError("Failed to fetch");
        if (submitDelayMs > 0)
          await new Promise(resolve => setTimeout(resolve, submitDelayMs));
      }
      return inner(input, init);
    };
    let current = wrap(window.fetch.bind(window));
    Object.defineProperty(window, "fetch", {
      configurable: true,
      get: () => current,
      set: (next: Fetch) => {
        current = wrap(next);
      }
    });
  }, { submitDelayMs: options.submitDelayMs ?? 0, keepProgressFlag: KEEP_PROGRESS_FLAG });

  return probe;
}

// Reload the page and keep the saved progress (the production survey page keeps it)
export async function reloadKeepingProgress(page: Page) {
  await page.evaluate(flag => sessionStorage.setItem(flag, "1"), KEEP_PROGRESS_FLAG);
  await page.reload();
}

export async function openPlayground(page: Page) {
  await page.goto("/playground");
  await page.locator("#survey-form [data-testid=\"next-button\"]").waitFor({ timeout: 60_000 });
}
