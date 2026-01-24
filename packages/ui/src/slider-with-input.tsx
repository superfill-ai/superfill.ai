import { InfoIcon } from "lucide-react";
import { useState } from "react";
import { Label } from "./label";
import { cn } from "./lib/cn";
import { Slider } from "./slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

type Props = {
  id: string;
  label: string;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  value: number;
  labelClassName?: string;
  labelHelpText?: string;
  pristineClassName?: string;
  dirtyClassName?: string;
};

export const SliderWithInput = ({
  id,
  label,
  onChange,
  min,
  max,
  step,
  value,
  labelClassName,
  labelHelpText,
  pristineClassName = "",
  dirtyClassName = "",
}: Props) => {
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = (newValue: number) => {
    setIsDirty(true);
    onChange(newValue);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label
          htmlFor={id}
          className={cn(labelClassName, "flex items-center gap-1")}
        >
          {label}{" "}
          {labelHelpText && (
            <Tooltip>
              <TooltipTrigger asChild>
                <InfoIcon className="size-5" />
              </TooltipTrigger>
              <TooltipContent>
                {labelHelpText ?? "Adjust the value using the slider or input"}
              </TooltipContent>
            </Tooltip>
          )}
        </Label>
        <input
          className={cn(
            "text-tx-foreground border-tx-border flex w-full max-w-20 rounded-md border px-1 text-right",
            !isDirty ? pristineClassName : dirtyClassName,
          )}
          type="number"
          aria-label={label}
          aria-labelledby={id}
          value={value ?? 0}
          min={min}
          max={max}
          onChange={(e) => handleChange(Number(e.target.value))}
        />
      </div>
      <Slider
        id={id}
        min={min}
        max={max}
        step={step}
        defaultValue={[value ?? 0]}
        value={[value ?? 0]}
        onValueChange={(e) => handleChange(e[0])}
      />
    </div>
  );
};
