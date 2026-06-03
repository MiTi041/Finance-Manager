interface ElectronApi {
  send: (channel: string, data?: unknown) => void;
  receive: (channel: string, func: (...args: unknown[]) => void) => void;
  removeListener: (channel: string, func?: (...args: unknown[]) => void) => void;
  dbExport: () => Promise<{ success: boolean; error?: string }>;
  dbImport: () => Promise<{ success: boolean; error?: string }>;
  getVersion: () => Promise<string>;
  checkForUpdates: () => Promise<{ status: string }>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  openLogs: () => Promise<void>;
  openUserData: () => Promise<void>;
  openMailWithAttachment: (data: {
    to: string;
    subject: string;
    body: string;
  }) => Promise<{ success: boolean; error?: string; warning?: string }>;
}

interface Window {
  api: ElectronApi;
}
