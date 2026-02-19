import type {
  DetectedFormSnapshot,
  FieldMapping,
  FieldMetadataSnapshot,
  PreviewFieldData,
  PreviewSidebarPayload,
} from "@/types/autofill";

export type PreviewRenderData = {
  forms: Array<{
    snapshot: DetectedFormSnapshot;
    fields: PreviewFieldData[];
  }>;
  summary: {
    totalFields: number;
    matchedFields: number;
    processingTime?: number;
  };
};

export const getPrimaryLabel = (metadata: FieldMetadataSnapshot): string => {
  const candidates = [
    metadata.labelTag,
    metadata.labelAria,
    metadata.labelData,
    metadata.labelTop,
    metadata.labelLeft,
    metadata.placeholder,
    metadata.name,
    metadata.id,
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return metadata.type;
};

export const buildPreviewFields = (
  form: DetectedFormSnapshot,
  mappingLookup: Map<string, FieldMapping>,
): PreviewFieldData[] =>
  form.fields.map((field): PreviewFieldData => {
    const mapping =
      mappingLookup.get(field.opid) ??
      ({
        fieldOpid: field.opid,
        value: null,
        confidence: 0,
        reasoning: "No suggestion generated",
        autoFill: false,
      } satisfies FieldMapping);

    return {
      fieldOpid: field.opid,
      formOpid: field.formOpid,
      metadata: field.metadata,
      mapping,
      primaryLabel: getPrimaryLabel(field.metadata),
    };
  });

export const buildRenderData = (
  payload: PreviewSidebarPayload,
  existingLookup?: Map<string, FieldMapping>,
): PreviewRenderData | null => {
  if (!payload.forms.length) {
    return null;
  }

  const mappingLookup =
    existingLookup ??
    new Map(
      payload.mappings.map((mapping: FieldMapping) => [
        mapping.fieldOpid,
        mapping,
      ]),
    );

  const forms = payload.forms.map((form: DetectedFormSnapshot) => ({
    snapshot: form,
    fields: buildPreviewFields(form, mappingLookup),
  }));

  const totalFields = payload.forms.reduce(
    (sum: number, form: DetectedFormSnapshot) => sum + form.fields.length,
    0,
  );

  const matchedFields = payload.mappings.filter(
    (mapping: FieldMapping) => mapping.value !== null,
  ).length;

  return {
    forms,
    summary: {
      totalFields,
      matchedFields,
      processingTime: payload.processingTime,
    },
  };
};
