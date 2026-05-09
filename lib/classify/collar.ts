import type { $Enums } from "@/lib/generated/prisma/client";

/**
 * Best-effort collar-type classifier.
 *
 * Sources have wildly different signal: RemoteOK is universally
 * white-collar, Reed is a UK general board with everything from CTO
 * to kitchen porter, Arbeitnow is tech-leaning. Hardcoding `collarType`
 * per-adapter (which is what we used to do) loses the inside-source
 * variation — Reed's 434 rows all came through as `unknown` and the
 * site's collar filter became useless for "blue".
 *
 * The heuristic is title-first because that's the strongest signal in
 * a JobPosting, falls back to category text where the source provides
 * one, and finally to whatever hint the adapter passed in.
 *
 * Precision over recall: when the title is ambiguous ("Kitchen Sales
 * Designer", "Engineering Manager"), we'd rather leave it as the
 * source's hint than misclassify. The collar filter is an opt-in user
 * narrowing — wrong labels are worse than missing labels.
 */

type CollarType = $Enums.CollarType;

// Blue-collar job titles — high-precision whole-word patterns. Each
// regex anchored on word boundaries so "barista" matches "Senior
// Barista" but "drive" doesn't trigger on "Drive Sales Manager".
const BLUE_PATTERNS: RegExp[] = [
  // Driving + delivery
  /\b(hgv|lgv|class\s*[12])\b/i,
  /\bdelivery driver\b/i,
  /\b(courier|van driver|truck driver|lorry driver|bus driver|taxi driver)\b/i,
  /\b(driver)(?!\s+(architect|engineer|developer|growth|strategy|product|sales|marketing))\b/i,

  // Warehouse + logistics floor
  /\b(warehouse (operative|worker|assistant|associate)|forklift|order picker|picker[- ]packer)\b/i,
  /\b(stock controller|loader|unloader|yard hand|dock worker)\b/i,

  // Construction trades
  /\b(electrician|plumber|carpenter|joiner|labourer|laborer|bricklayer|roofer|plasterer|scaffolder|welder|fitter|fabricator|glazier|tiler|decorator)\b/i,
  /\b(painter and decorator|trades(person| man| woman))\b/i,
  /\b(machine operator|cnc operator|lathe operator|press operator|excavator operator|crane operator)\b/i,
  /\b(site (foreman|labourer|operative))\b/i,

  // Cleaning + maintenance
  /\b(cleaner|housekeeper|janitor|window cleaner|domestic assistant|domestic worker)\b/i,
  /\b(maintenance (technician|assistant|operative))\b/i,
  /\b(grounds(keeper| person))\b/i,

  // Hospitality + food
  /\b(chef|sous chef|chef de partie|chef de rang|head chef|pastry chef|line cook|prep cook|grill cook|pizza cook|short[- ]order cook)\b/i,
  /\b(kitchen (porter|assistant|hand|steward))\b/i,
  /\b(barista|barback|bartender|bar staff|waiter|waitress|server|host(ess)?|busser|busboy|runner|food runner)\b/i,
  /\b(dishwasher|pot washer)\b/i,

  // Care + healthcare support (grey/blue boundary, classified blue for filter usefulness)
  /\b(care assistant|care worker|carer|support worker|healthcare assistant|nursing assistant|nursing aide)\b/i,
  /\b(home care|senior care|domiciliary care|personal care assistant)\b/i,

  // Retail floor
  /\b(retail (assistant|associate)|sales assistant|shop assistant|store assistant|stock assistant)\b/i,
  /\b(cashier|checkout (assistant|operator)|merchandiser|shelf stacker)\b/i,

  // Manufacturing
  /\b(production (operative|worker|assistant)|assembly worker|line worker|factory worker|machine operative)\b/i,

  // Vehicle / mechanic
  /\b(vehicle technician|hgv technician|auto mechanic|car mechanic|motor mechanic|bodyshop technician|tyre fitter)\b/i,

  // Security
  /\b(security (officer|guard|operative)|door supervisor|bouncer|crowd controller)\b/i,

  // Personal services
  /\b(beautician|hairdresser|nail technician|barber|stylist|esthetician|massage therapist)\b/i,

  // Outdoor / agricultural
  /\b(landscaper|gardener|farm worker|farm hand|picker(?!\s*(packer|stock)))\b/i,
];

