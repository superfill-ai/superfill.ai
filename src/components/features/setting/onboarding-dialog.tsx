import { useForm } from "@tanstack/react-form";
import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GlobeIcon,
  KeyIcon,
  SparklesIcon,
  UserIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { DocumentImportDialog } from "@/components/features/document/document-import-dialog";
import { ProfileImportDialog } from "@/components/features/profile/profile-import-dialog";
import { Badge } from "@/components/ui/badge";
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
import { Separator } from "@/components/ui/separator";
import { APP_NAME } from "@/constants";
import { useMemoryMutations } from "@/hooks/use-memories";
import { useSaveApiKeyWithModel } from "@/hooks/use-provider-keys";
import { getDefaultModel } from "@/lib/ai/model-factory";
import { createLogger } from "@/lib/logger";
import {
  type AIProvider,
  getAllProviderConfigs,
  type ProviderConfig,
} from "@/lib/providers/registry";
import { getKeyValidationService } from "@/lib/security/key-validation-service";
import { storage } from "@/lib/storage";
import type { MemoryEntry } from "@/types/memory";

const logger = createLogger("component:onboarding-dialog");

type OnboardingStep = "ai-setup" | "basic-info" | "import";

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

const RECOMMENDED_PROVIDERS: AIProvider[] = ["openai", "anthropic", "gemini"];

