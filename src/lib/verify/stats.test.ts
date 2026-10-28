import { describe, expect, it } from "vitest";
import { explore } from "./explore";
import { diffGolden, goldenOf } from "./golden";
import { pathStatsFromGraph, pathStatsFromList } from "./paths";
import { FORK, FORK_SPEC, modelAndSpec } from "./test-fixtures";

describe("path statistics", () => {
  it("counts distinct paths and nearest-rank screens", () => {
    const stats = pathStatsFromList([
      ["111", "C|a"],
      ["111", "C|b"],
      ["110", "C|a"],
      ["100", "C|a"],
      ["000", "I|a"]
    ]);
    expect(stats.complete).toBe(3);
    expect(stats.all).toBe(4);
    expect(stats.screens).toEqual({ min: 1, median: 2, p90: 3, max: 3 });
    expect(stats.profiles).toEqual({ a: { paths: 3, min: 1, max: 3 }, b: { paths: 1, min: 3, max: 3 } });
  });

  it("counts the same from a merged graph as from its explicit paths", () => {
    // Two nodes reach the same suffixes: the graph must not count the shared paths twice
    const graph = {
      layers: [
        [{ bit: 1, succ: [0, 1] }],
        [{ bit: 1, succ: [0] }, { bit: 1, succ: [1] }],
        [{ bit: 0, succ: [0] }, { bit: 1, succ: [1] }]
      ],
      terminals: ["C|x", "C|y"]
    };
    expect(pathStatsFromGraph(graph)).toEqual(pathStatsFromList([["110", "C|x"], ["111", "C|y"]]));
  });

  it("merging states does not change the statistics", () => {
    const { model, spec } = modelAndSpec(FORK, FORK_SPEC);
    const merged = explore(model, spec);
    const tree = explore(model, spec, { merge: false });
    expect(merged.paths).toEqual(tree.paths);
    expect(merged.classStates).toEqual(tree.classStates);
    expect(merged.nodes).toBeLessThan(tree.nodes);
  });
});

describe("golden statistics", () => {
  it("lists every changed number", () => {
    const { model, spec } = modelAndSpec(FORK, FORK_SPEC);
    const golden = goldenOf(model, explore(model, spec));
    expect(diffGolden(JSON.parse(JSON.stringify(golden)), golden)).toEqual([]);
    const edited = { ...golden, paths: { ...golden.paths, complete: golden.paths.complete + 1 } };
    expect(diffGolden(edited, golden)).toEqual([`paths.complete: ${golden.paths.complete + 1} -> ${golden.paths.complete}`]);
  });
});
