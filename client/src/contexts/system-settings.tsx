import { createContext, useContext, useEffect, useState, useCallback } from "react";

type SystemSettings = {
  systemName: string;
  logoUrl: string;
};

type SystemSettingsContextType = SystemSettings & {
  refresh: () => Promise<void>;
};

const SystemSettingsContext = createContext<SystemSettingsContextType>({
  systemName: "NOVIQ",
  logoUrl: "",
  refresh: async () => {},
});

export function SystemSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SystemSettings>({ systemName: "NOVIQ", logoUrl: "" });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/system");
      if (res.ok) {
        const data = await res.json();
        setSettings({ systemName: data.systemName || "NOVIQ", logoUrl: data.logoUrl || "" });
      }
    } catch {
      // silently keep defaults
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    document.title = settings.systemName;
  }, [settings.systemName]);

  return (
    <SystemSettingsContext.Provider value={{ ...settings, refresh }}>
      {children}
    </SystemSettingsContext.Provider>
  );
}

export function useSystemSettings() {
  return useContext(SystemSettingsContext);
}
