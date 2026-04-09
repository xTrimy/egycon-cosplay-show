import { useEffect, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { fadeAudio, CROSSFADE_MS, type FadableAudio } from '../utils/audio';

export function useIdleMusic(suppress: boolean): { skipTrack: () => void } {
  const tracksRef = useRef<string[]>([]);
  const currentIdxRef = useRef(-1);

  const elARef = useRef<FadableAudio | null>(null);
  const elBRef = useRef<FadableAudio | null>(null);
  const activeSlotRef = useRef<'a' | 'b'>('a');

  const suppressRef = useRef(suppress);
  const loadedRef = useRef(false);
  // Stable ref so attachEndTrigger closures always call the latest startNextTrack
  const startNextTrackRef = useRef<() => void>(() => {});

  useEffect(() => {
    const a = new Audio() as FadableAudio;
    const b = new Audio() as FadableAudio;
    a.preload = 'auto';
    b.preload = 'auto';
    elARef.current = a;
    elBRef.current = b;
    return () => { a.pause(); b.pause(); };
  }, []);

  const getActive = useCallback(
    (): FadableAudio | null =>
      activeSlotRef.current === 'a' ? elARef.current : elBRef.current,
    [],
  );

  // Attach a timeupdate listener that fires startNextTrack CROSSFADE_MS seconds
  // before the end of `el`, so the next track starts loading and crossfading
  // while the current one is still audible.
  const attachEndTrigger = useCallback((el: FadableAudio) => {
    let triggered = false;
    const tryNext = () => {
      if (triggered || !isFinite(el.duration)) return;
      if (el.duration - el.currentTime <= CROSSFADE_MS / 1000) {
        triggered = true;
        el.removeEventListener('timeupdate', tryNext);
        el.removeEventListener('ended', tryNext);
        startNextTrackRef.current();
      }
    };
    el.addEventListener('timeupdate', tryNext);
    // Fallback for tracks shorter than CROSSFADE_MS
    el.addEventListener('ended', tryNext);
  }, []);

  const startNextTrack = useCallback(() => {
    const tracks = tracksRef.current;
    if (tracks.length === 0) return;

    let next = currentIdxRef.current;
    if (tracks.length > 1) {
      do { next = Math.floor(Math.random() * tracks.length); }
      while (next === currentIdxRef.current);
    }
    currentIdxRef.current = next;

    const outgoing = getActive();

    activeSlotRef.current = activeSlotRef.current === 'a' ? 'b' : 'a';
    const incoming = getActive();
    if (!incoming) return;

    incoming.src = tracks[next];
    incoming.load();
    incoming.volume = 0;
    incoming.play().catch(() => {});

    // Attach early-end trigger on the new incoming track
    attachEndTrigger(incoming);

    if (outgoing) {
      if (outgoing.volume > 0) {
        fadeAudio(outgoing, outgoing.volume, 0, CROSSFADE_MS, () => outgoing.pause());
      } else {
        outgoing.pause();
      }
    }

    if (!suppressRef.current) {
      fadeAudio(incoming, 0, 1, CROSSFADE_MS);
    }
  }, [getActive, attachEndTrigger]);

  // Keep the ref in sync so attachEndTrigger closures always call the latest version
  useEffect(() => { startNextTrackRef.current = startNextTrack; }, [startNextTrack]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    invoke<string[]>('get_idle_music')
      .then((paths) => {
        const srcs = paths.map((p) => convertFileSrc(p, 'mediafile'));
        if (srcs.length === 0) return;

        const shuffled = [...srcs].sort(() => Math.random() - 0.5);
        tracksRef.current = shuffled;
        currentIdxRef.current = 0;

        const el = elARef.current;
        if (!el) return;
        el.src = shuffled[0];
        el.load();
        attachEndTrigger(el);

        if (!suppressRef.current) {
          el.volume = 0;
          el.play().catch(() => {});
          fadeAudio(el, 0, 1, CROSSFADE_MS);
        }
      })
      .catch(() => {});
  }, [attachEndTrigger]);

  useEffect(() => {
    const prev = suppressRef.current;
    suppressRef.current = suppress;
    if (suppress === prev) return;

    const active = getActive();
    if (!active || tracksRef.current.length === 0) return;

    if (suppress) {
      fadeAudio(active, active.volume, 0, CROSSFADE_MS);
    } else {
      if (active.paused) active.play().catch(() => {});
      fadeAudio(active, active.volume, 1, CROSSFADE_MS);
    }
  }, [suppress, getActive]);

  return { skipTrack: startNextTrack };
}