const WHITE_PATTERNS: RegExp[] = [
  // Software / engineering / data — broad coverage
  /\b(software|backend|front[- ]?end|fullstack|full[- ]stack|devops|sre|platform|cloud|infrastructure|security|qa|test)\s*(engineer|developer|architect|lead)\b/i,
  /\b(developer|programmer|architect|engineer|sre|engineering manager)\b/i,
  /\b(data (scientist|analyst|engineer)|machine learning|ml engineer|ai engineer|research scientist|nlp engineer)\b/i,

  // Product / design / managerial
  /\b(product (manager|owner|designer|lead)|project (manager|coordinator|director))\b/i,
  /\b(designer)\b/i,
  /\b(scrum master|delivery manager|technical writer|developer advocate)\b/i,

  // Business / finance / legal
  /\b(consultant|analyst|accountant|auditor|controller|treasurer|cfo)\b/i,
  /\b(lawyer|attorney|solicitor|barrister|paralegal|legal counsel)\b/i,

  // Marketing / sales (knowledge-worker variants)
  /\b(marketing|growth|brand|content|seo|copywriter|community)\s+(manager|lead|director|specialist|strategist|coordinator|associate|executive)\b/i,
  /\b(account (manager|executive|director)|sales (executive|director|manager|engineer))\b/i,

  // Education / research / clinical professional
  /\b(scientist|researcher|professor|lecturer|teacher|instructor|tutor)\b/i,
  /\b(doctor|physician|consultant\s*surgeon|psychologist|psychiatrist|therapist|dentist|veterinarian|pharmacist)\b/i,
  /\b(registered nurse|rn|advanced practice nurse|nurse practitioner)\b/i,

  // Executive / generic office
  /\b(ceo|cto|cfo|coo|cmo|chief\s+(executive|operating|technology|financial|marketing|product))\b/i,
  /\b(vp|vice president|director|head of)\b/i,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

const BLUE_CATEGORY_RE =
  /(construction|trades|hospitality|warehouse|driving|cleaning|catering|retail|manufacturing|automotive|logistics|skilled trade|food service)/i;
const WHITE_CATEGORY_RE =
  /(software|engineering|technology|finance|legal|marketing|design|consulting|research|product|data|writing|media|education|healthcare(?!\s+assistant))/i;

interface ClassifyInput {
  title: string;
  category?: string | null;
  /** The collar the source itself suggested — used as fallback. */
  hint: CollarType;
}

export function classifyCollar(input: ClassifyInput): CollarType {
  const title = input.title;

  // Title is the strongest signal. Blue gets first crack — cooks /
  // baristas etc. otherwise risk being caught by the broad WHITE
  // patterns ("manager") if their title also includes a managerial token.
  if (matchesAny(title, BLUE_PATTERNS)) return "blue";
  if (matchesAny(title, WHITE_PATTERNS)) return "white";

  // Category fallback. Reed's category is always "other" today
  // (we don't pass through a real one yet), but other adapters do
  // populate it (Arbeitnow tag-based, RemoteOK first-tag, The Muse
  // categories[].name). Cheap to check.
  const category = input.category ?? "";
  if (BLUE_CATEGORY_RE.test(category)) return "blue";
  if (WHITE_CATEGORY_RE.test(category)) return "white";

  // No confident signal — defer to whatever the source said. Adapters
  // that hardcode "white" (RemoteOK / Arbeitnow / The Muse / Remotive
  // / DesignJobsBoard / JournalismJobs) keep their default; Reed (the
  // one source that hints "unknown") stays unknown until we see a hit.
  return input.hint;
}