export function OnboardingDialog({ open }: OnboardingDialogProps) {
  const { addEntries } = useMemoryMutations();
  const saveKeyWithModelMutation = useSaveApiKeyWithModel();

  const [step, setStep] = useState<OnboardingStep>("ai-setup");
  const [selectedCountryCode, setSelectedCountryCode] =
    useState<Country | null>(null);
  const [phoneDisplay, setPhoneDisplay] = useState("");
  const [showProfileImport, setShowProfileImport] = useState(false);
  const [showDocumentImport, setShowDocumentImport] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider | null>(
    null,
  );
  const [apiKey, setApiKey] = useState("");
  const [isValidatingKey, setIsValidatingKey] = useState(false);
  const [keyValidated, setKeyValidated] = useState(false);
  const [aiSkipped, setAiSkipped] = useState(false);

  const allConfigs = getAllProviderConfigs();
  const recommendedConfigs = allConfigs.filter((c) =>
    RECOMMENDED_PROVIDERS.includes(c.id as AIProvider),
  );

  useEffect(() => {
    const checkExistingConfig = async () => {
      try {
        const settings = await storage.aiSettings.getValue();
        if (settings.selectedProvider) {
          setKeyValidated(true);
          setSelectedProvider(settings.selectedProvider);
        }
      } catch (error) {
        logger.error("Failed to check existing AI config:", error);
      }
    };
    checkExistingConfig();
  }, []);

  const handleValidateAndSaveKey = async () => {
    if (!selectedProvider || !apiKey.trim()) return;

    setIsValidatingKey(true);
    try {
      const keyValidationService = getKeyValidationService();
      const isValid = await keyValidationService.validateKey(
        selectedProvider,
        apiKey,
      );

      if (isValid) {
        const defaultModel = getDefaultModel(selectedProvider);
        await saveKeyWithModelMutation.mutateAsync({
          provider: selectedProvider,
          key: apiKey,
          defaultModel,
        });
        setKeyValidated(true);
        toast.success("API key validated and saved!");
      } else {
        toast.error("Invalid API key. Please check and try again.");
      }
    } catch (error) {
      logger.error("Key validation error:", error);
      toast.error("Failed to validate API key");
    } finally {
      setIsValidatingKey(false);
    }
  };

  const handleSkipAiSetup = () => {
    setAiSkipped(true);
    setStep("basic-info");
  };

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
        setStep("import");
      } catch (error) {
        logger.error("Onboarding error:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to save your information",
        );
      }
    },
  });

  const handleCompleteOnboarding = async () => {
    try {
      await storage.uiSettings.setValue({
        ...(await storage.uiSettings.getValue()),
        onboardingCompleted: true,
      });

      toast.success(`Welcome to ${APP_NAME}!`, {
        description: "Setup complete. Start filling forms automatically!",
      });

      logger.debug("Onboarding completed successfully");
    } catch (error) {
      logger.error("Failed to complete onboarding:", error);
      toast.error("Failed to save settings");
    }
  };

  const handleProfileSuccess = async () => {
    setShowProfileImport(false);
    await handleCompleteOnboarding();
  };

  const handleDocumentSuccess = async () => {
    setShowDocumentImport(false);
    await handleCompleteOnboarding();
  };

  const getProviderKeyHint = (config: ProviderConfig) => {
    return `Get your API key from ${config.name}`;
  };

  const renderStepIndicator = () => (
    <div className="flex items-center justify-center gap-2 mb-4">
      {(["ai-setup", "basic-info", "import"] as OnboardingStep[]).map(
        (s, index) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`size-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step === s
                  ? "bg-primary text-primary-foreground"
                  : (s === "ai-setup" && (keyValidated || aiSkipped)) ||
                      (s === "basic-info" && step === "import")
                    ? "bg-green-500 text-white"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {(s === "ai-setup" && (keyValidated || aiSkipped)) ||
              (s === "basic-info" && step === "import") ? (
                <CheckCircle2Icon className="size-4" />
              ) : (
                index + 1
              )}
            </div>
            {index < 2 && (
              <div
                className={`w-12 h-0.5 ${
                  (s === "ai-setup" && step !== "ai-setup") ||
                  (s === "basic-info" && step === "import")
                    ? "bg-green-500"
                    : "bg-muted"
                }`}
              />
            )}
          </div>
        ),
      )}
    </div>
  );

  return (
    <>
      <Dialog open={open && !showProfileImport && !showDocumentImport}>
        <DialogContent showCloseButton={false} className="sm:max-w-2xl">
          {renderStepIndicator()}

          {/* Step 1: AI Setup */}
          {step === "ai-setup" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyIcon className="size-5 text-primary" />
                  Set Up AI Provider
                </DialogTitle>
                <DialogDescription>
                  {APP_NAME} uses AI to intelligently match your information to
                  form fields. Add your API key to enable smart form filling.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {keyValidated ? (
                  <div className="flex flex-col items-center gap-4 py-6">
                    <div className="size-16 rounded-full bg-green-500/10 flex items-center justify-center">
                      <CheckCircle2Icon className="size-8 text-green-500" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium">AI Provider Configured!</p>
                      <p className="text-sm text-muted-foreground">
                        You're all set to use intelligent form filling.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Select a provider and enter your API key. Your key is
                      stored securely in your browser.
                    </p>

                    <div className="grid gap-3">
                      {recommendedConfigs.map((config) => (
                        <button
                          type="button"
                          key={config.id}
                          onClick={() => {
                            setSelectedProvider(config.id as AIProvider);
                            setApiKey("");
                          }}
                          className={`flex items-center gap-3 p-4 rounded-lg border text-left transition-colors ${
                            selectedProvider === config.id
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{config.name}</span>
                              {config.id === "openai" && (
                                <Badge variant="secondary" size="sm">
                                  Recommended
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {config.description}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>

                    {selectedProvider && (
                      <div className="space-y-3 pt-2">
                        <Separator />
                        <Field>
                          <FieldLabel>
                            {
                              allConfigs.find((c) => c.id === selectedProvider)
                                ?.name
                            }{" "}
                            API Key
                          </FieldLabel>
                          <div className="flex gap-2">
                            <Input
                              type="password"
                              placeholder={
                                allConfigs.find(
                                  (c) => c.id === selectedProvider,
                                )?.keyPlaceholder
                              }
                              value={apiKey}
                              onChange={(e) => setApiKey(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && apiKey.trim()) {
                                  handleValidateAndSaveKey();
                                }
                              }}
                            />
                            <Button
                              onClick={handleValidateAndSaveKey}
                              disabled={!apiKey.trim() || isValidatingKey}
                            >
                              {isValidatingKey ? "Validating..." : "Save"}
                            </Button>
                          </div>
                          <FieldDescription className="flex items-center gap-1">
                            {allConfigs.find(
                              (c) => c.id === selectedProvider,
                            ) &&
                              getProviderKeyHint(
                                allConfigs.find(
                                  (c) => c.id === selectedProvider,
                                ) as ProviderConfig,
                              )}
                            <a
                              href={
                                allConfigs.find(
                                  (c) => c.id === selectedProvider,
                                )?.apiKeyUrl
                              }
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              Get API Key
                              <ExternalLinkIcon className="size-3" />
                            </a>
                          </FieldDescription>
                        </Field>
                      </div>
                    )}
                  </>
                )}
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                {!keyValidated && (
                  <Button
                    variant="ghost"
                    onClick={handleSkipAiSetup}
                    className="w-full sm:w-auto"
                  >
                    Skip for now
                  </Button>
                )}
                <Button
                  onClick={() => setStep("basic-info")}
                  disabled={!keyValidated && !aiSkipped}
                  className="w-full sm:w-auto gap-2"
                >
                  {keyValidated ? "Continue" : "Next"}
                  <ChevronRightIcon className="size-4" />
                </Button>
              </DialogFooter>
            </>
          )}

          {/* Step 2: Basic Info */}
          {step === "basic-info" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <UserIcon className="size-5 text-primary" />
                  Your Basic Information
                </DialogTitle>
                <DialogDescription>
                  Enter your details to create your first memories for
                  auto-filling forms.
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
                          field.state.meta.isTouched &&
                          !field.state.meta.isValid;

                        return (
                          <Field>
                            <FieldLabel>
                              First Name{" "}
                              <span className="text-destructive">*</span>
                            </FieldLabel>
                            <Input
                              id={field.name}
                              name={field.name}
                              type="text"
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(e) =>
                                field.handleChange(e.target.value)
                              }
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
                          field.state.meta.isTouched &&
                          !field.state.meta.isValid;

                        return (
                          <Field>
                            <FieldLabel>
                              Last Name{" "}
                              <span className="text-destructive">*</span>
                            </FieldLabel>
                            <Input
                              id={field.name}
                              name={field.name}
                              type="text"
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(e) =>
                                field.handleChange(e.target.value)
                              }
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
                            Personal Email{" "}
                            <span className="text-destructive">*</span>
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
                        const countryCode =
                          country.countryCallingCodes?.[0] || "";
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
                            Phone Number{" "}
                            <span className="text-destructive">*</span>
                          </FieldLabel>
                          <FieldDescription>
                            Enter your phone number
                          </FieldDescription>

                          <div className="relative">
                            {selectedCountryCode && (
                              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
                                {selectedCountryCode.countryCallingCodes?.[0] ||
                                  ""}
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
                              onChange={(e) =>
                                field.handleChange(e.target.value)
                              }
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

                <DialogFooter className="flex-col sm:flex-row gap-2 pt-4">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep("ai-setup")}
                    className="w-full sm:w-auto gap-2"
                  >
                    <ChevronLeftIcon className="size-4" />
                    Back
                  </Button>
                  <form.Subscribe selector={(state) => [state.isSubmitting]}>
                    {([isSubmitting]) => (
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full sm:w-auto gap-2"
                      >
                        {isSubmitting ? (
                          "Saving..."
                        ) : (
                          <>
                            Continue
                            <ChevronRightIcon className="size-4" />
                          </>
                        )}
                      </Button>
                    )}
                  </form.Subscribe>
                </DialogFooter>
              </form>
            </>
          )}

          {/* Step 3: Import */}
          {step === "import" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <SparklesIcon className="size-5 text-primary" />
                  Import More Information
                </DialogTitle>
                <DialogDescription>
                  Quickly add more details by importing from LinkedIn or a
                  document like your resume.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {keyValidated ? (
                  <div className="grid gap-3">
                    <button
                      type="button"
                      onClick={() => setShowProfileImport(true)}
                      className="flex items-center gap-4 p-4 rounded-lg border hover:border-primary hover:bg-primary/5 text-left transition-colors"
                    >
                      <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <GlobeIcon className="size-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">Import from Profile URL</p>
                        <p className="text-sm text-muted-foreground">
                          Import from LinkedIn, GitHub, Twitter, or any profile
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowDocumentImport(true)}
                      className="flex items-center gap-4 p-4 rounded-lg border hover:border-primary hover:bg-primary/5 text-left transition-colors"
                    >
                      <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileTextIcon className="size-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">Import from Document</p>
                        <p className="text-sm text-muted-foreground">
                          Upload a resume, CV, or any document with your info
                        </p>
                      </div>
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-amber-600 text-center">
                    Import features require an AI provider. You can set it up
                    later in Settings.
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={handleCompleteOnboarding}
                  className="w-full sm:w-auto"
                >
                  Skip & Finish Setup
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ProfileImportDialog
        open={showProfileImport}
        onOpenChange={setShowProfileImport}
        onSuccess={handleProfileSuccess}
      />

      <DocumentImportDialog
        open={showDocumentImport}
        onOpenChange={setShowDocumentImport}
        onSuccess={handleDocumentSuccess}
      />
    </>
  );
}
