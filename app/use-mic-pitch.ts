"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createStabilizer, rms, DEFAULT_THRESHOLDS } from "@/lib/pitch-detect.mjs";

export type MicState = "off" | "asking" | "listening" | "denied" | "unavailable" | "error";
export type MicReading = { state: "silence" | "unclear" | "settling" | "held" | "stable"; midi?: number; cents?: number };

/**
 * Microphone pitch reading for one monophonic line. Permission is requested only by start(),
 * which must run from a click. Every track is stopped on stop() and on unmount.
 * Audio is analysed in this page and never uploaded.
 */
export function useMicPitch(onStable: (midi: number, cents: number) => void) {
  const [state, setState] = useState<MicState>("off");
  const [reading, setReading] = useState<MicReading>({ state: "silence" });
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const frame = useRef<number | null>(null);
  const stableRef = useRef(onStable);
  const stabilizer = useRef(createStabilizer(DEFAULT_THRESHOLDS));
  useEffect(() => { stableRef.current = onStable; }, [onStable]);

  const stop = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    const ctx = context.current;
    context.current = null;
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => { /* already closing */ });
    stabilizer.current.reset();
    setReading({ state: "silence" });
    setState((current) => (current === "listening" || current === "asking" ? "off" : current));
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    if (stream.current) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) { setState("unavailable"); return; }
    setState("asking");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      stream.current = media;
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      context.current = ctx;
      const source = ctx.createMediaStreamSource(media);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const { PitchDetector } = await import("pitchy");
      const detector = PitchDetector.forFloat32Array(analyser.fftSize);
      const buffer = new Float32Array(analyser.fftSize);
      stabilizer.current.reset();
      setState("listening");
      const tick = () => {
        if (!context.current) return;
        analyser.getFloatTimeDomainData(buffer);
        const [hz, clarity] = detector.findPitch(buffer, ctx.sampleRate);
        const result = stabilizer.current.push({ hz, clarity, rms: rms(buffer) });
        setReading((previous) => (previous.state === result.state && previous.midi === result.midi ? previous : result as MicReading));
        if (result.state === "stable" && typeof result.midi === "number") stableRef.current(result.midi, result.cents ?? 0);
        frame.current = requestAnimationFrame(tick);
      };
      frame.current = requestAnimationFrame(tick);
    } catch (error) {
      stop();
      const name = (error as { name?: string })?.name;
      setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" ? "unavailable" : "error");
    }
  }, [stop]);

  const resetDecision = useCallback(() => stabilizer.current.reset(), []);

  return { state, reading, start, stop, resetDecision };
}
