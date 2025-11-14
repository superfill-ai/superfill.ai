import "@/assets/globals.css";
import { QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/query";
import { App } from "./App";

// biome-ignore lint/style/noNonNullAssertion: this is fine in entrypoints
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <main aria-label="Application content">
          <App />
        </main>
      </ThemeProvider>
      <Toaster />
    </QueryClientProvider>
  </React.StrictMode>,
);
