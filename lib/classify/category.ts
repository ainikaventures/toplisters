/**
 * Best-effort job-category classifier.
 *
 * The per-adapter `category` was a free-text grab-bag: some sources hardcode
 * "other" (Jooble, Reed), others pass through their own taxonomy (Adzuna
 * category labels, Greenhouse departments, The Muse categories), and the
 * rest fall back to "other"/"tech". The analytics page groups by that raw
 * string, so it fragments and piles a huge bucket into "other".
 *
 * This maps every job onto ONE canonical taxonomy. Title-first (the
 * strongest signal in a posting), then the source's raw category as a hint,
 * then "Other" only when nothing matches. Applied in the aggregation
 * pipeline so all sources are normalised consistently.
 *
 * Precision-leaning but recall-aware: the whole point is to rescue rows from
 * "Other", so the generic buckets (Engineering, Operations & Management)
 * sit last and catch the long tail without stealing from specific ones.
 * Science & Research and Media & Creative sit ABOVE Engineering for the same
 * reason — `engineer(ing)?` is broad enough to swallow "Research Fellow
 * (… Software Engineering …)" and "Editor (Engineering & Technology)".
 *
 * ── Why the rules look the way they do ───────────────────────────────────
 *
 * The rule set was extended in Aug 2026 after sampling 907 titles that were
 * actually sitting in "Other" on production (44.9% of active listings). The
 * three dominant causes, in order of volume:
 *
 *  1. NON-ENGLISH TITLES. The board carries a lot of French, German, Spanish,
 *     Italian, Portuguese and Dutch postings — the gender markers alone
 *     (h/f, m/w/d, f/h, w/m/d) appeared in ~30% of the sample. Each rule now
 *     carries the equivalent role nouns. German compounds need `\w*` (there
 *     is no word boundary before the noun in "Elektronikentwickler"), which
 *     is why several alternatives are written that way.
 *
 *  2. PLURALS. Every rule ended `)\b`, so "Class A Drivers", "Key Accounts
 *     Manager" and "Owner Drivers" all missed. The closing `)s?\b` fixes the
 *     whole class of them at once.
 *
 *  3. `engineer` NEVER MATCHED "Engineering" — `\bengineer\b` fails on the
 *     -ing form. That single gap accounted for the largest rescue bucket.
 *
 * Measured against the FULL production table (280,214 active rows), not a
 * sample: "Other" goes 125,511 (44.8%) → 94,307 (33.7%), rescuing 31,204
 * rows, with 2,433 (0.9%) re-labelled out of an existing category. An
 * earlier 907-title sample suggested 36% — the real figure is 24.9% of the
 * bucket, so treat scraped samples as directional only.
 *
 * On the sampled titles it was 327/907, against 6 re-labellings — of which several are corrections
 * (a French IT role that had been landing in Hospitality via "Chef"). If you
 * extend this, re-sample and re-measure rather than eyeballing: a rule that
 * looks harmless in isolation steals from its neighbours surprisingly often.
 * Two candidate rules were reverted during that exercise for exactly this
 * reason — bare `commercial` (an English business-unit word) and
 * `product design` (stole "Teacher of Product Design" from Education).
 *
 * "Other" WILL NOT REACH ZERO, and chasing that is the wrong goal. Roughly a
 * third of what remains has no home in a 26-category taxonomy — "Open
 * Application (f/m/d)", "Ex-YC Founder", "Sector Lead (TMT) Directed
 * Content", "NeoCloud & Colo Due Diligence Lead" — and some of it is not a
 * single role at all. Forcing those into a bucket would make the category
 * facet less trustworthy, not more.
 *
 * ── NEGATIVE RESULT: don't re-try description scoring this way ───────────
 *
 * Aug 2026: inferring the category from the description body by scoring
 * these same title regexes against it was built and measured, then thrown
 * away. On 167 descriptions whose titles already classify confidently
 * (so the title label acts as ground truth), plus 170 descriptions still
 * in "Other":
 *
 *     min score / margin | precision | recall of the remainder
 *              3 / 2     |   76.7%   |   5.9%
 *              3 / 3     |   91.3%   |   0.6%
 *              4 / 3     |   95.0%   |   0.0%
 *
 * There is no threshold with usable precision AND usable recall. The cause
 * is the signal, not the tuning: these patterns match role NOUNS, which
 * appear in prose incidentally rather than diagnostically. An LGV driver
 * description mentions "medical" (the medical exam) and scores Healthcare
 * above Transport.
 *
 * That approach was then BUILT properly — see lib/classify/model. Naive
 * Bayes over description tokens, trained on the 122,797 rows whose titles
 * classify confidently, gated to the three languages where it clears 94%
 * held-out precision. It is the third and final stage below.
 *
 * Its marginal contribution is small and worth stating plainly: over the
 * improved rules it rescues ~2,700 further rows, about 1 point. The rules
 * do the heavy lifting (11 points); the model is a precise top-up for
 * titles that name no domain at all.
 *
 * Run `npm run reclassify-category -- --dry` to preview the effect on live
 * rows before applying.
 */

