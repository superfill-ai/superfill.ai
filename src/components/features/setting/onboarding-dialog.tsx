import { useForm } from "@tanstack/react-form";
import { SparklesIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { browser } from "wxt/browser";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import type { Country } from "@/components/ui/country-dropdown";
import { CountryDropdown } from "@/components/ui/country-dropdown";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { APP_NAME } from "@/constants";
import { useMemoryMutations } from "@/hooks/use-memories";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";
import type { MemoryEntry } from "@/types/memory";

const logger = createLogger("component:onboarding-dialog");

const onboardingSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.email("Invalid email address"),
  phoneNumber: z.e164("Invalid phone number"),
  address: z.string().min(1, "Address is required"),
  country: z.string().min(1, "Country is required"),
});

interface OnboardingDialogProps {
  open: boolean;
}

export function OnboardingDialog({ open }: OnboardingDialogProps) {
  const { addEntries } = useMemoryMutations();
  const [selectedCountryCode, setSelectedCountryCode] =
    useState<Country | null>(null);
  const [phoneDisplay, setPhoneDisplay] = useState("");

  const form = useForm({
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phoneNumber: "",
      address: "",
      country: "",
    },
    validators: {
      onSubmit: onboardingSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        const entries: Omit<MemoryEntry, "id" | "metadata">[] = [
          {
            question: "What is your first name?",
            answer: value.firstName,
            tags: ["personal", "name"],
            category: "personal",
            confidence: 1.0,
          },
          {
            question: "What is your last name?",
            answer: value.lastName,
            tags: ["personal", "name"],
            category: "personal",
            confidence: 1.0,
          },
          {
            question: "What is your email?",
            answer: value.email,
            tags: ["personal", "email", "contact"],
            category: "contact",
            confidence: 1.0,
          },
          {
            question: "What is your phone number?",
            answer: value.phoneNumber,
            tags: ["personal", "phone", "contact"],
            category: "contact",
            confidence: 1.0,
          },
          {
            question: "What is your address?",
            answer: value.address,
            tags: ["personal", "address"],
            category: "location",
            confidence: 1.0,
          },
          {
            question: "What is your country?",
            answer: value.country,
            tags: ["personal", "location"],
            category: "location",
            confidence: 1.0,
          },
        ];

        await addEntries.mutateAsync(entries);

        await storage.uiSettings.setValue({
          ...(await storage.uiSettings.getValue()),
          onboardingCompleted: true,
        });

        toast.success(`Welcome to ${APP_NAME}!`, {
          description: "Your memories have been created successfully.",
        });

        logger.info("Onboarding completed successfully");
      } catch (error) {
        logger.error("Onboarding error:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to complete onboarding",
        );
      }
    },
  });

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <img
              src={browser.runtime.getURL("/favicon.svg")}
              alt=""
              className="size-5"
            />
            Welcome to {APP_NAME}
          </DialogTitle>
          <DialogDescription>
            Let's get you started by setting up your basic information. This
            will create your first set of memories for auto-filling forms.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="space-y-2"
        >
          <FieldGroup className="gap-2">
            <div className="grid grid-cols-2 gap-4">
              <form.Field name="firstName">
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field>
                      <FieldLabel>
                        First Name <span className="text-destructive">*</span>
                      </FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="text"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        placeholder="John"
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  );
                }}
              </form.Field>

              <form.Field name="lastName">
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field>
                      <FieldLabel>
                        Last Name <span className="text-destructive">*</span>
                      </FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="text"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        placeholder="Doe"
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  );
                }}
              </form.Field>
            </div>

            <form.Field name="email">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;

                return (
                  <Field>
                    <FieldLabel>
                      Personal Email <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      aria-invalid={isInvalid}
                      placeholder="john.doe@example.com"
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="country">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;

                const handleCountryChange = (country: Country) => {
                  field.handleChange(country.name);
                  setSelectedCountryCode(country);
                  const phoneDigits = phoneDisplay.replace(/\D/g, "");
                  const countryCode = country.countryCallingCodes?.[0] || "";
                  if (phoneDigits) {
                    form.setFieldValue(
                      "phoneNumber",
                      `${countryCode}${phoneDigits}`,
                    );
                  }
                };

                return (
                  <Field>
                    <FieldLabel>
                      Country <span className="text-destructive">*</span>
                    </FieldLabel>
                    <CountryDropdown
                      id={field.name}
                      name={field.name}
                      defaultValue={field.state.value}
                      onChange={handleCountryChange}
                      aria-invalid={isInvalid}
                      placeholder="Select your country"
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="phoneNumber">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;

                const handlePhoneChange = (
                  e: React.ChangeEvent<HTMLInputElement>,
                ) => {
                  const inputValue = e.target.value;
                  setPhoneDisplay(inputValue);

                  const phoneDigits = inputValue.replace(/\D/g, "");
                  const countryCode =
                    selectedCountryCode?.countryCallingCodes?.[0] || "";

                  const newValue = phoneDigits
                    ? `${countryCode}${phoneDigits}`
                    : "";
                  field.handleChange(newValue);
                };

                return (
                  <Field>
                    <FieldLabel>
                      Phone Number <span className="text-destructive">*</span>
                    </FieldLabel>
                    <FieldDescription>Enter your phone number</FieldDescription>

                    <div className="relative">
                      {selectedCountryCode && (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                          {selectedCountryCode.countryCallingCodes?.[0] || ""}
                        </div>
                      )}
                      <Input
                        id={field.name}
                        name={field.name}
                        type="tel"
                        value={phoneDisplay}
                        onBlur={field.handleBlur}
                        onChange={handlePhoneChange}
                        aria-invalid={isInvalid}
                        placeholder="555-123-4567"
                        className={selectedCountryCode ? "pl-16" : ""}
                      />
                    </div>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="address">
              {(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;

                return (
                  <FieldGroup>
                    <FieldLabel>
                      Address <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Field>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="text"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        placeholder="123 Main St, City, State, ZIP"
                      />
                    </Field>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </FieldGroup>
                );
              }}
            </form.Field>
          </FieldGroup>

          <DialogFooter>
            <form.Subscribe selector={(state) => [state.isSubmitting]}>
              {([isSubmitting]) => (
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full"
                >
                  {isSubmitting ? (
                    <>
                      <SparklesIcon className="size-4 animate-spin" />
                      Creating your memories...
                    </>
                  ) : (
                    "Complete Setup"
                  )}
                </Button>
              )}
            </form.Subscribe>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
