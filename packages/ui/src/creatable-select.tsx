import { CheckIcon, ChevronDownIcon, Loader2Icon, XIcon } from "lucide-react";
import * as React from "react";
import { Button } from "./button";
import { Command, CommandGroup, CommandInput, CommandItem } from "./command";
import { cn } from "./lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

interface Option {
  value: string;
  label: string;
}

interface CreatableSelectProps {
  options: Option[];
  defaultValue?: Option;
  isLoading?: boolean;
  mutate?: () => void;
  name?: string;
  id?: string;
}

interface State {
  open: boolean;
  value: string;
  query: string;
  newOptions: Option[];
}

type Action =
  | { type: "SET_OPEN"; payload: boolean }
  | { type: "SET_VALUE"; payload: string }
  | { type: "SET_QUERY"; payload: string }
  | { type: "SET_NEW_OPTIONS"; payload: Option[] }
  | { type: "ADD_OPTION"; payload: Option };

const matches = (str: string, query: string, exact: boolean = false) =>
  exact
    ? str.toLowerCase() === query.toLowerCase()
    : str.toLowerCase().includes(query.toLowerCase());

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_OPEN":
      return { ...state, open: action.payload };
    case "SET_VALUE":
      return { ...state, value: action.payload };
    case "SET_QUERY":
      return { ...state, query: action.payload };
    case "SET_NEW_OPTIONS":
      return { ...state, newOptions: action.payload };
    case "ADD_OPTION":
      return {
        ...state,
        newOptions: [...state.newOptions, action.payload],
        value: action.payload.value,
      };
    default:
      return state;
  }
}

export default function CreatableSelect({
  options,
  defaultValue,
  isLoading = false,
  mutate,
  name,
  id,
}: CreatableSelectProps) {
  const initialState: State = {
    open: false,
    value: defaultValue?.value || "",
    query: "",
    newOptions: options,
  };

  const [state, dispatch] = React.useReducer(reducer, initialState);

  React.useEffect(() => {
    /* execute mutate function when 
      navigation state is not idle
      in case data is coming from an api */
    mutate?.();
    /* reset query when navigation state is not idle */
    dispatch({ type: "SET_QUERY", payload: "" });
  }, [mutate]);

  return (
    <>
      <input
        /* hidden input to store the value
        in case we are using a form */
        className="hidden"
        type="hidden"
        name={name}
        value={state.value}
      />
      <Popover
        open={state.open}
        onOpenChange={(open) => dispatch({ type: "SET_OPEN", payload: open })}
      >
        <PopoverTrigger asChild>
          <Button
            id={id}
            variant="outline"
            role="combobox"
            aria-expanded={state.open}
            className="w-full justify-between"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              state.value || "Select option..."
            )}
            <ChevronDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 min-w-[--radix-popover-trigger-width] max-h-[calc(var(--radix-popover-content-available-height)-2rem)] overflow-auto">
          <Command>
            <CommandInput
              value={state.query}
              onValueChange={(query) =>
                dispatch({ type: "SET_QUERY", payload: query })
              }
              placeholder="Search option..."
              className="h-9"
            />
            <CommandGroup>
              {state.query &&
                !state.newOptions.some((option) =>
                  matches(option.label, state.query, true),
                ) && (
                  <CommandItem
                    key={state.query}
                    value={state.query}
                    onSelect={() => {
                      const newOption = {
                        value: state.query,
                        label: state.query,
                      };
                      dispatch({ type: "ADD_OPTION", payload: newOption });
                      dispatch({ type: "SET_OPEN", payload: false });
                    }}
                  >
                    Create "{state.query}"
                    <XIcon
                      className="ml-auto h-4 w-4 cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        dispatch({ type: "SET_QUERY", payload: "" });
                      }}
                    />
                  </CommandItem>
                )}
              {state.newOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    dispatch({ type: "SET_VALUE", payload: option.value });
                    dispatch({ type: "SET_OPEN", payload: false });
                  }}
                >
                  {option.label}
                  <CheckIcon
                    className={cn(
                      "ml-auto h-4 w-4",
                      state.value === option.value
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </>
  );
}
