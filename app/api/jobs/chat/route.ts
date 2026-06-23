import { NextResponse } from "next/server";
import { fetchJobs, type JobFilters } from "@/app/jobs/_data/query";
import { resolveAiProvider } from "@/lib/ai/provider";
import { resolveCountryCode } from "@/lib/api/country";
import { locationLabel, salaryRangeText } from "@/lib/format";
import { slugify } from "@/lib/slug";

/**
 * Conversational job search. Gives the (free, hosted) LLM a `search_jobs`
 * tool wired to our live listings, so users can chat to find roles. The LLM
 * extracts intent → we run the real query → it summarises/recommends. Jobs
 * are never invented (the model only sees rows our DB returned). Key stays
 * server-side; degrades gracefully when the provider is unavailable.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://toplisters.xyz";
const MAX_TOOL_ROUNDS = 3;

const SYSTEM_PROMPT =
  "You are Toplisters' job-search assistant. Help the user find real, current jobs by calling " +
  "the search_jobs tool — NEVER invent jobs, companies, or links; only mention roles the tool " +
  "returned. Keep replies short and friendly. If the request is vague, ask one quick clarifying " +
  "question (role, location, remote, salary). After searching, summarise the best 2–4 matches in " +
  "plain prose (the UI shows the full cards separately) and suggest a refinement.";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_jobs",
      description: "Search Toplisters' live job listings. Returns matching jobs from the database.",
      parameters: {
        type: "object",
        properties: {
          keywords: {
            type: "string",
            description: "Role title, skills, or free-text keywords (e.g. 'senior react developer').",
          },
          location: { type: "string", description: "City or country, e.g. 'London' or 'Germany'." },
          remote: { type: "boolean", description: "Only fully-remote roles." },
          salary_min: { type: "number", description: "Minimum annual salary." },
          limit: { type: "number", description: "Max results to return (default 6, max 12)." },
        },
      },
    },
  },
];

interface JobCard {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salary: string | null;
  url: string;
  apply_url: string | null;
}

async function runSearch(args: Record<string, unknown>): Promise<{ cards: JobCard[]; total: number }> {
  const filters: JobFilters = {
    q: null,
    country: null,
    category: null,
    workMode: null,
    jobType: null,
    collarType: null,
    salaryMin: null,
    salaryMax: null,
    visaSponsor: null,
  };
  // LLMs (esp. Llama) often return tool args as strings — coerce loosely.
  const str = (v: unknown) => (v == null ? "" : String(v).trim());
  const keywords = str(args.keywords);
  if (keywords) filters.q = keywords;
  const location = str(args.location);
  if (location) {
    const iso = resolveCountryCode(location);
    if (iso) filters.country = iso;
    else filters.q = [filters.q, location].filter(Boolean).join(" ");
  }
  if (args.remote === true || str(args.remote).toLowerCase() === "true") {
    filters.workMode = "remote";
  }
  const salaryMin = Number(args.salary_min);
  if (Number.isFinite(salaryMin) && salaryMin > 0) filters.salaryMin = Math.round(salaryMin);

  const { jobs, total } = await fetchJobs(filters, 1);
  const limit = Math.min(Math.max(Number(args.limit) || 6, 1), 12);
  const cards: JobCard[] = jobs.slice(0, limit).map((j) => ({
    id: j.id,
    title: j.title,
    company: j.companyName,
    location: locationLabel({ city: j.city, countryCode: j.countryCode }),
    remote: j.workMode === "remote",
    salary: salaryRangeText(j),
    url: `${SITE_URL}/job/${j.id}/${slugify(j.title)}`,
    apply_url: j.applyUrl ?? null,
  }));
  return { cards, total };
}

interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
  tool_call_id?: string;
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: { messages?: ChatMessage[] };
  try {
    body = (await request.json()) as { messages?: ChatMessage[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const history = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12);
  if (history.length === 0) {
    return NextResponse.json({ error: "No messages" }, { status: 400 });
  }

  const cfg = resolveAiProvider();
  if (cfg.kind !== "openai" || !cfg.key) {
    // Chat needs an OpenAI-compatible, tool-calling provider (NVIDIA/Groq).
    return NextResponse.json({ error: "Chat is unavailable (no provider key configured)" }, { status: 503 });
  }

  const messages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }, ...history];
  let lastCards: JobCard[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const res = await fetch(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
        body: JSON.stringify({
          model: cfg.model,
          temperature: 0.3,
          max_tokens: 800,
          tools: TOOLS,
          tool_choice: "auto",
          messages,
        }),
      });
      if (!res.ok) throw new Error(`${cfg.url} ${res.status}`);
      const json = await res.json();
      const msg = json?.choices?.[0]?.message as ChatMessage | undefined;
      if (!msg) throw new Error("no message in response");
      messages.push(msg);

      if (msg.tool_calls?.length) {
        for (const tc of msg.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.function.arguments || "{}");
          } catch {
            /* ignore bad args */
          }
          const { cards, total } = await runSearch(args);
          lastCards = cards;
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({
              total,
              returned: cards.length,
              jobs: cards.map((c) => ({
                title: c.title,
                company: c.company,
                location: c.location,
                remote: c.remote,
                salary: c.salary,
                url: c.url,
              })),
            }),
          });
        }
        continue; // let the model read the results and respond
      }

      // No tool call → final assistant turn.
      return NextResponse.json(
        { reply: msg.content ?? "", jobs: lastCards },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    // Hit the tool-round cap — return whatever we have.
    return NextResponse.json({
      reply: "Here are some roles that match — refine by location, remote, or salary if you like.",
      jobs: lastCards,
    });
  } catch (err) {
    console.error("[jobs/chat]", (err as Error).message);
    return NextResponse.json({ error: "Chat provider error" }, { status: 502 });
  }
}
