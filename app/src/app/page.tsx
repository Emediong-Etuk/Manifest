// Phase 0 placeholder. The real landing page (live onchain stats, explainer,
// faucet banner) is built in Phase 3.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-4 py-16">
      <p
        className="font-mono text-sm tracking-wide text-ink-muted"
        aria-label="Route: Guangzhou to Apapa"
      >
        CNCAN ───▶ NGAPP
      </p>
      <h1 className="font-stencil text-6xl uppercase leading-none tracking-wide sm:text-7xl">
        Manifest
      </h1>
      <p className="text-lg text-ink">
        Pay-on-proof escrow for traders who ship in shared containers. Your money stays locked until
        your goods are photographed and measured at the warehouse.
      </p>
      <p className="w-fit rotate-[-2deg] border-2 border-accent px-3 py-1 font-stencil text-xl uppercase tracking-widest text-accent">
        Under construction
      </p>
    </main>
  );
}
