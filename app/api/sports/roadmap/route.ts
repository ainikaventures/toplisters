import { NextResponse } from "next/server";
import type { AnalysisResult } from "@/lib/sports/types";
import { resolveAiProvider, type AiProvider } from "@/lib/ai/provider";

/**
 * AI roadmap proxy — the headline feature's server piece. Takes a computed
 * analysis (probabilities + the exact possibility verdict + scenario) and
 * asks a FREE hosted LLM to turn the numbers into a punchy, prescriptive
 * plan. The provider key stays server-side; everything degrades gracefully
 * if the LLM is unavailable (the maths + odds still render client-side).
 *
 * Pluggable provider via env (default NVIDIA NIM):
 *   SPORTS_AI_PROVIDER = nvidia | groq | gemini | ollama   (default nvidia)
 *   SPORTS_AI_API_KEY  = generic key override; else provider-specific
 *                        (NVIDIA_KEY / GROQ_API_KEY / GEMINI_API_KEY)
 *   SPORTS_AI_MODEL    = model id override
 *   SPORTS_AI_BASE_URL = endpoint override
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RoadmapBody {
  sport: string;
  targetName: string;
  analysis: AnalysisResult;
}

const SYSTEM_PROMPT =
  "You are a sharp, concise sports analyst. Use ONLY the numbers provided — never invent stats, fixtures, or results. " +
  'Respond with ONLY a JSON object: {"roadmap": string[], "pundit": string}. ' +
  '"roadmap" is 3 to 5 short, concrete, prescriptive steps (who to beat, points/positions needed, rivals who must slip). ' +
  '"pundit" is one vivid, honest, quotable sentence. No markdown, no preamble.';

function buildUserPrompt(body: RoadmapBody): string {
  const a = body.analysis;
  const facts = a.possibility.facts.map((f) => `- ${f.label}: ${f.value}`).join("\n");
  const rivals = a.rivals
    .map((r) => `${r.name} ${(r.probability * 100).toFixed(1)}%`)
    .join(", ");
  const path = a.path
    .map(
      (s) =>
        `- ${s.label}: ${s.detail}` +
        (s.probability != null ? ` (win ${(s.probability * 100).toFixed(0)}%)` : ""),
    )
    .join("\n");
  return [
    `Sport: ${body.sport === "f1" ? "Formula 1 championship" : "FIFA World Cup 2026"}`,
    `Target: ${body.targetName}`,
    `Their simulated title probability: ${(a.target.probability * 100).toFixed(1)}%`,
    `Mathematically still possible: ${a.possibility.alive ? "yes" : "no"}${a.possibility.clinched ? " (already clinched)" : ""}`,
    `Verdict: ${a.possibility.headline}`,
    `Key numbers:\n${facts}`,
    `Top rivals by probability: ${rivals || "none"}`,
    `Scenario / path:\n${path}`,
    "",
    "Write the prescriptive roadmap and pundit take.",
  ].join("\n");
}

/** Tolerate models that wrap JSON in prose / code-fences. */
function parseModelJson(text: string): { roadmap: string[]; pundit: string } | null {
  let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const brace = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (brace >= 0 && end > brace) t = t.slice(brace, end + 1);
  try {
    const parsed = JSON.parse(t);
    const roadmap = Array.isArray(parsed.roadmap)
      ? parsed.roadmap.map((s: unknown) => String(s)).filter(Boolean).slice(0, 5)
      : [];
    const pundit = typeof parsed.pundit === "string" ? parsed.pundit : "";
    if (roadmap.length === 0 && !pundit) return null;
    return { roadmap, pundit };
  } catch {
    return null;
  }
}

async function callProvider(cfg: AiProvider, body: RoadmapBody): Promise<string> {
  const user = buildUserPrompt(body);

  if (cfg.kind === "gemini") {
    const res = await fetch(`${cfg.url}?key=${cfg.key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.6 },
      }),
    });
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const json = await res.json();
    return json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  if (cfg.kind === "ollama") {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.model,
        format: "json",
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`ollama ${res.status}`);
    const json = await res.json();
    return json?.message?.content ?? "";
  }

  // openai-compatible (nvidia, groq)
  const res = await fetch(cfg.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.key}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.6,
      max_tokens: 700,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${cfg.url} ${res.status}`);
  const json = await res.json();
  return json?.choices?.[0]?.message?.content ?? "";
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: RoadmapBody;
  try {
    body = (await request.json()) as RoadmapBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body?.analysis?.possibility || !body?.targetName) {
    return NextResponse.json({ error: "Missing analysis/targetName" }, { status: 400 });
  }

  const cfg = resolveAiProvider();
  if (!cfg.key) {
    // No key configured — degrade gracefully; the UI keeps the maths + odds.
    return NextResponse.json(
      { error: "AI roadmap unavailable (no provider key configured)" },
      { status: 503 },
    );
  }

  try {
    const raw = await callProvider(cfg, body);
    const parsed = parseModelJson(raw);
    if (!parsed) {
      console.error("[sports/roadmap] unparseable model output:", raw.slice(0, 240));
      return NextResponse.json({ error: "AI returned no usable plan" }, { status: 502 });
    }
    return NextResponse.json(parsed, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[sports/roadmap]", (err as Error).message);
    return NextResponse.json({ error: "AI provider error" }, { status: 502 });
  }
}
