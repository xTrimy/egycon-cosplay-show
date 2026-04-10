import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

interface UseIdleVideoResult {
  idleVideoSrc: string | null;
  nextIdleVideoSrc: string | null;
  idleVideoToken: number;
  onIdleEnded: () => void;
}

function pickNextIndex(list: string[], currentIndex: number): number {
  if (list.length === 0) return -1;
  if (list.length === 1) return 0;

  let next: number;
  do {
    next = Math.floor(Math.random() * list.length);
  } while (next === currentIndex);
  return next;
}

export function useIdleVideo(): UseIdleVideoResult {
  const [videos, setVideos] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [nextIndex, setNextIndex] = useState<number>(-1);
  const [idleVideoToken, setIdleVideoToken] = useState<number>(0);
  // Refs so onIdleEnded has a stable identity and always sees current values
  const videosRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const nextIndexRef = useRef(-1);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    invoke<string[]>('get_idle_videos')
      .then((paths) => {
        const srcs = paths.map((p) => convertFileSrc(p, 'mediafile'));
        const shuffled = [...srcs].sort(() => Math.random() - 0.5);
        const initialNextIndex = pickNextIndex(shuffled, 0);
        videosRef.current = shuffled;
        setVideos(shuffled);
        setCurrentIndex(0);
        setNextIndex(initialNextIndex);
        currentIndexRef.current = 0;
        nextIndexRef.current = initialNextIndex;
      })
      .catch(() => {
        setVideos([]);
        setNextIndex(-1);
      });
  }, []);

  // Advance the queue after a completed crossfade. The next clip is already
  // chosen and preloaded while the current one is playing.
  const onIdleEnded = useCallback(() => {
    const list = videosRef.current;
    if (list.length === 0) return;
    const resolvedNextIndex = nextIndexRef.current >= 0 ? nextIndexRef.current : 0;
    const followingIndex = pickNextIndex(list, resolvedNextIndex);

    currentIndexRef.current = resolvedNextIndex;
    nextIndexRef.current = followingIndex;

    setCurrentIndex(resolvedNextIndex);
    setNextIndex(followingIndex);
    setIdleVideoToken((token) => token + 1);
  }, []);

  const idleVideoSrc = videos.length > 0 ? videos[currentIndex] : null;
  const nextIdleVideoSrc =
    nextIndex >= 0 && nextIndex < videos.length ? videos[nextIndex] : idleVideoSrc;

  return { idleVideoSrc, nextIdleVideoSrc, idleVideoToken, onIdleEnded };
}