import { classifyFromDescription } from "./model";

interface CategoryRule {
  label: string;
  /** Matched against the job title (strongest signal). */
  title: RegExp;
  /** Matched against the source's raw category string (fallback). */
  hint?: RegExp;
}

// Ordered most-specific → most-generic. First match wins, so e.g. "Data
// Engineer" lands in Data (checked before Software/Engineering, which would
// otherwise grab the word "engineer").
const RULES: CategoryRule[] = [
  {
    label: "Data & Analytics",
    title: /\b(data (scientist|analyst|engineer|architect|governance|lead|manager|steward|migration)|head of data|data (and|&) ai|machine learning|ml engineer|ai engineer|deep learning|nlp|analytics (engineer|manager|lead)|business intelligence|bi (developer|analyst)|big data|data science|datenanalyst|analista de datos)s?\b/i,
    hint: /\b(data|analytics|machine learning|artificial intelligence)\b/i,
  },
  {
    label: "Software Engineering",
    title: /\b((software|back[- ]?end|front[- ]?end|full[- ]?stack|web|mobile|ios|android|devops|sre|site reliability|platform|cloud|embedded|firmware)\s*(engineer|developer|architect|programmer)|developer|programmer|software engineer|engineering manager|qa engineer|test engineer|automation engineer|\w*entwickler|d[ée]veloppeur|desarrollador|sviluppatore|programmeur)s?\b/i,
    hint: /\b(software|developer|programming|web development|saas)\b/i,
  },
  {
    label: "IT & Support",
    title: /\b(it support|help ?desk|service desk|desktop support|systems? administrator|sysadmin|network (engineer|administrator|technician)|it technician|it manager|infrastructure engineer|database administrator|\bdba\b|technical support|support analyst|cyber ?security|security (analyst|engineer)|systemadministrator|informatique industrielle)s?\b/i,
    hint: /\b(it support|helpdesk|information technology|it jobs?|cyber)\b/i,
  },
  {
    label: "Product",
    title: /\b(product (manager|owner|lead|director|analyst)|head of product|\bcpo\b|chief product|produktmanager)s?\b/i,
    hint: /\bproduct\b/i,
  },
  {
    label: "Design",
    title: /\b(ux|ui|product designer|graphic designer|web designer|visual designer|interaction designer|motion designer|designer|design (lead|director|manager)|art director|creative director|grafiker|dise[ñn]ador)s?\b/i,
    hint: /\b(design|creative|\bux\b|\bui\b)\b/i,
  },
  {
    label: "Healthcare",
    title: /\b(nurse|nursing|doctor|physician|\bgp\b|surgeon|care (assistant|worker)|carer|support worker|healthcare assistant|medical|clinical|dentist|dental|pharmacist|pharmacy|paramedic|physiotherapist|radiographer|midwife|psychologist|psychiatrist|therapist|optometrist|veterinar|sonographer|mental health|phlebotom|infirmi(er|ère|ere)|infermier|enfermer[oa]|krankenpfleger|krankenschwester|pflegefachkraft|pflegehelfer|pflegekraft|altenpfleger|[aä]rztin|\barzt\b|aide[- ]?soignant|soignant|m[ée]dico|fisioterapeuta|farmac[eê]utic|kinderarzt)/i,
    hint: /\b(health ?care|nursing|medical|social work|\bcare\b)\b/i,
  },
  {
    label: "Education",
    title: /\b(teacher|teaching assistant|lecturer|tutor|professor|senco|head ?teacher|deputy head|instructor|academic|early years|nursery (nurse|practitioner)|\bsen\b|education|erzieher|kinderpfleger|educateur|éducateur|enseignant|professeur|lehrer|profesor|docente|maestr[oa])s?\b/i,
    hint: /\b(teaching|education|academic)\b/i,
  },
  {
    label: "Legal",
    title: /\b(lawyer|solicitor|attorney|barrister|paralegal|legal (counsel|advisor|assistant|secretary|executive)|conveyanc|\blegal\b|\bcounsel\b|jurist|avocat|abogado|avvocato|rechtsanwalt|notaire)s?\b/i,
    hint: /\b(legal|\blaw\b)\b/i,
  },
  {
    label: "Finance & Accounting",
    title: /\b(accountant|accounts (assistant|payable|receivable)|accounting|finance (manager|director|analyst|assistant|business partner)|financial (analyst|controller|accountant|advisor)|auditor|\baudit\b|bookkeeper|financial controller|treasury|tax (manager|advisor|accountant)|payroll|credit control|\bloans?\b|lending|mortgage|risk analyst|fp&a|actuary|\bcfo\b|underwriter|comptable|buchhalter|steuerberater|steuerfachangestellte|contab(le|ilista)|contador|consultor fiscal|finanzierung|controlling|versicherungsexperte)s?\b/i,
    hint: /\b(accounting|finance|financial|banking|insurance)\b/i,
  },
  {
    label: "HR & Recruitment",
    title: /\b(hr (manager|advisor|business partner|administrator|assistant|officer|director)|human resources|\bhris\b|employee (lifecycle|relations|experience)|recruit(er|ment|ing)|talent (acquisition|partner|manager)|people (operations|partner)|learning and development|\bl&d\b|reward (manager|analyst)|personalreferent|personalsachbearbeiter|ressources humaines|recursos humanos|risorse umane)s?\b/i,
    hint: /\b(hr\b|human resources|recruit|talent)\b/i,
  },
  {
    label: "Sales",
    title: /\b(sales|account (executive|manager|partner|lead)|(?<!social media )account director|business develop(ment|er)|\bbdm\b|\bsdr\b|\bbdr\b|key account|territory manager|telesales|inside sales|field sales|pre[- ]?sales|go[- ]to[- ]market|vertrieb|comercial|venditore|vendeur|vendedor)s?\b/i,
    hint: /\b(sales|business development)\b/i,
  },
  {
    label: "Marketing & PR",
    title: /\b(marketing|\bseo\b|\bsem\b|\bppc\b|content (manager|writer|strategist|marketer|lead)|brand(ing)? (manager|lead|officer)|growth (manager|marketer|lead)|demand gen(eration)?|social media|digital marketing|communications|public relations|copywriter|community manager|\bcrm\b|email marketing|mercadeo)s?\b/i,
    hint: /\b(marketing|advertising|public relations|communications)\b/i,
  },
  {
    label: "Customer Service",
    title: /\b(customer (service|support|success|experience|care|operations|onboarding)|client (service|success)|call (centre|center)|contact (centre|center)|support (agent|advisor|representative)|customer advisor|kundenservice|kundenberater|service client|atenci[óo]n al cliente)s?\b/i,
    hint: /\b(customer service|customer support|call cent)\b/i,
  },
  {
    label: "Supply Chain & Logistics",
    title: /\b(supply chain|logistics|logistik|procurement|purchasing|\bbuyer\b|inventory|materials (planner|controller)|demand planner|warehouse (manager|operative|worker|assistant|associate|supervisor)|order picker|picker[- ]?packer|forklift|distribution (manager|centre)|fulfil(l)?ment|freight|shipping|category manager|pr[ée]parateur de commandes|lagerist|logistiek|medewerker|magasinier|magazzinier|almac[ée]n)s?\b/i,
    hint: /\b(supply chain|logistics|warehouse|procurement|purchasing)\b/i,
  },
  {
    label: "Transport & Driving",
    title: /\b(hgv|lgv|\bcdl\b|class\s*[12abAB]\b|delivery driver|van driver|truck driver|lorry driver|bus driver|taxi driver|owner[- ]?driver|shuttle (operator|driver)|multi[- ]?drop|own van|\bdepots?\b|courier|chauffeur|driver|transport (manager|planner)|fleet (manager|controller)|fahrer|kraftfahrer|conducteur|autista|motorista|livreur|coursier)s?\b/i,
    hint: /\b(driving|transport)\b/i,
  },
  {
    label: "Hospitality & Catering",
    title: /\b(chef|sous chef|head chef|\bcook\b|kitchen (porter|assistant|hand|leader|manager)|eatery|barista|waiter|waitress|bartender|barman|bar (staff|manager)|restaurant\b|hotel|hospitality|catering|housekeep|concierge|food service|front of house|bankett|k[oö]ch(in)?|cuisinier|cocinero|cuoco|camarer[oa]|serveu(r|se)|kellner)s?\b/i,
    hint: /\b(hospitality|catering|food service|leisure|tourism|travel)\b/i,
  },
  {
    label: "Construction & Trades",
    title: /\b(construction|electrician|plumber|carpenter|joiner|builder|labourer|laborer|bricklayer|roofer|plasterer|scaffolder|welder|fabricator|glazier|tiler|painter and decorator|site (manager|engineer|supervisor|agent)|quantity surveyor|estimator|building surveyor|groundwork|civils?|carrossier|peintre|ma[çc]on|[ée]lectricien|plombier|menuisier|installateur|heizungsbau|anlagenmechaniker|dachdecker|maurer|schreiner|alba[ñn]il|muratore|idraulico)s?\b/i,
    hint: /\b(construction|trades?|building|property|skilled trade)\b/i,
  },
  {
    label: "Manufacturing & Production",
    title: /\b(production (operative|worker|manager|supervisor|planner|line|employee|associate)|manufacturing (operative|manager)|assembly (worker|operative)|machine operator|cnc (operator|machinist)|machinist|factory (worker|operative)|process operator|toolmaker|produktionshelfer|produktion|operai[oe]|oper[áa]ri[oa]|monteur|hygiene operator)s?\b/i,
    hint: /\b(manufacturing|production)\b/i,
  },
  {
    label: "Real Estate & Property",
    title: /\b(estate agent|lettings? (negotiator|manager|consultant)|property (manager|consultant|administrator|advisor)|block manager|land (buyer|manager)|valuer|immobilier|makler)s?\b/i,
    hint: /\b(real estate|property|lettings)\b/i,
  },
  {
    label: "Sport, Leisure & Fitness",
    title: /\b(lifeguard|personal trainer|fitness (instructor|coach|manager)|gym (manager|instructor)|swimming (teacher|instructor)|sports? (coach|therapist|scientist)|leisure (assistant|attendant|manager)|activity leader)s?\b/i,
    hint: /\b(sport|fitness|leisure)\b/i,
  },
  {
    label: "Agriculture & Environment",
    title: /\b(agronom(y|ist)|agricultur(e|al)|horticultur(e|ist|al)|arborist|forestry|farm (manager|worker|hand|labourer)|gamekeeper|landscap(er|e gardener)|environmental (officer|consultant|advisor)|sustainability (manager|lead|analyst))s?\b/i,
    hint: /\b(agriculture|farming|environment|sustainability)\b/i,
  },
  {
    label: "Science & Research",
    title: /\b(scientist|research(er| associate| scientist| fellow)|laboratory|lab (technician|analyst|assistant)|chemist|biologist|microbiologist|biochemist|formulation|clinical research|\br&d\b|wissenschaftler|chercheur|investigador|ricercatore|laborant)s?\b/i,
    hint: /\b(science|scientific|research|laboratory|pharma)\b/i,
  },
  {
    label: "Media & Creative",
    title: /\b(journalist|editor|sub[- ]?editor|\bwriter\b|content creator|videographer|video editor|photographer|producer|presenter|broadcast|animator|illustrator|3d artist|redakteur|r[ée]dacteur)s?\b/i,
    hint: /\b(media|journalism|publishing|writing)\b/i,
  },
  {
    label: "Engineering",
    title: /\b(mechanical engineer|electrical engineer|civil engineer|structural engineer|maintenance engineer|process engineer|chemical engineer|design engineer|project engineer|manufacturing engineer|quality engineer|controls engineer|aerospace engineer|field (service )?engineer|hardware engineer|soc (architect|design)|vehicle technician|engineer(ing)?|mechanic|ing[ée]nieur|\w*ingenieur|ingeniero|ingegnere|technicien|\w*techniker|technieker|t[ée]cnico|tecnico|\w*mechatroniker|\w*elektroniker|\w*mechaniker|mec[aá]nico|meccanico)s?\b/i,
    hint: /\bengineer/i,
  },
  {
    label: "Retail",
    title: /\b(retail|store (manager|assistant|supervisor)|shop (assistant|manager)|sales assistant|cashier|checkout|merchandiser|visual merchandis|department manager|verk[aä]ufer|commess[oa]|cajer[oa]|caissi[eè]r)s?\b/i,
    hint: /\bretail\b/i,
  },
  {
    label: "Security",
    title: /\b(security (officer|guard|operative|manager)|door supervisor|cctv operator|loss prevention|control room|sicherheitsmitarbeiter|agent de s[ée]curit[ée]|vigilante|guardia de seguridad)s?\b/i,
    hint: /\bsecurity\b/i,
  },
  {
    label: "Cleaning & Facilities",
    title: /\b(cleaner|cleaning (operative|supervisor)|housekeeper|janitor|caretaker|facilities (manager|assistant|coordinator)|window cleaner|domestic (assistant|worker)|grounds(keeper|man)|maintenance (operative|assistant|technician)|reinigungskraft|reinigung|nettoyage|agent d'entretien|femme de m[ée]nage|limpieza|pulizi)s?\b/i,
    hint: /\b(cleaning|facilities|domestic help|maintenance)\b/i,
  },
  {
    label: "Admin & Office",
    title: /\b(administrator|administrative|office (manager|administrator|assistant|coordinator)|receptionist|secretary|personal assistant|executive assistant|data entry|\bclerk\b|typist|business support|\w*sachbearbeiter|\w*kaufmann|\w*kauffrau|secr[ée]taire|secretari[ao]|impiegat[oa]|r[ée]ceptionniste|r[ée]ceptionnaire|empfang|employ[ée] (polyvalent|administratif))s?\b/i,
    hint: /\b(admin|administration|office|secretarial|clerical)\b/i,
  },
  {
    label: "Operations & Management",
    title: /\b(operations (manager|director|lead|coordinator|analyst)|\bcoo\b|chief operating|general manager|managing director|\bceo\b|programme manager|project manager|business (analyst|operations)|process improvement|continuous improvement|consultant|consultor|founder|chief of staff|strategy (lead|director|manager|analyst)|venture (builder|partner)|due diligence|partnerships? (lead|director|manager)|responsable|gesch[aä]ftsf[üu]hrer|leiter(in)?|projektleiter|betriebsleiter|teamleiter|gerente|direttore|chef de projet|chef d'[ée]quipe)s?\b/i,
    hint: /\b(operations|management|consulting|business)\b/i,
  },
];

export const OTHER_CATEGORY = "Other";

export interface ClassifyCategoryInput {
  title: string;
  /** The raw category the source produced (used as a fallback hint). */
  category?: string | null;
  /**
   * Description body. When supplied, a trained model gets the last word
   * before a row falls to "Other" — see lib/classify/model. Omit it and
   * behaviour is exactly the title+hint rules, so existing callers that
   * don't pass it are unaffected.
   */
  description?: string | null;
}

/** Map a job onto the canonical category taxonomy. Returns "Other" if unsure. */
export function classifyCategory(input: ClassifyCategoryInput): string {
  const title = input.title ?? "";
  for (const rule of RULES) {
    if (rule.title.test(title)) return rule.label;
  }
  const hint = input.category ?? "";
  if (hint) {
    // An already-canonical label is the strongest hint there is — keep it.
    //
    // This matters because `reclassify-category` passes the row's CURRENT
    // category as the hint, and several canonical labels don't match their
    // own hint regex ("IT & Support" is not the string "it support"). Without
    // this, re-running the backfill demoted 3,314 correctly-classified
    // IT & Support rows to "Other" — caught by measuring against the real
    // table rather than a sample.
    const canonical = RULES.find(
      (rule) => rule.label.toLowerCase() === hint.trim().toLowerCase(),
    );
    if (canonical) return canonical.label;

    for (const rule of RULES) {
      if (rule.hint && rule.hint.test(hint)) return rule.label;
    }
  }

  // Last stage: the description model. It abstains on languages it wasn't
  // validated for and whenever the top two classes are close, so reaching
  // this line usually still means "Other" — which is the intent. It only
  // speaks when it is confident.
  if (input.description) {
    const verdict = classifyFromDescription(input.description, title);
    if (verdict.confident) return verdict.label;
  }

  return OTHER_CATEGORY;
}

/**
 * How the "Other" bucket is presented to users.
 *
 * The stored value stays `OTHER_CATEGORY` — renaming it in the database
 * would mean a migration plus a rewrite of every consumer for a cosmetic
 * gain. Only the label changes.
 *
 * "Other" reads like a real category sitting alongside Healthcare and
 * Sales, which invites the reader to assume those jobs have something in
 * common. They don't — it is the bucket for listings whose title the
 * classifier couldn't place. "Unclassified" says that, and says it about
 * us rather than about the job.
 */
export const OTHER_CATEGORY_LABEL = "Unclassified";

/** Display name for a stored category value. */
export function categoryLabel(value: string): string {
  return value === OTHER_CATEGORY ? OTHER_CATEGORY_LABEL : value;
}

/**
 * Sort comparator that keeps the unclassified bucket last regardless of
 * its count — it is usually one of the largest, and leading a
 * volume-sorted facet with "Unclassified" buries the categories people
 * actually browse by.
 */
export function compareCategoriesForDisplay(
  a: { value: string; count: number },
  b: { value: string; count: number },
): number {
  if (a.value === OTHER_CATEGORY) return 1;
  if (b.value === OTHER_CATEGORY) return -1;
  return b.count - a.count;
}
