import type { BracketRound, BracketMatch } from "@/lib/sports/worldcup/engine";
import type { WcTeam } from "@/lib/sports/worldcup/teams";
import { Flag } from "./Flag";

/**
 * Projected knockout bracket — one column per round, the favourite advancing.
 * Equal-height columns + justify-around give the classic bracket spacing; it
 * scrolls horizontally on narrow screens.
 */
export function Bracket({ rounds }: { rounds: BracketRound[] }) {
  if (!rounds.length) return null;
  const champion = rounds[rounds.length - 1]?.matches[0]?.winner ?? null;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Projected knockout bracket</h3>
        {champion ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground/60">
            Projected winner:
            <Flag iso2={champion.iso2} />
            <span className="font-semibold text-foreground">{champion.name}</span>
            <span aria-hidden>🏆</span>
          </span>
        ) : null}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-max items-stretch gap-3">
          {rounds.map((round) => (
            <div key={round.label} className="flex w-28 flex-col justify-around gap-1.5">
              <div className="text-center text-[10px] font-medium uppercase tracking-wide text-foreground/45">
                {round.label.replace("Round of ", "R")}
              </div>
              {round.matches.map((m, i) => (
                <MatchCard key={i} m={m} />
              ))}
            </div>
          ))}

          {champion ? (
            <div className="flex w-32 flex-col justify-center">
              <div className="mb-1 text-center text-[10px] font-medium uppercase tracking-wide text-foreground/45">
                Champion
              </div>
              <div className="flex items-center justify-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-2 text-xs font-semibold">
                <Flag iso2={champion.iso2} />
                <span className="truncate">{champion.name}</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-foreground/45">
        Most-likely bracket: the favourite (single-tie win probability) advances each round.
      </p>
    </section>
  );
}

function MatchCard({ m }: { m: BracketMatch }) {
  return (
    <div className="overflow-hidden rounded-md border border-foreground/10 bg-background">
      <TeamRow team={m.a} winner={m.winner?.code === m.a?.code} prob={m.prob} />
      <div className="border-t border-foreground/5" />
      <TeamRow team={m.b} winner={m.winner?.code === m.b?.code} prob={m.prob} />
    </div>
  );
}

function TeamRow({
  team,
  winner,
  prob,
}: {
  team: WcTeam | null;
  winner: boolean;
  prob: number;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 px-1.5 py-1 text-[11px] ${
        winner ? "bg-emerald-500/10 font-semibold" : "text-foreground/55"
      }`}
    >
      {team ? <Flag iso2={team.iso2} className="h-3 w-[18px] shrink-0 rounded-[1px] object-cover" /> : null}
      <span className="min-w-0 flex-1 truncate">{team?.code ?? "—"}</span>
      {winner ? <span className="shrink-0 tabular-nums text-foreground/45">{Math.round(prob * 100)}%</span> : null}
    </div>
  );
}
