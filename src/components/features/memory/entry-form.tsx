import { useForm, useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { Loader2Icon, SparklesIcon, TagsIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { InputBadge } from "@/components/ui/input-badge";
import { Textarea } from "@/components/ui/textarea";
import { useMemoryMutations, useTopUsedTags } from "@/hooks/use-memories";
import { getCategorizationService } from "@/lib/ai/categorization-service";
import { allowedCategories } from "@/lib/copies";
import {
  ERROR_MESSAGE_API_KEY_NOT_CONFIGURED,
  ERROR_MESSAGE_PROVIDER_NOT_CONFIGURED,
} from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import type { AIProvider } from "@/lib/providers/registry";
import { getKeyVault } from "@/lib/security/key-vault";
import { storage } from "@/lib/storage";
import type { MemoryEntry } from "@/types/memory";

const logger = createLogger("component:entry-form");

const entryFormSchema = z.object({
  question: z.string(),
  answer: z.string().min(1, "Answer is required"),
  tags: z.array(z.string()),
  category: z.string().min(1, "Category is required"),
});

interface EntryFormProps {
  mode: "create" | "edit";
  layout?: "compact" | "normal";
  initialData?: MemoryEntry;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function EntryForm({
  mode,
  initialData,
  layout = "normal",
  onSuccess,
  onCancel,
}: EntryFormProps) {
  const [selectedProvider, setSelectedProvider] = useState<
    AIProvider | undefined
  >();

  const { addEntry, updateEntry } = useMemoryMutations();
  const top10Tags = useTopUsedTags(10);

  const categorizationService = getCategorizationService();

  const form = useForm({
    defaultValues: {
      question: initialData?.question || "",
      answer: initialData?.answer || "",
      tags: initialData?.tags || [],
      category: initialData?.category || "",
    },
    validators: {
      onSubmit: entryFormSchema,
    },
    onSubmit: ({ value }) => {
      toast.promise(
        async () => {
          try {
            if (mode === "edit" && initialData) {
              await updateEntry.mutateAsync({
                id: initialData.id,
                updates: {
                  question: value.question,
                  answer: value.answer,
                  tags: value.tags,
                  category: value.category,
                },
              });
            } else {
              await addEntry.mutateAsync({
                question: value.question,
                answer: value.answer,
                tags: value.tags,
                category: value.category,
                confidence: 1.0,
              });
            }

            onSuccess?.();
            form.reset();
          } catch (error) {
            logger.error("Failed to save entry:", error);
            throw error;
          }
        },
        {
          loading: mode === "edit" ? "Updating memory..." : "Saving memory...",
          success:
            mode === "edit"
              ? "Memory updated successfully!"
              : "Memory saved successfully!",
          error: "Failed to save memory.",
        },
      );
    },
  });
  const answer = useStore(form.store, (state) => state.values.answer);
  const question = useStore(form.store, (state) => state.values.question);

  const rephraseMutation = useMutation({
    mutationFn: async ({
      currentQuestion,
      currentAnswer,
    }: {
      currentQuestion: string;
      currentAnswer: string;
    }) => {
      if (!selectedProvider) {
        toast.error(ERROR_MESSAGE_PROVIDER_NOT_CONFIGURED, {
          description:
            "Please configure an AI provider in settings to use rephrasing.",
          action: {
            label: "Open Settings",
            onClick: () => browser.runtime.openOptionsPage(),
          },
          dismissible: true,
        });
        throw new Error(ERROR_MESSAGE_API_KEY_NOT_CONFIGURED);
      }

      const keyVault = getKeyVault();
      const apiKey = await keyVault.getKey(selectedProvider);

      if (!apiKey) {
        toast.error(ERROR_MESSAGE_API_KEY_NOT_CONFIGURED, {
          description:
            "Please configure an AI provider in settings to use rephrasing.",
          action: {
            label: "Open Settings",
            onClick: () => browser.runtime.openOptionsPage(),
          },
          dismissible: true,
        });
        throw new Error(ERROR_MESSAGE_API_KEY_NOT_CONFIGURED);
      }

      return categorizationService.rephrase(
        currentAnswer,
        currentQuestion,
        apiKey || undefined,
      );
    },
    onSuccess: (data) => {
      if (data?.rephrasedQuestion) {
        form.setFieldValue("question", data.rephrasedQuestion);
      }
      form.setFieldValue("answer", data.rephrasedAnswer);
    },
  });

  const categorizeAndTaggingMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProvider) {
        toast.warning(ERROR_MESSAGE_PROVIDER_NOT_CONFIGURED, {
          description:
            "Please configure an AI provider in settings to use categorization. Using fallback categorization instead!",
          action: {
            label: "Open Settings",
            onClick: () => browser.runtime.openOptionsPage(),
          },
          dismissible: true,
        });
      }
      const keyVault = getKeyVault();
      const apiKey = await keyVault.getKey(selectedProvider ?? "openai");

      if (!apiKey) {
        toast.error(ERROR_MESSAGE_API_KEY_NOT_CONFIGURED, {
          description:
            "Please configure an AI provider in settings to use categorization. Using fallback categorization instead!",
          action: {
            label: "Open Settings",
            onClick: () => browser.runtime.openOptionsPage(),
          },
          dismissible: true,
        });
      }

      return categorizationService.categorize(
        answer,
        question,
        apiKey || undefined,
      );
    },
    onSuccess: (data) => {
      if (data?.category) {
        form.setFieldValue("category", data.category);
      }

      if (data?.tags && data.tags.length > 0) {
        form.setFieldValue("tags", [
          ...form.getFieldValue("tags"),
          ...data.tags,
        ]);
      }
    },
  });

  const isAiCategorizing = categorizeAndTaggingMutation.isPending;
  const isAiRephrasing = rephraseMutation.isPending;

  useEffect(() => {
    const fetchAndWatch = async () => {
      const settings = await storage.aiSettings.getValue();
      setSelectedProvider(settings.selectedProvider);
    };

    fetchAndWatch();

    const unsubscribe = storage.aiSettings.watch((newSettings) => {
      if (newSettings) {
        setSelectedProvider(newSettings.selectedProvider);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        form.handleSubmit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [form, onCancel]);

  const handleCancel = () => {
    form.reset();
    onCancel?.();
  };

  const handleRephrase = () => {
    const currentQuestion = form.getFieldValue("question");
    const currentAnswer = form.getFieldValue("answer");

    if (!currentAnswer) {
      toast.error("Please provide an answer before rephrasing.");
      return;
    }

    toast.promise(
      rephraseMutation.mutateAsync({ currentQuestion, currentAnswer }),
      {
        success: "Content rephrased successfully!",
      },
    );
  };

  const handleTagClick = (tag: string) => {
    const currentTags = form.getFieldValue("tags");
    if (!currentTags.includes(tag)) {
      form.setFieldValue("tags", [...currentTags, tag]);
    }
  };

  const handleCategorizingAndTagging = () => {
    const currentAnswer = form.getFieldValue("answer");

    if (!currentAnswer) {
      toast.error("Please provide an answer before categorizing.");
      return;
    }

    toast.promise(categorizeAndTaggingMutation.mutateAsync(), {
      success: "Content categorized and tagged successfully!",
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      className="space-y-2"
    >
      <FieldGroup className="gap-2">
        <form.Field name="question">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field
                data-invalid={isInvalid}
                className={layout === "compact" ? "gap-1" : ""}
              >
                <FieldLabel htmlFor={field.name}>
                  Question (Optional)
                </FieldLabel>
                <Textarea
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                  placeholder="What information does this answer?"
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="answer">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field
                data-invalid={isInvalid}
                className={layout === "compact" ? "gap-1" : ""}
              >
                <FieldLabel htmlFor={field.name}>Answer *</FieldLabel>
                <Textarea
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  aria-invalid={isInvalid}
                  placeholder="Your information (e.g., email, phone, address)"
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        </form.Field>

        <div className="flex gap-2 flex-1 justify-between">
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={handleRephrase}
            disabled={isAiRephrasing || !answer.trim()}
          >
            {isAiRephrasing ? (
              <Loader2Icon className="mr-2 size-3 animate-spin" />
            ) : (
              <SparklesIcon className="mr-2 size-3" />
            )}
            Rephrase with AI
          </Button>

          {mode === "create" && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={handleCategorizingAndTagging}
              disabled={isAiCategorizing || !answer.trim()}
            >
              {isAiCategorizing ? (
                <Loader2Icon className="mr-2 size-3 animate-spin" />
              ) : (
                <TagsIcon className="mr-2 size-3" />
              )}
              Categorize & Tag with AI
            </Button>
          )}
        </div>

        <form.Field name="category">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;

            const categoryOptions: ComboboxOption[] = allowedCategories.map(
              (cat) => ({
                value: cat,
                label: cat.charAt(0).toUpperCase() + cat.slice(1),
              }),
            );

            return (
              <Field
                data-invalid={isInvalid}
                className={layout === "compact" ? "gap-1" : ""}
              >
                <FieldLabel htmlFor={field.name}>
                  Category *{" "}
                  {isAiCategorizing && (
                    <SparklesIcon className="size-3 animate-pulse" />
                  )}
                </FieldLabel>
                <Combobox
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                  options={categoryOptions}
                  placeholder="Select a category"
                  searchPlaceholder="Search categories..."
                  emptyText="No category found."
                  aria-invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        </form.Field>

        <form.Field name="tags">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && !field.state.meta.isValid;
            return (
              <Field
                data-invalid={isInvalid}
                className={layout === "compact" ? "gap-1" : ""}
              >
                <FieldLabel htmlFor={field.name}>
                  Tags{" "}
                  {isAiCategorizing && (
                    <SparklesIcon className="size-3 animate-pulse" />
                  )}{" "}
                </FieldLabel>
                <InputBadge
                  id={field.name}
                  value={field.state.value}
                  onChange={(value) => field.handleChange(value)}
                  placeholder="Add tags (press Enter, comma, or semicolon)"
                />
                {top10Tags.length > 0 && (
                  <FieldDescription>
                    Existing tags:{" "}
                    {top10Tags.map((tag) => (
                      <Badge
                        size="sm"
                        key={tag.tag}
                        variant="outline"
                        className="mr-1 cursor-pointer"
                        onClick={() => handleTagClick(tag.tag)}
                      >
                        {tag.tag}
                      </Badge>
                    ))}
                  </FieldDescription>
                )}
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>

      <Field orientation="horizontal">
        <form.Subscribe selector={(state) => [state.isSubmitting]}>
          {([isSubmitting]) => (
            <Button
              type="submit"
              disabled={isSubmitting || isAiCategorizing || isAiRephrasing}
              className="flex-1"
            >
              {isSubmitting && (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              )}
              {mode === "edit" ? "Update" : "Save"}
            </Button>
          )}
        </form.Subscribe>
        <Button type="reset" variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
      </Field>
    </form>
  );
}
