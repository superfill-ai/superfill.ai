import { TooltipTrigger } from "@radix-ui/react-tooltip";
import { MonitorIcon, Moon, Sun } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { Button } from "./button";
import { Kbd } from "./kbd";
import { Tooltip, TooltipContent } from "./tooltip";

interface ThemeToggleProps {
  className?: string;
  theme?: "light" | "dark" | "system";
  onToggle?: () => void | Promise<void>;
}

export function ThemeToggle({ className, theme = "system", onToggle }: ThemeToggleProps) {
  useHotkeys("t", async () => {
    await onToggle?.();
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          onClick={() => onToggle?.()}
          aria-pressed={theme === "dark"}
          aria-label="Toggle theme"
        >
          {theme === "light" ? (
            <Sun className="size-4 text-primary" />
          ) : theme === "dark" ? (
            <Moon className="size-4 text-primary" />
          ) : (
            <MonitorIcon className="size-4 text-primary" />
          )}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Toggle Theme <Kbd>t</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}
