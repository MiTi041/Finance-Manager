import { useCallback, useEffect, useState } from "react";

import { fetchAssistantConfig, type AssistantConfig } from "@/lib/assistant";

export const ASSISTANT_CONFIG_CHANGED_EVENT = "assistant-config-changed";

export function useAssistantConfig(): AssistantConfig | null {
  const [config, setConfig] = useState<AssistantConfig | null>(null);

  const load = useCallback(async () => {
    try {
      setConfig(await fetchAssistantConfig());
    } catch {
      setConfig(null);
    }
  }, []);

  useEffect(() => {
    void load();
    window.addEventListener(ASSISTANT_CONFIG_CHANGED_EVENT, load);
    return () => window.removeEventListener(ASSISTANT_CONFIG_CHANGED_EVENT, load);
  }, [load]);

  return config;
}
