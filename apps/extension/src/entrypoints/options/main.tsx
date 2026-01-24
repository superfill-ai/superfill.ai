import { queryClient } from "@superfill/shared/query";
import { Toaster } from "@superfill/ui/sonner";
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import "./options.css";
import { ThemeProvider, useTheme } from "@/components/theme-provider";
import { App } from "./App";

function ThemedApp() {
  const { theme } = useTheme();
  return (
    <>
      <main aria-label="Application content">
        <App />
      </main>
      <Toaster theme={theme} />
    </>
  );
}

// biome-ignore lint/style/noNonNullAssertion: this is fine in entrypoints
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
