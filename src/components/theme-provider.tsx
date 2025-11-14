import { createContext, useContext, useEffect } from "react";
import { APP_NAME } from "@/constants";
import { useUISettingsStore } from "@/lib/stores/ui-settings";
import { Theme } from "@/types/theme";

type ThemeProviderProps = {
  children: React.ReactNode;
};

type ThemeProviderState = {
  theme: Theme;
  toggleTheme: () => void;
};

const initialState: ThemeProviderState = {
  theme: Theme.DEFAULT,
  toggleTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const theme = useUISettingsStore((state) => state.theme);
  const toggleTheme = useUISettingsStore((state) => state.toggleTheme);

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
