import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';

interface UseIdleVideoResult {
  idleVideoSrc: string | null;
  onIdleEnded: () => void;
}

export function useIdleVideo(): UseIdleVideoResult {
  const [videos, setVideos] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  // Refs so onIdleEnded has a stable identity and always sees current values
  const videosRef = useRef<string[]>([]);
  const currentIndexRef = useRef(0);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    invoke<string[]>('get_idle_videos')
      .then((paths) => {
        const srcs = paths.map((p) => convertFileSrc(p, 'mediafile'));
        const shuffled = [...srcs].sort(() => Math.random() - 0.5);
        videosRef.current = shuffled;
        setVideos(shuffled);
        setCurrentIndex(0);
        currentIndexRef.current = 0;
      })
      .catch(() => {
        setVideos([]);
      });
  }, []);

  // Picks a random next video, never the same one that just ended
  const onIdleEnded = useCallback(() => {
    const list = videosRef.current;
    if (list.length <= 1) return;
    let next: number;
    do {
      next = Math.floor(Math.random() * list.length);
    } while (next === currentIndexRef.current);
    currentIndexRef.current = next;
    setCurrentIndex(next);
  }, []);

  const idleVideoSrc = videos.length > 0 ? videos[currentIndex] : null;

  return { idleVideoSrc, onIdleEnded };
}
