import React from "react";
import { ThemeProvider } from "./theme-provider";

export const MainContainer = ({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) => {
  return (
    <React.StrictMode>
      <ThemeProvider>
        <main className={className} aria-label="Application content">
          {children}
        </main>
      </ThemeProvider>
    </React.StrictMode>
  );
};
