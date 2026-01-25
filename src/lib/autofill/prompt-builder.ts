import type {
  DetectedFieldSnapshot,
  DetectedFormSnapshot,
} from "@/types/autofill";

function escapeForPrompt(value: string): string {
  return value
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, " ")
    .trim();
}

export function serializeFieldForAI(field: DetectedFieldSnapshot): string {
  const idx =
    field.highlightIndex !== null ? `[${field.highlightIndex}]` : "[hidden]";
  const tag =
    field.metadata.fieldType === "textarea"
      ? "textarea"
      : field.metadata.fieldType === "select"
        ? "select"
        : "input";
  const type = field.metadata.type ? escapeForPrompt(field.metadata.type) : "";
  const placeholder = field.metadata.placeholder
    ? escapeForPrompt(field.metadata.placeholder)
    : "";
  const name = field.metadata.name ? escapeForPrompt(field.metadata.name) : "";
  const labelTag = field.metadata.labelTag
    ? escapeForPrompt(field.metadata.labelTag)
    : "";
  const labelAria = field.metadata.labelAria
    ? escapeForPrompt(field.metadata.labelAria)
    : "";
  const labelTop = field.metadata.labelTop
    ? escapeForPrompt(field.metadata.labelTop)
    : "";
  const labelLeft = field.metadata.labelLeft
    ? escapeForPrompt(field.metadata.labelLeft)
    : "";
  const label = labelTag || labelAria || labelTop || labelLeft || "";

  const attrs: string[] = [];
  if (type && tag === "input") attrs.push(`type="${type}"`);
  if (name) attrs.push(`name="${name}"`);
  if (placeholder) attrs.push(`placeholder="${placeholder}"`);
  if (label) attrs.push(`label="${label}"`);

  if (field.metadata.options && field.metadata.options.length > 0) {
    const optionValues = field.metadata.options
      .map((o) => `"${escapeForPrompt(o.value)}"`)
      .join(",");
    attrs.push(`options=[${optionValues}]`);
  }

  const attrsStr = attrs.length > 0 ? ` ${attrs.join(" ")}` : "";
  return `${idx}<${tag}${attrsStr} />`;
}

export function serializeFormsForAI(forms: DetectedFormSnapshot[]): string {
  const allFields = forms.flatMap((form) => form.fields);

  const visibleFields = allFields.filter(
    (field) => field.highlightIndex !== null,
  );

  visibleFields.sort(
    (a, b) => (a.highlightIndex ?? 0) - (b.highlightIndex ?? 0),
  );

  return visibleFields.map(serializeFieldForAI).join("\n");
}

export function buildFieldsMarkdownWithIndices(
  forms: DetectedFormSnapshot[],
): string {
  const allFields = forms.flatMap((form) => form.fields);

  const lines = allFields
    .filter((f) => f.highlightIndex !== null)
    .sort((a, b) => (a.highlightIndex ?? 0) - (b.highlightIndex ?? 0))
    .map((f) => {
      const idx = f.highlightIndex;
      const parts = [
        `**[${idx}]** ${f.metadata.fieldType.toUpperCase()}`,
        `  - opid: ${f.opid}`,
        `  - purpose: ${f.metadata.fieldPurpose}`,
      ];

      const labels = [
        f.metadata.labelTag,
        f.metadata.labelAria,
        f.metadata.labelTop,
        f.metadata.labelLeft,
      ].filter(Boolean);
      if (labels.length > 0) {
        parts.push(`  - labels: ${labels.join(", ")}`);
      }

      if (f.metadata.placeholder) {
        parts.push(`  - placeholder: "${f.metadata.placeholder}"`);
      }

      if (f.metadata.options && f.metadata.options.length > 0) {
        const optionsList = f.metadata.options
          .map((opt) => `"${opt.value}"${opt.label ? ` (${opt.label})` : ""}`)
          .join(", ");
        parts.push(`  - options: [${optionsList}]`);
      }

      return parts.join("\n");
    });

  return lines.join("\n\n");
}
