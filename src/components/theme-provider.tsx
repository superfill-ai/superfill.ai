import { createContext, useContext, useEffect } from "react";
import { APP_NAME } from "@/constants";
import { storage } from "@/lib/storage";
import type { UISettings } from "@/types/settings";
import { Theme } from "@/types/theme";

type ThemeProviderProps = {
  children: React.ReactNode;
};

type ThemeProviderState = {
  theme: Theme;
  toggleTheme: () => Promise<void>;
};

const initialState: ThemeProviderState = {
  theme: Theme.DEFAULT,
  toggleTheme: () => Promise.resolve(),
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>("system");

  const fetchThemeFromStorage = async () => {
    const ui = await storage.uiSettings.getValue();
    setTheme(ui.theme || "system");
  };

  const toggleTheme = async () => {
    const newTheme =
      theme === Theme.LIGHT
        ? Theme.DARK
        : theme === Theme.DARK
          ? Theme.DEFAULT
          : Theme.LIGHT;

    const currentSettings = await storage.uiSettings.getValue();
    const updatedSettings: UISettings = {
      ...currentSettings,
      theme: newTheme,
    };

    await storage.uiSettings.setValue(updatedSettings);
  };

  useEffect(() => {
    const host = document.querySelector(APP_NAME);
    const shadowRoot = host?.shadowRoot;
    const root =
      shadowRoot?.querySelector("html") || window.document.documentElement;

    if (!root) return;

    root.classList.remove("light", "dark");

    if (theme === Theme.DEFAULT) {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? Theme.DARK
        : Theme.LIGHT;

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fine here
  useEffect(() => {
    fetchThemeFromStorage();

    const unsubscribe = storage.uiSettings.watch((newSettings, oldSettings) => {
      if (newSettings?.theme !== oldSettings?.theme) {
        setTheme(newSettings?.theme || Theme.DEFAULT);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const value = {
    theme,
    toggleTheme,
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");

  return context;
};
