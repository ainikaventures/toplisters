"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GlobeCluster, GlobeJob } from "@/app/_data/globe";
import { JobPanel } from "./JobPanel";

interface Props {
  clusters: GlobeCluster[];
  jobs: GlobeJob[];
}

interface SelectedCluster {
  cluster: GlobeCluster;
  jobs: GlobeJob[];
}

interface GeoIpResponse {
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
}

const REGION_NAMES =
  typeof Intl !== "undefined"
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

function countryLabel(code: string) {
  if (code === "ZZ") return "Worldwide";
  try {
    return REGION_NAMES?.of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Globe.gl-driven landing experience. Renders one bar per (country, city)
 * cluster — bar height ∝ job count, colour fades from teal (1 job) to
 * orange (many) by linear interpolation on the population. Click a bar →
 * lookup the cluster's jobs from the prop list (cheap; we have ~150 jobs)
 * → open the slide-in panel.
 *
 * The auto-rotate to user's country uses /api/geoip with cookie caching;
 * the "Use my location" button asks for browser geolocation (more
 * accurate, opt-in). Both fade to a sensible default if they fail.
 */
export function GlobeView({ clusters, jobs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<unknown>(null);
  const [selected, setSelected] = useState<SelectedCluster | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const jobsByCluster = useMemo(() => {
    const map = new Map<string, GlobeJob[]>();
    for (const job of jobs) {
      const key = `${job.countryCode}:${job.city ?? "_"}`;
      const existing = map.get(key);
      if (existing) existing.push(job);
      else map.set(key, [job]);
    }
    return map;
  }, [jobs]);

  const maxCount = useMemo(
    () => clusters.reduce((m, c) => Math.max(m, c.jobCount), 1),
    [clusters],
  );

  // Mount Globe.gl once on the client.
  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      if (!containerRef.current) return;
      const Globe = (await import("globe.gl")).default;
      if (disposed) return;

      // Tunable: bar altitude scale + color ramp.
      const altScale = 0.22;
      const minAltitude = 0.015;
      const colorFor = (count: number) => {
        const t = Math.min(1, count / Math.max(maxCount, 1));
        // Teal → orange ramp.
        const r = Math.round(56 + (250 - 56) * t);
        const g = Math.round(178 - (178 - 130) * t);
        const b = Math.round(172 - (172 - 50) * t);
        return `rgb(${r}, ${g}, ${b})`;
      };

      const instance = new (Globe as unknown as new (
        el: HTMLElement,
      ) => GlobeApi)(containerRef.current)
        .globeImageUrl(
          "https://unpkg.com/three-globe/example/img/earth-night.jpg",
        )
        .bumpImageUrl(
          "https://unpkg.com/three-globe/example/img/earth-topology.png",
        )
        .backgroundColor("rgba(0,0,0,0)")
        .pointsData(clusters)
        .pointLat((d: unknown) => (d as GlobeCluster).lat)
        .pointLng((d: unknown) => (d as GlobeCluster).lng)
        .pointAltitude((d: unknown) =>
          minAltitude + altScale * Math.sqrt((d as GlobeCluster).jobCount / maxCount),
        )
        .pointColor((d: unknown) => colorFor((d as GlobeCluster).jobCount))
        .pointRadius(0.4)
        .pointLabel((d: unknown) => {
          const c = d as GlobeCluster;
          const place = c.city
            ? `${c.city}, ${countryLabel(c.countryCode)}`
            : countryLabel(c.countryCode);
          return `<div style="background:rgba(15,15,15,0.9);color:#fff;padding:8px 12px;border-radius:8px;font:500 13px system-ui">${place}<br/><span style="opacity:0.7;font-size:11px">${c.jobCount} ${c.jobCount === 1 ? "role" : "roles"}</span></div>`;
        })
        .onPointClick((d: unknown) => {
          const cluster = d as GlobeCluster;
          const matched = jobsByCluster.get(cluster.id) ?? [];
          setSelected({ cluster, jobs: matched });
        });

      // Auto-rotate slowly until the user interacts.
      const controls = instance.controls();
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.4;

      // Initial camera point.
      instance.pointOfView({ lat: 25, lng: 0, altitude: 2.4 }, 0);

      // Try to refine the camera to the user's region via the cookie/IP API.
      (async () => {
        try {
          const r = await fetch("/api/geoip", { cache: "no-store" });
          if (!r.ok) return;
          const data = (await r.json()) as GeoIpResponse;
          if (data.lat && data.lng) {
            instance.pointOfView({ lat: data.lat, lng: data.lng, altitude: 2.0 }, 1500);
          }
        } catch {
          /* ignore */
        }
      })();

      const handleResize = () => {
        if (!containerRef.current) return;
        instance.width(containerRef.current.clientWidth);
        instance.height(containerRef.current.clientHeight);
      };
      handleResize();
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(containerRef.current);

      globeRef.current = instance;
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      const g = globeRef.current as { _destructor?: () => void } | null;
      if (g?._destructor) g._destructor();
      globeRef.current = null;
    };
  }, [clusters, jobsByCluster, maxCount]);

  const useBrowserLocation = () => {
    if (!navigator.geolocation) {
      setStatusMsg("Browser geolocation not available.");
      return;
    }
    setStatusMsg("Locating…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const g = globeRef.current as GlobeApi | null;
        g?.pointOfView(
          { lat: pos.coords.latitude, lng: pos.coords.longitude, altitude: 1.6 },
          1200,
        );
        setStatusMsg(null);
      },
      () => setStatusMsg("Couldn't read your location."),
      { enableHighAccuracy: false, timeout: 5000 },
    );
  };

  const selectedTitle = selected
    ? selected.cluster.city ?? countryLabel(selected.cluster.countryCode)
    : "";
  const selectedSubtitle = selected
    ? `${selected.cluster.jobCount} ${selected.cluster.jobCount === 1 ? "role" : "roles"} · ${countryLabel(selected.cluster.countryCode)}`
    : "";

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black text-white">
      <div ref={containerRef} className="absolute inset-0" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 p-6 text-center">
        <h1 className="pointer-events-auto text-3xl font-semibold tracking-tight sm:text-4xl">
          Toplisters.xyz
        </h1>
        <p className="pointer-events-auto max-w-md text-sm text-white/70">
          {clusters.length.toLocaleString()} cities ·{" "}
          {jobs.length.toLocaleString()} active roles. Click a marker to
          open the listings.
        </p>
        <a
          href="/jobs"
          className="pointer-events-auto mt-1 rounded-full border border-white/20 bg-white/5 px-4 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-white/15"
        >
          Browse all roles →
        </a>
      </div>

      <div className="pointer-events-none absolute bottom-6 left-6 z-10 flex flex-col gap-2 sm:bottom-8 sm:left-8">
        <button
          type="button"
          onClick={useBrowserLocation}
          className="pointer-events-auto rounded-full border border-white/20 bg-white/5 px-4 py-2 text-xs font-medium backdrop-blur transition-colors hover:bg-white/15"
        >
          📍 Use my location
        </button>
        {statusMsg ? (
          <span className="text-xs text-white/60">{statusMsg}</span>
        ) : null}
      </div>

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-6 pb-3 text-center text-[10px] text-white/40">
        Built by{" "}
        <a href="https://ainika.xyz" rel="noopener" className="pointer-events-auto underline-offset-2 hover:underline">
          Ainika
        </a>{" · "}Developed by{" "}
        <a href="https://lyrava.com" rel="noopener" className="pointer-events-auto underline-offset-2 hover:underline">
          Lyrava
        </a>
      </footer>

      <JobPanel
        open={selected !== null}
        title={selectedTitle}
        subtitle={selectedSubtitle}
        jobs={selected?.jobs ?? []}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}

// Minimal type for the bits of the Globe.gl API we touch. Keeps the
// component working even if the library's own types lag behind.
interface GlobeApi {
  globeImageUrl(url: string): GlobeApi;
  bumpImageUrl(url: string): GlobeApi;
  backgroundColor(c: string): GlobeApi;
  pointsData(d: unknown[]): GlobeApi;
  pointLat(fn: (d: unknown) => number): GlobeApi;
  pointLng(fn: (d: unknown) => number): GlobeApi;
  pointAltitude(fn: (d: unknown) => number): GlobeApi;
  pointColor(fn: (d: unknown) => string): GlobeApi;
  pointRadius(r: number): GlobeApi;
  pointLabel(fn: (d: unknown) => string): GlobeApi;
  onPointClick(fn: (d: unknown) => void): GlobeApi;
  controls(): { autoRotate: boolean; autoRotateSpeed: number };
  pointOfView(p: { lat: number; lng: number; altitude: number }, ms: number): GlobeApi;
  width(n: number): GlobeApi;
  height(n: number): GlobeApi;
}
