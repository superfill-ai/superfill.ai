import { TooltipTrigger } from "@radix-ui/react-tooltip";
import { MonitorIcon, Moon, Sun } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Kbd } from "./kbd";
import { Tooltip, TooltipContent } from "./tooltip";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { toggleTheme, theme } = useTheme();

  useHotkeys("t", async () => {
    await toggleTheme();
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          onClick={() => toggleTheme()}
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
