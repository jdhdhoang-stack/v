
export interface Speaker {
  id: string;
  name: string;
}

export interface SpeakerGroup {
    country: string;
    speakers: Speaker[];
}

export interface ChunkJob {
  id: string;
  text: string;
  status: 'pending' | 'processing' | 'finished' | 'error';
  audioUrl?: string;
  error?: string | null;
  timestamp?: string;
}

export type ProcessingState = 'idle' | 'processing';

declare global {
  interface Window {
    aistudio: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}
