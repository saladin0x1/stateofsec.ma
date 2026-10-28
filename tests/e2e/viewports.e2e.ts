import type { Page } from "@playwright/test";
import process from "node:process";
import { expect, test } from "@playwright/test";
import { persona } from "./personas";
import { openPlayground, preparePage } from "./support/page-setup";
import { expectSequentialNumbering, walk } from "./support/walker";

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 }
];

const SUBSET = ["minor-bug-bounty-earner", "woman-grc-laayoune", "abroad-canada"];

// WCAG 2.5.5 (AAA) target size, and the >=44px row floor from docs/research/phase-2-uiux.md
const MIN_TARGET_PX = 44;

interface RowHeights {
  question: string;
  heights: number[];
}

// Height of every choice row on screen (the whole row is the tap target)
async function measureRows(page: Page, questionId: string): Promise<RowHeights> {
  const heights = await page.getByTestId(questionId).locator("input").evaluateAll(inputs =>
    inputs.map(input => Math.round((input.parentElement?.getBoundingClientRect().height ?? 0) * 10) / 10)
  );
  return { question: questionId, heights };
}

async function horizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// overflow-x: hidden on html/body made body a scroll container that never scrolls, so the
// actions bar's position: sticky never engaged and Next sat below the fold on long lists.
// src/globals.css now uses overflow-x: clip, which keeps the off-canvas menu clipped
test("the Next bar stays on screen on a long list (390x844)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const probe = await preparePage(page);
  await openPlayground(page);
  await walk(page, probe, persona("leaf-under-18"), { stopAt: "profile-q-2" });
  await expect(page.getByTestId("next-button")).toBeInViewport({ timeout: 2_000 });
});

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const name of SUBSET) {
      test(name, async ({ page }) => {
        const who = persona(name);
        const probe = await preparePage(page);
        await openPlayground(page);

        const rows: RowHeights[] = [];
        const overflow: string[] = [];
        const result = await walk(page, probe, who, {
          onQuestion: async (question) => {
            rows.push(await measureRows(page, question.id));
            const extra = await horizontalOverflow(page);
            if (extra > 0)
              overflow.push(`${question.id} +${extra}px`);
          }
        });

        expect(result.reachedThanks).toBe(true);
        expectSequentialNumbering(result.seen, `${name}@${viewport.name}`);
        expect(overflow, "no horizontal scrolling").toEqual([]);

        const all = rows.flatMap(r => r.heights);
        const min = Math.min(...all);
        const max = Math.max(...all);
        const singleLine = all.filter(h => h < 50);
        process.stdout.write(`[rows] ${name}@${viewport.width}: ${all.length} rows over ${rows.length} screens, min ${min}px, max ${max}px, one-line rows ${singleLine.length} (${[...new Set(singleLine)].join("/")}px)\n`);

        if (viewport.width === 390) {
          const tooSmall = rows
            .map(r => ({ question: r.question, heights: r.heights.filter(h => h < MIN_TARGET_PX) }))
            .filter(r => r.heights.length);
          expect(tooSmall, `choice rows under ${MIN_TARGET_PX}px at 390px`).toEqual([]);
        }
      });
    }
  });
}
