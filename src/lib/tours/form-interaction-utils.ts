import type { FormDetectionService } from "@/entrypoints/content/lib/form-detection-service";
import { createLogger } from "@/lib/logger";
import { storage } from "@/lib/storage";

const logger = createLogger("tours:form-interaction-utils");

export interface FormInteractionEligibilityParams {
  frameIsMainFrame: boolean;
  target: HTMLElement | null;
  formDetectionService: FormDetectionService;
  isElementPartOfForm: (el: HTMLElement) => boolean;
  isLoginOrSmallForm: (el: HTMLElement) => boolean;
  isMessagingSite: (hostname: string, pathname: string) => boolean;
  managerVisible?: boolean;
  logger?: ReturnType<typeof createLogger>;
}

export async function ensureFormsDetected(
  formDetectionService: FormDetectionService,
  loggerParam?: ReturnType<typeof createLogger>,
): Promise<boolean> {
  const log = loggerParam ?? logger;

  if (formDetectionService.hasCachedForms()) return true;

  try {
    await formDetectionService.detectFormsInCurrentFrame();
  } catch (error) {
    log.error("Error detecting forms:", error);
    return false;
  }

  return formDetectionService.hasCachedForms();
}

export async function isFormInteractionEligible({
  frameIsMainFrame,
  target,
  formDetectionService,
  isElementPartOfForm,
  isLoginOrSmallForm,
  isMessagingSite,
  managerVisible = false,
  logger: loggerParam,
}: FormInteractionEligibilityParams): Promise<boolean> {
  const log = loggerParam ?? logger;

  if (!frameIsMainFrame) return false;
  if (!target) return false;

  const isFormField =
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement;

  if (!isFormField) return false;

  const formsReady = await ensureFormsDetected(formDetectionService, log);
  if (!formsReady) return false;

  try {
    const aiSettings = await storage.aiSettings.getValue();
    if (!aiSettings.contextMenuEnabled) return false;
  } catch (error) {
    log.error("Error checking AI settings:", error);
    return false;
  }

  const hostname = window.location.hostname;
  const pathname = window.location.pathname;

  if (isMessagingSite(hostname, pathname)) return false;
  if (managerVisible) return false;

  if (!isElementPartOfForm(target)) return false;

  if (isLoginOrSmallForm(target)) {
    log.info("Skipping form interaction - likely login/small auth form");
    return false;
  }

  return true;
}
