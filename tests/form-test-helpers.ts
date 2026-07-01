import { mock } from "bun:test";
import type { FormDetectionService as FormDetectionServiceInstance } from "@/entrypoints/content/lib/form-detection-service";
import type {
  DetectedFieldSnapshot,
  DetectedFormSnapshot,
} from "@/types/autofill";
import { installDom } from "./dom-fixture";

type MessageHandler = (...args: readonly unknown[]) => unknown;

mock.module("@/lib/delay", () => ({
  delay: async (): Promise<void> => {},
}));

mock.module("@/lib/autofill/content-autofill-messaging", () => ({
  contentAutofillMessaging: {
    onMessage:
      (_message: string, _handler: MessageHandler): (() => void) =>
      () => {},
    sendMessage: async (): Promise<unknown> => undefined,
  },
}));

const [
  { FormDetectionService },
  { FieldAnalyzer },
  { serializeForms },
  { WebsiteContextExtractor },
  { handleFill },
] = await Promise.all([
  import("@/entrypoints/content/lib/form-detection-service"),
  import("@/entrypoints/content/lib/field-analyzer"),
  import("@/entrypoints/content/lib/iframe-handler"),
  import("@/lib/context/website-context-extractor"),
  import("@/entrypoints/content/lib/fill-handler"),
]);

export { handleFill };

export async function detectSerializedFrame(
  html: string,
  frameId: number,
): Promise<DetectedFormSnapshot[]> {
  installDom(html, `https://fixture.test/frame-${frameId}`);
  const service = createService();
  await detectWithService(service);
  return serializeForms(service.getCachedForms(), frameId);
}

export async function detectDocument(html: string): Promise<{
  service: FormDetectionServiceInstance;
  forms: DetectedFormSnapshot[];
  fields: DetectedFieldSnapshot[];
}> {
  installDom(html, "https://fixture.test/form");
  const service = createService();
  const forms = await detectWithService(service);
  return {
    service,
    forms,
    fields: forms.flatMap((form) => form.fields),
  };
}

export async function detectWithService(
  service: FormDetectionServiceInstance,
): Promise<DetectedFormSnapshot[]> {
  const result = await service.detectFormsInCurrentFrame();
  if (!result.success) {
    throw new Error(result.error);
  }
  return result.forms;
}

export function createService(): FormDetectionServiceInstance {
  return new FormDetectionService(
    new FieldAnalyzer(),
    new WebsiteContextExtractor(),
  );
}
