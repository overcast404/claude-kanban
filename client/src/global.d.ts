export {};

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      pickDirectory: () => Promise<{ path?: string; cancelled?: boolean }>;
    };
  }
}
