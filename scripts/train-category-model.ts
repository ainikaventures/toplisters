/**
 * Retrain the description-based category model.
 *
 *   # 1. snapshot the corpus (read-only replica or a tunnel to prod)
 *   psql "$TL_DB" -c "\\copy (SELECT id, title, category, \
 *     left(regexp_replace(description_text, '\s+', ' ', 'g'), 1500) AS descr \
 *     FROM jobs WHERE is_active AND length(description_text) > 150) \
 *     TO './.train/train_snapshot.csv' WITH (FORMAT csv, HEADER)"
 *
 *   # 2. train — writes lib/classify/model/category-model.json
 *   TRAIN_DIR=./.train npx tsx scripts/train-category-model.ts
 *
 * Snapshot first and train against the copy: prod changes under you, and a
 * reproducible artifact needs a fixed corpus.
 *
 * Weak-supervision category model.
 *
 * Labels come from the TITLE classifier (rows it places confidently are the
 * training examples). Features come from the DESCRIPTION. The model then
 * predicts categories for rows the title cannot place.
 *
 * Binarised multinomial Naive Bayes: presence/absence per document rather
 * than raw counts, which is the stronger variant for text classification
 * and stops a description that repeats one word 40 times from dominating.
 */
import { createReadStream, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { classifyCategory, OTHER_CATEGORY } from "../lib/classify/category";

// Where the snapshot CSV lives and where the artifact is written. Export
// the snapshot first (see the header comment).
const SCRATCH = process.env.TRAIN_DIR ?? "./.train";
const OUT = "./lib/classify/model/category-model.json";

const STOP = new Set(`the and for with you our are will that this have from your job role work team
who all can not but has its their they them out who what when where why how job jobs about into more
who's per was were been being would could should may might must shall the a an as at be by do if in is
it of on or so to up we he she his her him us they's within across please apply applicants applicant
candidate candidates position positions opportunity opportunities company companies business
experience experienced working works worked ability able strong excellent good great required
requirements essential desirable skills skill knowledge including include includes well also new
years year day days week weeks month months time full part such other others any every each many much
looking seeking join joining offer offers offering provide provides providing support supporting
ensure ensuring help helping make making take taking get getting use using need needs needed want
plus benefits salary hour hours pay paid rate rates contract permanent temporary based site remote
london manager management team teams client clients customer customers service services product
products project projects development develop developing high level levels quality standards
across around through during under over between both while than then them there here now upon via
etc please note applications successful reference agency agencies equal opportunities diversity
inclusion employer applicants regardless gender race religion disability age sexual orientation`
  .split(/\s+/).filter(Boolean));

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zà-ÿ]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 3 && t.length <= 24 && !STOP.has(t));
}

/** Quote-aware single-line CSV split (descriptions have no newlines — the
 *  export collapsed all whitespace). */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cell = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') { if (line[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { out.push(cell); cell = ""; }
    else cell += c;
  }
  out.push(cell);
  return out;
}

const LANG_MARK: Record<string, RegExp> = {
  en: /\b(the|and|with|you|your|for)\b/gi, de: /\b(und|der|die|das|für|mit|wir)\b/gi,
  nl: /\b(en|het|een|van|voor|met|je)\b/gi, fr: /\b(et|le|la|les|des|pour|vous)\b/gi,
  it: /\b(che|per|con|del|della|nostri)\b/gi, es: /\b(que|para|con|del|los|las)\b/gi,
  pt: /\b(que|para|com|dos|das|você)\b/gi,
};
function guessLang(t: string): string {
  let best = "en", bn = 0;
  for (const [k, re] of Object.entries(LANG_MARK)) {
    const n = (t.match(re) ?? []).length;
    if (n > bn) { bn = n; best = k; }
  }
  return best;
}

interface Row { label: string; tokens: string[]; title: string; id: string; lang: string; }

