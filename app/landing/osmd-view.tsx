"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Engraves MusicXML with OpenSheetMusicDisplay, loaded only once the box comes near the screen, so the
 * landing page does not pay for the engraver up front. No title or part names: the page around it has them.
 */
export function OsmdView({ xml, label, failLabel, className = "", zoom = 1 }: { xml: string; label: string; failLabel: string; className?: string; zoom?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [state, setState] = useState<"waiting" | "ready" | "failed">("waiting");
  useEffect(() => {
    const node = box.current;
    if (!node || near) return;
    const seen = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) setNear(true); }, { rootMargin: "600px 0px" });
    seen.observe(node);
    return () => seen.disconnect();
  }, [near]);
  useEffect(() => {
    const node = box.current;
    if (!node || !near) return;
    let cancelled = false;
    (async () => {
      try {
        const { OpenSheetMusicDisplay } = await import("opensheetmusicdisplay");
        if (cancelled) return;
        node.innerHTML = "";
        const osmd = new OpenSheetMusicDisplay(node, { autoResize: true, backend: "svg", drawTitle: false, drawComposer: false, drawPartNames: false, drawCredits: false, drawMeasureNumbers: false, drawingParameters: "compacttight", stretchLastSystemLine: true });
        await osmd.load(xml);
        if (cancelled) return;
        osmd.Zoom = zoom;
        osmd.render();
        setState("ready");
      } catch { if (!cancelled) setState("failed"); }
    })();
    return () => { cancelled = true; node.innerHTML = ""; };
  }, [xml, near, zoom]);
  return (
    <div className={`osmd-view ${className}`} data-state={state}>
      {state === "waiting" && <p className="osmd-note">{label}</p>}
      {state === "failed" && <p className="osmd-note" role="status">{failLabel}</p>}
      <div ref={box} className="osmd-box" role="img" aria-label={label} aria-hidden={state !== "ready"} />
    </div>
  );
}
