import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/query";
import "~/assets/globals.css";
import { SidepanelApp } from "./SidepanelApp";

// biome-ignore lint/style/noNonNullAssertion: this is fine in entrypoints
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <main
          aria-label="Application content"
          className="h-full overflow-hidden"
        >
          <SidepanelApp />
        </main>
      </ThemeProvider>
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>,
);