async function load(): Promise<{ train: Row[]; test: Row[]; unlabelled: Row[] }> {
  const train: Row[] = [], test: Row[] = [], unlabelled: Row[] = [];
  const rl = createInterface({ input: createReadStream(`${SCRATCH}/train_snapshot.csv`), crlfDelay: Infinity });
  let first = true, n = 0;
  for await (const line of rl) {
    if (first) { first = false; continue; }
    if (!line) continue;
    const [id, title, , descr] = splitCsv(line);
    if (!title || !descr) continue;
    const label = classifyCategory({ title });               // title-only label
    // LEAKAGE CONTROL: the description usually repeats the title verbatim.
    // Training on that teaches the model to find title words, which are
    // exactly what's missing on the rows we actually want to predict. So
    // strip the title's tokens from the description features.
    const titleTokens = new Set(tokenize(title));
    const tokens = [...new Set(tokenize(descr))].filter((t) => !titleTokens.has(t));
    if (tokens.length < 8) continue;
    const row: Row = { label, tokens, title, id, lang: guessLang(descr) };
    if (label === OTHER_CATEGORY) unlabelled.push(row);
    else if ((n++ % 5) === 0) test.push(row);
    else train.push(row);
  }
  return { train, test, unlabelled };
}

function train(rows: Row[]) {
  const df = new Map<string, number>();
  for (const r of rows) for (const t of r.tokens) df.set(t, (df.get(t) ?? 0) + 1);
  // Drop hapaxes (noise) and near-universal terms (no discriminative value).
  const vocab = new Set(
    [...df.entries()].filter(([, c]) => c >= 20 && c <= rows.length * 0.35).map(([t]) => t),
  );

  const classDocs = new Map<string, number>();
  const tokenCounts = new Map<string, Map<string, number>>();
  const classTotals = new Map<string, number>();
  for (const r of rows) {
    classDocs.set(r.label, (classDocs.get(r.label) ?? 0) + 1);
    let m = tokenCounts.get(r.label);
    if (!m) { m = new Map(); tokenCounts.set(r.label, m); }
    let tot = 0;
    for (const t of r.tokens) {
      if (!vocab.has(t)) continue;
      m.set(t, (m.get(t) ?? 0) + 1);
      tot++;
    }
    classTotals.set(r.label, (classTotals.get(r.label) ?? 0) + tot);
  }

  const labels = [...classDocs.keys()];
  const V = vocab.size;
  const logPrior = new Map<string, number>();
  for (const l of labels) logPrior.set(l, Math.log((classDocs.get(l) ?? 0) / rows.length));

  // Precompute log-likelihoods with Laplace smoothing.
  const logLik = new Map<string, Map<string, number>>();
  const logDefault = new Map<string, number>();
  for (const l of labels) {
    const m = tokenCounts.get(l) ?? new Map();
    const denom = (classTotals.get(l) ?? 0) + V;
    const inner = new Map<string, number>();
    for (const [t, c] of m) inner.set(t, Math.log((c + 1) / denom));
    logLik.set(l, inner);
    logDefault.set(l, Math.log(1 / denom));
  }
  return { labels, vocab, logPrior, logLik, logDefault };
}

type Model = ReturnType<typeof train>;

function predict(model: Model, tokens: string[]) {
  const scores: { label: string; score: number }[] = [];
  for (const l of model.labels) {
    const inner = model.logLik.get(l)!;
    const dflt = model.logDefault.get(l)!;
    let s = model.logPrior.get(l)!;
    for (const t of tokens) {
      if (!model.vocab.has(t)) continue;
      s += inner.get(t) ?? dflt;
    }
    scores.push({ label: l, score: s });
  }
  scores.sort((a, b) => b.score - a.score);
  return { top: scores[0], second: scores[1], margin: scores[0].score - scores[1].score };
}

