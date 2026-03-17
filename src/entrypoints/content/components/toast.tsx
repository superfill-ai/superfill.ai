import { AlertCircle, CheckCircle, Info, XCircle, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ToastType } from "@/components/ui/sonner";

export interface ToastProps {
  message: string;
  type?: ToastType;
  action?: {
    label: string;
    onClick: () => void;
  };
  onDismiss: () => void;
}

const iconMap: Record<ToastType, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: AlertCircle,
  error: XCircle,
};

const colorMap: Record<ToastType, string> = {
  info: "text-blue-500",
  success: "text-green-500",
  warning: "text-amber-500",
  error: "text-red-500",
};

export function Toast({
  message,
  type = "info",
  action,
  onDismiss,
}: ToastProps) {
  const Icon = iconMap[type];
  const iconColor = colorMap[type];

  return (
    <div className="superfill-toast pointer-events-auto animate-in slide-in-from-top-2 fade-in duration-200">
      <div className="flex items-start gap-3 rounded-lg border bg-background p-4 shadow-lg min-w-[300px] max-w-[380px]">
        <Icon className={`h-5 w-5 shrink-0 ${iconColor}`} />
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-foreground">{message}</p>
          {action && (
            <Button variant="outline" size="xs" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <XIcon className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}
