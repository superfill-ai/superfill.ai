import { createLogger } from "@/lib/logger";
import type { CDPDetectedField, CDPFieldFingerprint } from "@/types/autofill";
import { sendCommand } from "./cdp-service";

const logger = createLogger("cdp-field-fingerprint");

interface ResolveNodeResponse {
  object?: { objectId?: string };
}

interface RuntimeEvaluateResponse {
  result?: {
    type?: string;
    subtype?: string;
    value?: unknown;
    objectId?: string;
  };
}

interface DescribeNodeResponse {
  node?: { backendNodeId?: number };
}

interface GetDocumentResponse {
  root?: { nodeId: number };
}

interface QuerySelectorResponse {
  nodeId?: number;
}

function escapeCssIdentifier(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}

function escapeCssAttrValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildFieldFingerprint(
  field: Pick<
    CDPDetectedField,
    | "role"
    | "name"
    | "description"
    | "rect"
    | "frameId"
    | "domMetadata"
    | "backendNodeId"
  >,
): CDPFieldFingerprint {
  const dm = field.domMetadata;
  return {
    role: field.role,
    name: field.name || null,
    description: field.description || null,
    htmlName: dm?.htmlName ?? null,
    htmlId: dm?.htmlId ?? null,
    labelText: dm?.labelText ?? null,
    placeholder: dm?.placeholder ?? null,
    inputType: dm?.inputType ?? null,
    cssSelector: dm?.cssSelector ?? null,
    frameId: field.frameId ?? null,
    rect: field.rect ?? null,
  };
}

async function isBackendNodeResolvable(
  tabId: number,
  backendNodeId: number,
): Promise<boolean> {
  try {
    const resolved = await sendCommand<ResolveNodeResponse>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId },
    );
    return Boolean(resolved?.object?.objectId);
  } catch {
    return false;
  }
}

async function backendNodeIdFromObjectId(
  tabId: number,
  objectId: string,
): Promise<number | null> {
  try {
    const described = await sendCommand<DescribeNodeResponse>(
      tabId,
      "DOM.describeNode",
      { objectId },
    );
    return described?.node?.backendNodeId ?? null;
  } catch {
    return null;
  }
}

async function backendNodeIdFromSelector(
  tabId: number,
  selector: string,
): Promise<number | null> {
  try {
    const documentNode = await sendCommand<GetDocumentResponse>(
      tabId,
      "DOM.getDocument",
      { depth: 1, pierce: true },
    );
    const rootNodeId = documentNode?.root?.nodeId;
    if (!rootNodeId) return null;

    const queryResult = await sendCommand<QuerySelectorResponse>(
      tabId,
      "DOM.querySelector",
      { nodeId: rootNodeId, selector },
    );
    const nodeId = queryResult?.nodeId;
    if (!nodeId) return null;

    const described = await sendCommand<DescribeNodeResponse>(
      tabId,
      "DOM.describeNode",
      { nodeId },
    );
    return described?.node?.backendNodeId ?? null;
  } catch {
    return null;
  }
}