(async () => {
  console.log("loading snapshot…");
  const { train: tr, test, unlabelled } = await load();
  console.log(`train ${tr.length.toLocaleString()} · test ${test.length.toLocaleString()} · unlabelled(Other) ${unlabelled.length.toLocaleString()}`);

  const model = train(tr);
  console.log(`vocab ${model.vocab.size.toLocaleString()} · classes ${model.labels.length}\n`);

  // Accuracy vs abstain threshold on held-out data.
  console.log("margin | coverage | precision   (held-out, title tokens removed)");
  const results = test.map((r) => ({ truth: r.label, ...predict(model, r.tokens) }));
  for (const m of [0, 2, 5, 10, 15, 20, 30, 50]) {
    const kept = results.filter((r) => r.margin >= m);
    const ok = kept.filter((r) => r.top.label === r.truth).length;
    console.log(
      `${String(m).padStart(6)} | ${((kept.length / results.length) * 100).toFixed(1).padStart(7)}% |` +
      ` ${kept.length ? ((ok / kept.length) * 100).toFixed(1) : "--"}%`,
    );
  }

  console.log("\nPRECISION BY LANGUAGE (held-out)");
  console.log("lang |  n     | margin>=20 cov/prec | margin>=30 cov/prec");
  for (const lg of ["en","de","nl","fr","it","es","pt"]) {
    const seg = results.filter((r, i) => test[i].lang === lg);
    if (seg.length < 50) continue;
    const cells: string[] = [];
    for (const m of [20, 30]) {
      const kept = seg.filter((r) => r.margin >= m);
      const ok = kept.filter((r) => r.top.label === r.truth).length;
      cells.push(`${((kept.length/seg.length)*100).toFixed(0).padStart(3)}% / ${kept.length?((ok/kept.length)*100).toFixed(1):"--"}%`);
    }
    console.log(`  ${lg}  | ${String(seg.length).padStart(6)} |     ${cells[0]}      |     ${cells[1]}`);
  }

  // ── Ship config ────────────────────────────────────────────────────────
  // Only en/de/fr clear ~90% held-out precision; nl/es/it/pt produce
  // confident nonsense and must abstain.
  const SUPPORTED = new Set(["en", "de", "fr"]);
  const MARGIN = 30;

  const seg = results.filter((r, i) => SUPPORTED.has(test[i].lang) && r.margin >= MARGIN);
  const segOk = seg.filter((r) => r.top.label === r.truth).length;
  console.log(`\nSHIP CONFIG  lang∈{en,de,fr}  margin>=${MARGIN}`);
  console.log(`  held-out precision ${(segOk / seg.length * 100).toFixed(1)}% on ${seg.length} predictions`);

  const applied = unlabelled
    .filter((r) => SUPPORTED.has(r.lang))
    .map((r) => ({ r, ...predict(model, r.tokens) }))
    .filter((p) => p.margin >= MARGIN);
  console.log(`  would classify ${applied.length.toLocaleString()} of ${unlabelled.length.toLocaleString()} Other rows (${(applied.length / unlabelled.length * 100).toFixed(1)}%)`);
  const by = new Map<string, number>();
  for (const p of applied) by.set(p.top.label, (by.get(p.top.label) ?? 0) + 1);
  console.log("  " + [...by.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([l,n])=>`${l}:${n}`).join("  "));
  console.log("  spot-check:");
  for (const p of applied.slice(0, 14)) console.log(`    ${p.top.label.padEnd(26)} m=${p.margin.toFixed(0).padStart(3)} [${p.r.lang}] ${p.r.title.slice(0,50)}`);

  // ── Prune + export artifact ────────────────────────────────────────────
  // Keep only terms that actually discriminate: top-N per class by the gap
  // between that class's log-likelihood and the mean across classes.
  const PER_CLASS = 200;
  const keep = new Set<string>();
  for (const l of model.labels) {
    const inner = model.logLik.get(l)!;
    const scored: [string, number][] = [];
    for (const [t, v] of inner) {
      let sum = 0;
      for (const o of model.labels) sum += model.logLik.get(o)!.get(t) ?? model.logDefault.get(o)!;
      scored.push([t, v - sum / model.labels.length]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    for (const [t] of scored.slice(0, PER_CLASS)) keep.add(t);
  }
  // Array encoding: a terms[] index plus one Int-scaled row per class.
  // Repeating 8k key names across 29 objects was 4.3MB of punctuation.
  const terms = [...keep].sort();
  const matrix = model.labels.map((l) => {
    const inner = model.logLik.get(l)!;
    const dflt = model.logDefault.get(l)!;
    return terms.map((t) => Math.round(((inner.get(t) ?? dflt) - dflt) * 100));
  });
  const artifact = {
    version: 1,
    trainedOn: tr.length,
    heldOutPrecision: Math.round((segOk / seg.length) * 1000) / 10,
    supportedLanguages: [...SUPPORTED],
    minMargin: MARGIN,
    labels: model.labels,
    logPrior: model.labels.map((l) => Math.round(model.logPrior.get(l)! * 100) / 100),
    logDefault: model.labels.map((l) => Math.round(model.logDefault.get(l)! * 100) / 100),
    terms,
    matrix,
  };
  writeFileSync(OUT, JSON.stringify(artifact));
  console.log(`\n  artifact: ${keep.size.toLocaleString()} terms x ${model.labels.length} classes`);
})();
