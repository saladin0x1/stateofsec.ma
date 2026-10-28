// Path statistics. A path is the sequence of questions a respondent is shown; two respondents
// with the same sequence walk the same path. The explorer merges states, so one graph node
// stands for many paths: the distinct paths are counted exactly by building, bottom-up, the
// set of suffixes of every node as a hash-consed binary trie (one level per question, the
// branch is "shown or not"), the way a decision diagram stores a set of bit strings

/** A node of the exploration graph at layer p: question p shown (bit) and its successors */
export interface LayerNode {
  bit: number;
  succ: number[];
}

export interface PathGraph {
  /** layers[p] for p < number of questions */
  layers: LayerNode[][];
  /** Label of each node of the last layer: "C|profile" when complete, "I|profile" else */
  terminals: string[];
}

export interface ScreenStats {
  min: number;
  median: number;
  p90: number;
  max: number;
}

export interface ProfileStats {
  paths: number;
  min: number;
  max: number;
}

export interface PathStats {
  /** Distinct paths of respondents who answered every required question they were shown */
  complete: number;
  /** Distinct paths of every answer set the server accepts */
  all: number;
  /** Screens (questions shown) over the distinct complete paths */
  screens: ScreenStats;
  /** Per profile leaf (the spec's profileLeaf answers): its distinct complete paths */
  profiles: Record<string, ProfileStats>;
}

type Histogram = number[];

function screensOf(histogram: Histogram): ScreenStats {
  const total = histogram.reduce((a, b) => a + b, 0);
  if (total === 0)
    return { min: 0, median: 0, p90: 0, max: 0 };
  // Nearest rank: the smallest screen count reached by at least q of the paths
  const rank = (q: number) => {
    const target = Math.ceil(q * total);
    let seen = 0;
    for (let k = 0; k < histogram.length; k++) {
      seen += histogram[k] ?? 0;
      if (seen >= target)
        return k;
    }
    return histogram.length - 1;
  };
  const nonZero = histogram.map((v, k) => (v ? k : -1)).filter(k => k !== -1);
  return { min: nonZero[0], median: rank(0.5), p90: rank(0.9), max: nonZero[nonZero.length - 1] };
}

function addInto(target: Histogram, source: Histogram, shift: number) {
  source.forEach((v, k) => {
    if (v)
      target[k + shift] = (target[k + shift] ?? 0) + v;
  });
}

function statsFrom(histogramFor: (predicate: (label: string) => boolean) => Histogram, labels: Iterable<string>): PathStats {
  const count = (h: Histogram) => h.reduce((a, b) => a + (b ?? 0), 0);
  const complete = histogramFor(label => label.startsWith("C|"));
  const groups = [...new Set([...labels].filter(l => l.startsWith("C|")).map(l => l.slice(2)))].sort();
  const profiles: Record<string, ProfileStats> = {};
  for (const group of groups) {
    const h = histogramFor(label => label === `C|${group}`);
    const s = screensOf(h);
    profiles[group || "(all)"] = { paths: count(h), min: s.min, max: s.max };
  }
  return {
    complete: count(complete),
    all: count(histogramFor(() => true)),
    screens: screensOf(complete),
    profiles
  };
}

/** Exact statistics from the merged exploration graph */
export function pathStatsFromGraph(graph: PathGraph): PathStats {
  // Trie nodes: 0 is the empty set; terminals hold a sorted label list
  const layer: number[] = [-1];
  const child0: number[] = [0];
  const child1: number[] = [0];
  const labelsOf: string[][] = [[]];
  const unique = new Map<string, number>();
  const n = graph.layers.length;

  const make = (key: string, l: number, c0: number, c1: number, labels: string[]) => {
    const found = unique.get(key);
    if (found !== undefined)
      return found;
    const id = layer.length;
    layer.push(l);
    child0.push(c0);
    child1.push(c1);
    labelsOf.push(labels);
    unique.set(key, id);
    return id;
  };
  const terminal = (labels: string[]) => make(`T${labels.join("\u0001")}`, n, 0, 0, labels);
  const internal = (l: number, c0: number, c1: number) =>
    (c0 === 0 && c1 === 0 ? 0 : make(`${l}:${c0}:${c1}`, l, c0, c1, []));

  const unions = new Map<string, number>();
  const union = (a: number, b: number): number => {
    if (a === 0 || a === b)
      return b;
    if (b === 0)
      return a;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const found = unions.get(key);
    if (found !== undefined)
      return found;
    const result = layer[a] === n
      ? terminal([...new Set([...labelsOf[a], ...labelsOf[b]])].sort())
      : internal(layer[a], union(child0[a], child0[b]), union(child1[a], child1[b]));
    unions.set(key, result);
    return result;
  };

  let below = graph.terminals.map(label => terminal([label]));
  for (let p = n - 1; p >= 0; p--) {
    below = graph.layers[p].map((node) => {
      const rest = node.succ.reduce((acc, s) => union(acc, below[s]), 0);
      return node.bit ? internal(p, 0, rest) : internal(p, rest, 0);
    });
  }
  const root = below[0] ?? 0;

  const histogramFor = (predicate: (label: string) => boolean): Histogram => {
    const memo = new Map<number, Histogram>();
    const walk = (t: number): Histogram => {
      if (t === 0)
        return [];
      const found = memo.get(t);
      if (found)
        return found;
      let h: Histogram;
      if (layer[t] === n) {
        h = labelsOf[t].some(predicate) ? [1] : [];
      }
      else {
        h = [];
        addInto(h, walk(child0[t]), 0);
        addInto(h, walk(child1[t]), 1);
      }
      memo.set(t, h);
      return h;
    };
    return walk(root);
  };
  return statsFrom(histogramFor, graph.terminals);
}

/** The same statistics from an explicit list of (shown bits, label) pairs, for cross-checks */
export function pathStatsFromList(paths: Iterable<[string, string]>): PathStats {
  const labelsByBits = new Map<string, Set<string>>();
  for (const [bits, label] of paths) {
    if (!labelsByBits.has(bits))
      labelsByBits.set(bits, new Set());
    labelsByBits.get(bits)!.add(label);
  }
  const histogramFor = (predicate: (label: string) => boolean): Histogram => {
    const h: Histogram = [];
    for (const [bits, labels] of labelsByBits) {
      if ([...labels].some(predicate)) {
        const screens = [...bits].filter(b => b === "1").length;
        h[screens] = (h[screens] ?? 0) + 1;
      }
    }
    return h;
  };
  return statsFrom(histogramFor, [...labelsByBits.values()].flatMap(s => [...s]));
}