async function backendNodeIdFromRuntimeSearch(
  tabId: number,
  fingerprint: CDPFieldFingerprint,
): Promise<number | null> {
  const expression = `(function() {
    const fp = ${JSON.stringify(fingerprint)};
    const norm = (value) => String(value ?? "").trim().toLowerCase();
    const hasText = (value) => norm(value).length > 0;
    const fpName = norm(fp.name);
    const fpDesc = norm(fp.description);
    const fpHtmlName = norm(fp.htmlName);
    const fpHtmlId = norm(fp.htmlId);
    const fpLabel = norm(fp.labelText);
    const fpPlaceholder = norm(fp.placeholder);
    const fpRole = norm(fp.role);
    const fpInputType = norm(fp.inputType);

    const candidates = new Set();
    const addCandidate = (el) => {
      if (el && el instanceof Element && el.isConnected) {
        candidates.add(el);
      }
    };

    if (hasText(fp.cssSelector)) {
      try {
        addCandidate(document.querySelector(fp.cssSelector));
      } catch {}
    }

    if (hasText(fpHtmlId)) {
      addCandidate(document.getElementById(fp.htmlId));
      try {
        addCandidate(document.querySelector("#" + CSS.escape(fp.htmlId)));
      } catch {}
    }

    if (hasText(fpHtmlName)) {
      try {
        document
          .querySelectorAll("[name=\\"" + CSS.escape(fp.htmlName) + "\\"]")
          .forEach(addCandidate);
      } catch {}
    }

    const selector = [
      "input",
      "textarea",
      "select",
      "[contenteditable=true]",
      "[role=combobox]",
      "[role=listbox]",
      "[role=textbox]",
      "[role=checkbox]",
      "[role=radio]",
      "[role=radiogroup]",
      "[role=spinbutton]",
      "[role=slider]",
      "[role=switch]"
    ].join(",");
    document.querySelectorAll(selector).forEach(addCandidate);

    const cleanText = (value) => {
      const v = norm(value);
      return v.length <= 300 ? v : v.slice(0, 300);
    };

    const getLabelText = (el) => {
      if (!el) return "";
      const parts = [];
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        if (el.labels && el.labels.length > 0) {
          parts.push(...Array.from(el.labels).map((label) => label.textContent || ""));
        }
      }
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel) parts.push(ariaLabel);
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        labelledBy.split(/\\s+/).forEach((id) => {
          const labelEl = document.getElementById(id);
          if (labelEl) parts.push(labelEl.textContent || "");
        });
      }
      const parentLabel = el.closest("label");
      if (parentLabel) parts.push(parentLabel.textContent || "");
      return cleanText(parts.join(" "));
    };

    const textMatchScore = (candidateText, expectedText, weight) => {
      if (!expectedText || !candidateText) return 0;
      if (candidateText === expectedText) return weight;
      if (candidateText.includes(expectedText) || expectedText.includes(candidateText)) {
        return Math.max(1, Math.floor(weight / 2));
      }
      return 0;
    };

    let best = null;
    let bestScore = -1;

    for (const el of candidates) {
      const rect = el.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) continue;

      let score = 0;
      const tagName = norm(el.tagName);
      const role = norm(el.getAttribute("role"));
      const id = norm(el.getAttribute("id"));
      const name = norm(el.getAttribute("name"));
      const placeholder = norm(el.getAttribute("placeholder"));
      const type = norm(el.getAttribute("type"));
      const labelText = getLabelText(el);
      const title = norm(el.getAttribute("title"));
      const combinedText = cleanText(
        [labelText, placeholder, title, el.textContent || ""].join(" "),
      );

      score += textMatchScore(id, fpHtmlId, 8);
      score += textMatchScore(name, fpHtmlName, 7);
      score += textMatchScore(placeholder, fpPlaceholder, 4);
      score += textMatchScore(labelText, fpLabel, 7);
      score += textMatchScore(combinedText, fpName, 5);
      score += textMatchScore(combinedText, fpDesc, 3);

      if (fpRole && (role === fpRole || tagName === fpRole)) score += 4;
      if (fpInputType && type === fpInputType) score += 3;

      if (fp.rect && Number.isFinite(fp.rect.x) && Number.isFinite(fp.rect.y)) {
        const dx = Math.abs(rect.x - fp.rect.x);
        const dy = Math.abs(rect.y - fp.rect.y);
        const dw = Math.abs(rect.width - fp.rect.width);
        const dh = Math.abs(rect.height - fp.rect.height);
        if (dx < 30 && dy < 30 && dw < 40 && dh < 40) score += 6;
        else if (dx < 120 && dy < 120) score += 2;
      }

      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }

    if (!best || bestScore < 4) return null;
    return best;
  })()`;

  try {
    const evaluation = await sendCommand<RuntimeEvaluateResponse>(
      tabId,
      "Runtime.evaluate",
      {
        expression,
        returnByValue: false,
      },
    );
    const objectId = evaluation?.result?.objectId;
    if (!objectId) return null;
    return await backendNodeIdFromObjectId(tabId, objectId);
  } catch {
    return null;
  }
}

export async function recoverBackendNodeIdFromFingerprint(
  tabId: number,
  fingerprint: CDPFieldFingerprint,
): Promise<number | null> {
  if (fingerprint.cssSelector) {
    const byCssSelector = await backendNodeIdFromSelector(
      tabId,
      fingerprint.cssSelector,
    );
    if (byCssSelector) return byCssSelector;
  }

  if (fingerprint.htmlId) {
    const byId = await backendNodeIdFromSelector(
      tabId,
      `#${escapeCssIdentifier(fingerprint.htmlId)}`,
    );
    if (byId) return byId;
  }

  if (fingerprint.htmlName) {
    const byName = await backendNodeIdFromSelector(
      tabId,
      `[name="${escapeCssAttrValue(fingerprint.htmlName)}"]`,
    );
    if (byName) return byName;
  }

  return await backendNodeIdFromRuntimeSearch(tabId, fingerprint);
}

export async function resolveFieldBackendNodeId(
  tabId: number,
  field: Pick<CDPDetectedField, "backendNodeId" | "fingerprint" | "opid">,
  allowRecovery = true,
): Promise<number | null> {
  if (await isBackendNodeResolvable(tabId, field.backendNodeId)) {
    return field.backendNodeId;
  }

  if (!allowRecovery || !field.fingerprint) {
    logger.warn(`Could not resolve stale backendNodeId for ${field.opid}`);
    return null;
  }

  const recovered = await recoverBackendNodeIdFromFingerprint(
    tabId,
    field.fingerprint,
  );
  if (!recovered) {
    logger.warn(`Failed to recover backendNodeId for ${field.opid}`);
    return null;
  }

  logger.info(
    `Recovered backendNodeId for ${field.opid}: ${field.backendNodeId} -> ${recovered}`,
  );
  return recovered;
}
