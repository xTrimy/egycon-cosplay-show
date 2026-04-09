export type MediaType = 'video' | 'audio' | 'none';

export interface CosplayerInfo {
  number: number;
  name: string;
  mediaPath: string | null;
  mediaType: MediaType;
}

export interface AppState {
  currentCosplayer: CosplayerInfo | null;
  isIdle: boolean;
}
