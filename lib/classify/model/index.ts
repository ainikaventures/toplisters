/**
 * Description-based category model (weak supervision).
 *
 * Third and last classification stage, after the title rules and the
 * source-category hint. Predicts from the DESCRIPTION body, which is where
 * the domain is stated when the title doesn't name it ("Sector Lead (TMT)",
 * "Change Specialist").
 *
 * NOT an LLM, deliberately. This runs inside the ingestion worker, which
 * boots without Next and so cannot reach lib/ai/provider (`server-only`),
 * over a corpus in the hundreds of thousands that is refreshed
 * continuously. A per-row model call would be slow, rate-limited on the
 * free tiers this project uses, non-deterministic between runs and
 * impossible to unit-test. Naive Bayes over a 440KB weight table is free,
 * offline, deterministic and testable.
 *
 * ── How the weights were made ────────────────────────────────────────────
 *
 * Trained on 122,797 production rows whose TITLE the rule classifier places
 * confidently — those labels are the supervision. Features are description
 * tokens with the title's own tokens REMOVED, because descriptions repeat
 * the title verbatim and training on that just teaches the model to find
 * title words, which are precisely what's missing on the rows we need to
 * predict.
 *
 * ── Why it only speaks three languages ───────────────────────────────────
 *
 * Held-out precision at margin >= 30, per language:
 *
 *     en 97.8%   de 94.3%   fr 95.0%    <- shipped
 *     pt 85.7%   nl 83.6%   es 77.3%   it 62.2%    <- abstain
 *
 * The "Other" bucket is 44% non-English against 28% in training, so the
 * aggregate held-out figure (90% at margin 20) badly overstated real
 * accuracy. Spot-checking the actual target population showed the model
 * confidently filing Dutch insurance roles ("Verzekeringsadviseur") under
 * Supply Chain and Italian electricians ("elettricisti") under Design.
 * It abstains on those languages rather than guessing.
 *
 * Retrain with scripts/train-category-model.ts when the corpus shifts.
 */
import MODEL from "./category-model.json";

export interface ModelVerdict {
  label: string;
  /** Log-probability gap between the best and second-best class. */
  margin: number;
  confident: boolean;
}

const NO_VERDICT: ModelVerdict = { label: "", margin: 0, confident: false };

const TERM_INDEX = new Map<string, number>(MODEL.terms.map((t, i) => [t, i]));
const SUPPORTED = new Set(MODEL.supportedLanguages);

/** Function-word counts. Crude, but it only has to separate the three
 *  languages the model was validated on from the four it wasn't. */
const LANG_MARK: Record<string, RegExp> = {
  en: /\b(the|and|with|you|your|for)\b/gi,
  de: /\b(und|der|die|das|für|mit|wir)\b/gi,
  nl: /\b(en|het|een|van|voor|met|je)\b/gi,
  fr: /\b(et|le|la|les|des|pour|vous)\b/gi,
  it: /\b(che|per|con|del|della|nostri)\b/gi,
  es: /\b(que|para|con|del|los|las)\b/gi,
  pt: /\b(que|para|com|dos|das|você)\b/gi,
};

export function guessLanguage(text: string): string {
  let best = "en";
  let bestHits = 0;
  for (const key of Object.keys(LANG_MARK)) {
    const hits = (text.match(LANG_MARK[key]) ?? []).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = key;
    }
  }
  return best;
}

/** Must match the tokenizer used at training time. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zà-ÿ]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 3 && t.length <= 24);
}

/**
 * Predict a category from a description. Returns `confident: false` when
 * the language isn't one of the validated three, when the text is too
 * short to carry signal, or when the top two classes are too close to
 * separate — in all of which cases the caller should keep "Other".
 */
export function classifyFromDescription(
  description: string | null | undefined,
  title?: string | null,
): ModelVerdict {
  if (!description || description.length < 200) return NO_VERDICT;
  if (!SUPPORTED.has(guessLanguage(description))) return NO_VERDICT;

  // Mirror training: the title's own tokens are excluded from the features.
  const titleTokens = new Set(title ? tokenize(title) : []);
  const seen = new Set<number>();
  for (const token of tokenize(description.slice(0, 1500))) {
    if (titleTokens.has(token)) continue;
    const idx = TERM_INDEX.get(token);
    if (idx !== undefined) seen.add(idx);
  }
  if (seen.size < 5) return NO_VERDICT;

  let bestIdx = -1;
  let best = -Infinity;
  let second = -Infinity;
  for (let c = 0; c < MODEL.labels.length; c++) {
    const row = MODEL.matrix[c];
    // Weights are stored as (logLik - logDefault) * 100; the constant
    // logDefault term is identical across tokens so only the prior and the
    // deviations affect the ranking.
    let score = MODEL.logPrior[c];
    for (const idx of seen) score += row[idx] / 100;
    if (score > best) {
      second = best;
      best = score;
      bestIdx = c;
    } else if (score > second) {
      second = score;
    }
  }
  if (bestIdx < 0 || !Number.isFinite(second)) return NO_VERDICT;

  const margin = best - second;
  return {
    label: MODEL.labels[bestIdx],
    margin,
    confident: margin >= MODEL.minMargin,
  };
}

export const MODEL_INFO = {
  trainedOn: MODEL.trainedOn,
  heldOutPrecision: MODEL.heldOutPrecision,
  supportedLanguages: MODEL.supportedLanguages,
  minMargin: MODEL.minMargin,
};
