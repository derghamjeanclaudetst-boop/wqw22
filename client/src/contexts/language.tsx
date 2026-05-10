import { createContext, useContext, useEffect, useState, useCallback } from "react";
import i18n from "@/i18n";

type Language = "en" | "ar";

type LanguageContextType = {
  language: Language;
  isRTL: boolean;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
};

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  isRTL: false,
  setLanguage: () => {},
  toggleLanguage: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLang] = useState<Language>(
    () => (localStorage.getItem("noviq_lang") as Language) || "en"
  );

  const isRTL = language === "ar";

  const applyLanguage = useCallback((lang: Language) => {
    const html = document.documentElement;
    html.setAttribute("lang", lang);
    html.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    i18n.changeLanguage(lang);
    localStorage.setItem("noviq_lang", lang);
  }, []);

  // Apply on mount
  useEffect(() => {
    applyLanguage(language);
  }, [language, applyLanguage]);

  const setLanguage = useCallback((lang: Language) => {
    setLang(lang);
  }, []);

  const toggleLanguage = useCallback(() => {
    setLang(prev => prev === "en" ? "ar" : "en");
  }, []);

  return (
    <LanguageContext.Provider value={{ language, isRTL, setLanguage, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
