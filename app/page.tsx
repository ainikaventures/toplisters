export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <span className="rounded-full border border-foreground/15 px-3 py-1 text-xs uppercase tracking-widest text-foreground/60">
          Phase 1 — Scaffold
        </span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Toplisters.xyz
        </h1>
        <p className="max-w-md text-balance text-foreground/70">
          A globally-aware job board with a 3D globe at the centre.
          Coming together one feature at a time.
        </p>
      </main>
      <footer className="border-t border-foreground/10 px-6 py-6 text-center text-xs text-foreground/60">
        Built by{" "}
        <a
          href="https://ainika.xyz"
          rel="noopener"
          className="font-medium text-foreground hover:underline"
        >
          Ainika
        </a>
        {" · "}Developed by{" "}
        <a
          href="https://lyrava.com"
          rel="noopener"
          className="font-medium text-foreground hover:underline"
        >
          Lyrava
        </a>
      </footer>
    </div>
  );
}
