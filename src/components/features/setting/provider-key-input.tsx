import { CheckCircle2, EyeIcon, EyeOffIcon, Trash2 } from "lucide-react";
import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ProviderConfig } from "@/lib/providers/registry";

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
