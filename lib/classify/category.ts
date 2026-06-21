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
 */

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
    title: /\b(data (scientist|analyst|engineer|architect)|machine learning|ml engineer|ai engineer|deep learning|nlp|analytics (engineer|manager|lead)|business intelligence|bi (developer|analyst)|big data|data science)\b/i,
    hint: /\b(data|analytics|machine learning|artificial intelligence)\b/i,
  },
  {
    label: "Software Engineering",
    title: /\b((software|back[- ]?end|front[- ]?end|full[- ]?stack|web|mobile|ios|android|devops|sre|site reliability|platform|cloud|embedded|firmware)\s*(engineer|developer|architect|programmer)|developer|programmer|software engineer|engineering manager|qa engineer|test engineer|automation engineer)\b/i,
    hint: /\b(software|developer|programming|web development|saas)\b/i,
  },
  {
    label: "IT & Support",
    title: /\b(it support|help ?desk|service desk|desktop support|systems? administrator|sysadmin|network (engineer|administrator|technician)|it technician|it manager|infrastructure engineer|database administrator|\bdba\b|technical support|cyber ?security|security (analyst|engineer))\b/i,
    hint: /\b(it support|helpdesk|information technology|it jobs?|cyber)\b/i,
  },
  {
    label: "Product",
    title: /\b(product (manager|owner|lead|director|analyst)|head of product|\bcpo\b|chief product)\b/i,
    hint: /\bproduct\b/i,
  },
  {
    label: "Design",
    title: /\b(ux|ui|product designer|graphic designer|web designer|visual designer|interaction designer|motion designer|designer|design (lead|director|manager)|art director|creative director)\b/i,
    hint: /\b(design|creative|\bux\b|\bui\b)\b/i,
  },
  {
    label: "Healthcare",
    title: /\b(nurse|nursing|doctor|physician|\bgp\b|surgeon|care (assistant|worker)|carer|support worker|healthcare assistant|medical|clinical|dentist|dental|pharmacist|paramedic|physiotherapist|radiographer|midwife|psychologist|psychiatrist|therapist|optometrist|veterinar|sonographer)/i,
    hint: /\b(health ?care|nursing|medical|social work|\bcare\b)\b/i,
  },
  {
    label: "Education",
    title: /\b(teacher|teaching assistant|lecturer|tutor|professor|senco|head ?teacher|deputy head|instructor|academic|early years|nursery (nurse|practitioner)|\bsen\b|education)\b/i,
    hint: /\b(teaching|education|academic)\b/i,
  },
  {
    label: "Legal",
    title: /\b(lawyer|solicitor|attorney|barrister|paralegal|legal (counsel|advisor|assistant|secretary|executive)|conveyanc|\blegal\b)\b/i,
    hint: /\b(legal|\blaw\b)\b/i,
  },
  {
    label: "Finance & Accounting",
    title: /\b(accountant|accounts (assistant|payable|receivable)|accounting|finance (manager|director|analyst|assistant|business partner)|financial (analyst|controller|accountant|advisor)|auditor|\baudit\b|bookkeeper|financial controller|treasury|tax (manager|advisor|accountant)|payroll|credit control|fp&a|actuary|\bcfo\b|underwriter)\b/i,
    hint: /\b(accounting|finance|financial|banking|insurance)\b/i,
  },
  {
    label: "HR & Recruitment",
    title: /\b(hr (manager|advisor|business partner|administrator|assistant|officer|director)|human resources|recruit(er|ment)|talent (acquisition|partner|manager)|people (operations|partner)|learning and development|\bl&d\b|reward (manager|analyst))\b/i,
    hint: /\b(hr\b|human resources|recruit|talent)\b/i,
  },
  {
    label: "Sales",
    title: /\b(sales|account executive|account manager|business development|\bbdm\b|\bsdr\b|\bbdr\b|key account|territory manager|telesales|inside sales|field sales|pre[- ]?sales)\b/i,
    hint: /\b(sales|business development)\b/i,
  },
  {
    label: "Marketing & PR",
    title: /\b(marketing|\bseo\b|\bsem\b|\bppc\b|content (manager|writer|strategist|marketer|lead)|brand (manager|lead)|growth (manager|marketer|lead)|social media|digital marketing|communications|public relations|copywriter|community manager|\bcrm\b|email marketing)\b/i,
    hint: /\b(marketing|advertising|public relations|communications)\b/i,
  },
  {
    label: "Customer Service",
    title: /\b(customer (service|support|success|experience|care)|client (service|success)|call (centre|center)|contact (centre|center)|support (agent|advisor|representative)|customer advisor)\b/i,
    hint: /\b(customer service|customer support|call cent)\b/i,
  },
  {
    label: "Supply Chain & Logistics",
    title: /\b(supply chain|logistics|procurement|purchasing|\bbuyer\b|inventory|materials (planner|controller)|demand planner|warehouse (manager|operative|worker|assistant|associate|supervisor)|order picker|picker[- ]?packer|forklift|distribution (manager|centre)|fulfil(l)?ment|freight|shipping|category manager)\b/i,
    hint: /\b(supply chain|logistics|warehouse|procurement|purchasing)\b/i,
  },
  {
    label: "Transport & Driving",
    title: /\b(hgv|lgv|class\s*[12]|delivery driver|van driver|truck driver|lorry driver|bus driver|taxi driver|courier|chauffeur|driver|transport (manager|planner)|fleet (manager|controller))\b/i,
    hint: /\b(driving|transport)\b/i,
  },
  {
    label: "Hospitality & Catering",
    title: /\b(chef|sous chef|head chef|\bcook\b|kitchen (porter|assistant|hand)|barista|waiter|waitress|bartender|bar (staff|manager)|restaurant (manager|supervisor)|hotel|hospitality|catering|housekeep|concierge|food service|front of house)\b/i,
    hint: /\b(hospitality|catering|food service|leisure|tourism|travel)\b/i,
  },
  {
    label: "Construction & Trades",
    title: /\b(construction|electrician|plumber|carpenter|joiner|builder|labourer|laborer|bricklayer|roofer|plasterer|scaffolder|welder|fabricator|glazier|tiler|painter and decorator|site (manager|engineer|supervisor|agent)|quantity surveyor|estimator|building surveyor|groundwork|civils?)\b/i,
    hint: /\b(construction|trades?|building|property|skilled trade)\b/i,
  },
  {
    label: "Manufacturing & Production",
    title: /\b(production (operative|worker|manager|supervisor|planner|line)|manufacturing (operative|manager)|assembly (worker|operative)|machine operator|cnc (operator|machinist)|machinist|factory (worker|operative)|process operator|toolmaker)\b/i,
    hint: /\b(manufacturing|production)\b/i,
  },
  {
    label: "Engineering",
    title: /\b(mechanical engineer|electrical engineer|civil engineer|structural engineer|maintenance engineer|process engineer|chemical engineer|design engineer|project engineer|manufacturing engineer|quality engineer|controls engineer|aerospace engineer|field (service )?engineer|engineer)\b/i,
    hint: /\bengineer/i,
  },
  {
    label: "Science & Research",
    title: /\b(scientist|research(er| associate| scientist| fellow)|laboratory|lab (technician|analyst|assistant)|chemist|biologist|microbiologist|biochemist|formulation|clinical research|\br&d\b)\b/i,
    hint: /\b(science|scientific|research|laboratory|pharma)\b/i,
  },
  {
    label: "Media & Creative",
    title: /\b(journalist|editor|sub[- ]?editor|\bwriter\b|content creator|videographer|video editor|photographer|producer|presenter|broadcast|animator|illustrator|3d artist)\b/i,
    hint: /\b(media|journalism|publishing|writing)\b/i,
  },
  {
    label: "Retail",
    title: /\b(retail|store (manager|assistant|supervisor)|shop (assistant|manager)|sales assistant|cashier|checkout|merchandiser|visual merchandis|department manager)\b/i,
    hint: /\bretail\b/i,
  },
  {
    label: "Security",
    title: /\b(security (officer|guard|operative|manager)|door supervisor|cctv operator|loss prevention)\b/i,
    hint: /\bsecurity\b/i,
  },
  {
    label: "Cleaning & Facilities",
    title: /\b(cleaner|cleaning (operative|supervisor)|housekeeper|janitor|caretaker|facilities (manager|assistant|coordinator)|window cleaner|domestic (assistant|worker)|grounds(keeper|man)|maintenance (operative|assistant|technician))\b/i,
    hint: /\b(cleaning|facilities|domestic help|maintenance)\b/i,
  },
  {
    label: "Admin & Office",
    title: /\b(administrator|administrative|office (manager|administrator|assistant|coordinator)|receptionist|secretary|personal assistant|executive assistant|data entry|\bclerk\b|typist|business support)\b/i,
    hint: /\b(admin|administration|office|secretarial|clerical)\b/i,
  },
  {
    label: "Operations & Management",
    title: /\b(operations (manager|director|lead|coordinator|analyst)|\bcoo\b|chief operating|general manager|managing director|\bceo\b|programme manager|project manager|business (analyst|operations)|process improvement|continuous improvement|consultant)\b/i,
    hint: /\b(operations|management|consulting|business)\b/i,
  },
];

export const OTHER_CATEGORY = "Other";

export interface ClassifyCategoryInput {
  title: string;
  /** The raw category the source produced (used as a fallback hint). */
  category?: string | null;
}

/** Map a job onto the canonical category taxonomy. Returns "Other" if unsure. */
export function classifyCategory(input: ClassifyCategoryInput): string {
  const title = input.title ?? "";
  for (const rule of RULES) {
    if (rule.title.test(title)) return rule.label;
  }
  const hint = input.category ?? "";
  if (hint) {
    for (const rule of RULES) {
      if (rule.hint && rule.hint.test(hint)) return rule.label;
    }
  }
  return OTHER_CATEGORY;
}
