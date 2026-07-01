import type { DetectedFormSnapshot } from "@/types/autofill";

export const assignGlobalHighlightIndices = (
  forms: DetectedFormSnapshot[],
): DetectedFormSnapshot[] => {
  let nextHighlightIndex = 0;

  return forms.map((form) => ({
    ...form,
    fields: form.fields.map((field) => {
      if (field.highlightIndex === null) {
        return field;
      }

      return {
        ...field,
        highlightIndex: nextHighlightIndex++,
      };
    }),
  }));
};
