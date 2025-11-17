import {
  AlertCircleIcon,
  CheckCircle2,
  EyeIcon,
  EyeOffIcon,
  Trash2,
  XCircle,
} from "lucide-react";
import { useId, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ProviderConfig } from "@/lib/providers/registry";
import { getKeyValidationService } from "@/lib/security/key-validation-service";

interface ProviderKeyInputProps {
  providerId: string;
  config: ProviderConfig;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  showKey: boolean;
  onToggleShow: () => void;
  hasExistingKey: boolean;
  onDelete: () => void;
  isSelected: boolean;
}

export const ProviderKeyInput = ({
  providerId,
  config,
  value,
  onChange,
  onSave,
  showKey,
  onToggleShow,
  hasExistingKey,
  onDelete,
  isSelected,
}: ProviderKeyInputProps) => {
  const inputId = useId();
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "idle" | "success" | "error"
  >("idle");

  if (!config.requiresApiKey && providerId === "ollama") {
    const handleTestConnection = async () => {
      setIsTestingConnection(true);
      setConnectionStatus("idle");

      try {
        const keyValidationService = getKeyValidationService();
        const isConnected = await keyValidationService.validateKey(
          "ollama",
          "",
        );

        if (isConnected) {
          setConnectionStatus("success");
          onSave();
        } else {
          setConnectionStatus("error");
        }
      } catch {
        setConnectionStatus("error");
      } finally {
        setIsTestingConnection(false);
      }
    };

    return (
      <Field data-invalid={false}>
        <div className="flex items-center gap-2">
          <FieldLabel htmlFor={inputId}>{config.name}</FieldLabel>
          {isSelected && (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="size-3" />
              Active
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleTestConnection}
            disabled={isTestingConnection}
            variant={
              connectionStatus === "success"
                ? "default"
                : connectionStatus === "error"
                  ? "destructive"
                  : "outline"
            }
            className="flex-1"
          >
            {isTestingConnection ? (
              "Testing Connection..."
            ) : connectionStatus === "success" ? (
              <>
                <CheckCircle2 className="size-4 mr-2" />
                Connected
              </>
            ) : connectionStatus === "error" ? (
              <>
                <XCircle className="size-4 mr-2" />
                Connection Failed
              </>
            ) : (
              "Test Connection"
            )}
          </Button>
          {hasExistingKey && (
            <Button
              variant="ghost"
              size="icon"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
              aria-label="Disable Ollama"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
        <FieldDescription>
          {connectionStatus === "error" ? (
            <span className="text-destructive">
              Make sure Ollama is running on http://localhost:11434
            </span>
          ) : (
            <Alert variant="destructive">
              <AlertDescription>
                <span className="text-destructive text-xs">
                  <AlertCircleIcon className="inline-block size-4" /> To use
                  Ollama with this extension, please ensure that{" "}
                  <a
                    href="https://medium.com/dcoderai/how-to-handle-cors-settings-in-ollama-a-comprehensive-guide-ee2a5a1beef0"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    CORS settings are properly configured
                  </a>
                  .
                </span>
              </AlertDescription>
            </Alert>
          )}
        </FieldDescription>
      </Field>
    );
  }

  if (!config.requiresApiKey) {
    return null;
  }

  const handleBlur = () => {
    if (value.trim()) {
      onSave();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && value.trim()) {
      onSave();
    }
  };

  return (
    <Field data-invalid={false}>
      <div className="flex items-center gap-2">
        <FieldLabel htmlFor={inputId}>{config.name} API Key</FieldLabel>
        {isSelected && (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="size-3" />
            Active
          </Badge>
        )}
      </div>
      <div className="relative">
        <Input
          id={inputId}
          type={showKey ? "text" : "password"}
          placeholder={
            hasExistingKey ? "••••••••••••••••" : config.keyPlaceholder
          }
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        <div className="absolute right-0 top-0 h-full flex items-center gap-1 pr-1">
          {hasExistingKey && !value && (
            <Badge variant="outline" className="gap-1 h-7">
              <CheckCircle2 className="size-3" />
              Set
            </Badge>
          )}
          {hasExistingKey && !value && (
            <Button
              variant="ghost"
              size="icon"
              className="h-full text-destructive hover:text-destructive"
              onClick={onDelete}
              aria-label="Delete API key"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-full"
            onClick={onToggleShow}
            onMouseDown={(e) => e.preventDefault()}
          >
            {showKey ? (
              <EyeOffIcon className="size-4" />
            ) : (
              <EyeIcon className="size-4" />
            )}
          </Button>
        </div>
      </div>
      {hasExistingKey && !value ? (
        <FieldDescription>
          API key is already configured. Enter a new key to update it.
        </FieldDescription>
      ) : config.description ? (
        <FieldDescription>{config.description}</FieldDescription>
      ) : null}
    </Field>
  );
};
