import process from "node:process";
import { expect, test } from "@playwright/test";
import { personas } from "./personas";
import { openPlayground, preparePage } from "./support/page-setup";
import { sectionLabels } from "./support/survey-data";
import { expectSequentialNumbering, validatePersona, walk } from "./support/walker";

test.describe("persona walks (mouse, 1280x800)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("every persona names real questions and choices", () => {
    for (const persona of personas)
      validatePersona(persona);
    expect(personas.length).toBe(23);
  });

  for (const persona of personas) {
    test(persona.name, async ({ page }, testInfo) => {
      testInfo.annotations.push({ type: "persona", description: persona.description });
      const probe = await preparePage(page);
      await openPlayground(page);

      const result = await walk(page, probe, persona);
      const ids = result.seen.map(q => q.id);

      expect(result.reachedThanks, `${persona.name} reaches /thanks`).toBe(true);
      expectSequentialNumbering(result.seen, persona.name);
      expect(result.softChecks, `${persona.name}: soft checks`).toEqual(persona.softChecks ?? []);
      for (const id of persona.sees ?? [])
        expect(ids, `${persona.name} sees ${id}`).toContain(id);
      for (const id of persona.neverSees ?? [])
        expect(ids, `${persona.name} never sees ${id}`).not.toContain(id);

      // Sections come in survey order, and every section was submitted exactly once
      const sectionsSeen = [...new Set(result.seen.map(q => q.section))];
      expect(sectionsSeen).toEqual(sectionLabels.filter(label => sectionsSeen.includes(label)));
      expect(probe.submits.length, `${persona.name}: one submit per section`).toBe(sectionsSeen.length);

      // The final submission holds exactly the questions this respondent was shown
      const submitted = Object.keys(probe.submits.at(-1)?.answers ?? {}).filter(key => !key.endsWith("-others"));
      expect(submitted.sort(), `${persona.name}: submitted ids = seen ids`).toEqual([...ids].sort());

      const perSection = sectionsSeen.map(section => `${section} ${result.seen.filter(q => q.section === section).length}`);
      // One line per persona in the run output: total screens and screens per section
      process.stdout.write(`[screens] ${persona.name}: ${ids.length} (${perSection.join(", ")})\n`);
      await testInfo.attach("seen-question-ids.json", {
        body: JSON.stringify(result.seen.map(q => ({ id: q.id, number: q.number })), null, 2),
        contentType: "application/json"
      });
    });
  }
});
