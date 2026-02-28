import { createLogger } from "@/lib/logger";
import type {
  CDPDetectedField,
  CDPFieldOption,
  CDPFieldRole,
  CDPRadioOption,
  CDPRect,
} from "@/types/autofill";
import { sendCommand } from "./cdp-service";

const logger = createLogger("cdp-form-detector");

const INTERACTIVE_ROLES = new Set<string>([
  "textbox",
  "searchbox",
  "combobox",
  "listbox",
  "checkbox",
  "radio",
  "radiogroup",
  "spinbutton",
  "slider",
  "switch",
  "menuitemcheckbox",
  "menuitemradio",
  "textarea",
]);

interface AXNode {
  nodeId: string;
  backendDOMNodeId?: number;
  role?: { type: string; value: string };
  name?: { type: string; value: string; sources?: unknown[] };
  description?: { type: string; value: string };
  value?: { type: string; value: string | number | boolean };
  properties?: AXProperty[];
  childIds?: string[];
  ignored?: boolean;
}

interface AXProperty {
  name: string;
  value: { type: string; value: string | number | boolean };
}

interface AXTreeResponse {
  nodes: AXNode[];
}

interface BoxModelResponse {
  model: {
    content: number[];
    padding: number[];
    border: number[];
    margin: number[];
    width: number;
    height: number;
  };
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

export async function detectFormFields(
  tabId: number,
): Promise<CDPDetectedField[]> {
  let axTree: AXTreeResponse | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    axTree = await sendCommand<AXTreeResponse>(
      tabId,
      "Accessibility.getFullAXTree",
    );

    if (axTree?.nodes?.length > 0) break;

    logger.warn(
      `AX tree empty on attempt ${attempt + 1}, retrying in ${RETRY_DELAY_MS}ms`,
    );
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }

  if (!axTree?.nodes?.length) {
    logger.error("Failed to get AX tree after retries");
    return [];
  }

  logger.info(`AX tree has ${axTree.nodes.length} nodes`);

  const nodeMap = new Map<string, AXNode>();
  for (const node of axTree.nodes) {
    nodeMap.set(node.nodeId, node);
  }

  const fields: CDPDetectedField[] = [];
  let highlightIndex = 0;

  for (const node of axTree.nodes) {
    if (node.ignored) continue;

    const role = node.role?.value;
    if (!role || !INTERACTIVE_ROLES.has(role)) continue;

    const disabled = getPropertyBool(node, "disabled");
    if (disabled) continue;

    // Skip individual radio buttons — they'll be grouped under radiogroup
    if (role === "radio") continue;

    if (role === "radiogroup") {
      const field = await buildRadioGroupField(
        tabId,
        node,
        nodeMap,
        highlightIndex,
      );
      if (field) {
        fields.push(field);
        highlightIndex++;
      }
      continue;
    }

    const field = await buildField(tabId, node, role, highlightIndex);
    if (field) {
      fields.push(field);
      highlightIndex++;
    }
  }

  logger.info(`Detected ${fields.length} interactive fields via AX tree`);
  return fields;
}

async function buildField(
  tabId: number,
  node: AXNode,
  role: string,
  highlightIndex: number,
): Promise<CDPDetectedField | null> {
  const backendNodeId = node.backendDOMNodeId;
  if (!backendNodeId) return null;

  const rect = await getNodeRect(tabId, backendNodeId);
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;

  const name = node.name?.value ?? "";
  const description = node.description?.value ?? "";
  const value = String(node.value?.value ?? "");
  const required = getPropertyBool(node, "required");
  const checked = getPropertyBool(node, "checked");

  const field: CDPDetectedField = {
    opid: `cdp-${backendNodeId}`,
    highlightIndex,
    backendNodeId,
    role: role as CDPFieldRole,
    name: typeof name === "string" ? name : "",
    description: typeof description === "string" ? description : "",
    value,
    required,
    disabled: false,
    rect,
  };

  if (role === "checkbox" || role === "switch" || role === "menuitemcheckbox") {
    field.checked = checked;
  }

  if (role === "combobox" || role === "listbox") {
    field.options = await extractOptions(tabId, backendNodeId);
  }

  return field;
}

async function buildRadioGroupField(
  tabId: number,
  groupNode: AXNode,
  nodeMap: Map<string, AXNode>,
  highlightIndex: number,
): Promise<CDPDetectedField | null> {
  const backendNodeId = groupNode.backendDOMNodeId;
  const childIds = groupNode.childIds ?? [];

  if (childIds.length === 0) return null;

  const radioOptions: CDPRadioOption[] = [];
  let groupRect: CDPRect | null = null;
  let selectedValue = "";

  for (const childId of childIds) {
    const child = nodeMap.get(childId);
    if (!child || child.role?.value !== "radio") continue;
    if (!child.backendDOMNodeId) continue;

    const childRect = await getNodeRect(tabId, child.backendDOMNodeId);
    if (!childRect) continue;

    const checked = getPropertyBool(child, "checked");
    const label = String(child.name?.value ?? "");
    const value = await getRadioValue(tabId, child.backendDOMNodeId, label);

    if (checked) selectedValue = value;

    radioOptions.push({
      backendNodeId: child.backendDOMNodeId,
      label,
      value,
      checked,
      rect: childRect,
    });

    if (!groupRect) {
      groupRect = { ...childRect };
    } else {
      const right = Math.max(
        groupRect.x + groupRect.width,
        childRect.x + childRect.width,
      );
      const bottom = Math.max(
        groupRect.y + groupRect.height,
        childRect.y + childRect.height,
      );
      groupRect.x = Math.min(groupRect.x, childRect.x);
      groupRect.y = Math.min(groupRect.y, childRect.y);
      groupRect.width = right - groupRect.x;
      groupRect.height = bottom - groupRect.y;
    }
  }

  if (radioOptions.length === 0) return null;

  const options: CDPFieldOption[] = radioOptions.map((r) => ({
    value: r.value,
    label: r.label,
  }));

  return {
    opid: backendNodeId ? `cdp-${backendNodeId}` : `cdp-rg-${highlightIndex}`,
    highlightIndex,
    backendNodeId: backendNodeId ?? radioOptions[0].backendNodeId,
    role: "radiogroup",
    name: String(groupNode.name?.value ?? ""),
    description: String(groupNode.description?.value ?? ""),
    value: selectedValue,
    required: getPropertyBool(groupNode, "required"),
    disabled: false,
    options,
    rect: groupRect ?? { x: 0, y: 0, width: 0, height: 0 },
    radioOptions,
  };
}

async function getNodeRect(
  tabId: number,
  backendNodeId: number,
): Promise<CDPRect | null> {
  try {
    const result = await sendCommand<BoxModelResponse>(
      tabId,
      "DOM.getBoxModel",
      {
        backendNodeId,
      },
    );

    if (!result?.model) return null;

    const quad = result.model.border;
    const x = Math.min(quad[0], quad[2], quad[4], quad[6]);
    const y = Math.min(quad[1], quad[3], quad[5], quad[7]);
    const maxX = Math.max(quad[0], quad[2], quad[4], quad[6]);
    const maxY = Math.max(quad[1], quad[3], quad[5], quad[7]);

    return { x, y, width: maxX - x, height: maxY - y };
  } catch {
    return null;
  }
}

async function extractOptions(
  tabId: number,
  backendNodeId: number,
): Promise<CDPFieldOption[]> {
  try {
    const result = await sendCommand<{ object: { objectId: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId },
    );

    if (!result?.object?.objectId) return [];

    const evalResult = await sendCommand<{
      result: { type: string; value: string };
    }>(tabId, "Runtime.callFunctionOn", {
      objectId: result.object.objectId,
      functionDeclaration: `function() {
        const el = this;
        if (el.tagName === 'SELECT') {
          return JSON.stringify(
            Array.from(el.options).map(o => ({ value: o.value, label: o.textContent.trim() }))
          );
        }
        // For ARIA listbox, find option children
        const opts = el.querySelectorAll('[role="option"]');
        if (opts.length > 0) {
          return JSON.stringify(
            Array.from(opts).map(o => ({
              value: o.getAttribute('data-value') || o.textContent.trim(),
              label: o.textContent.trim()
            }))
          );
        }
        return '[]';
      }`,
      returnByValue: true,
    });

    if (evalResult?.result?.value) {
      return JSON.parse(evalResult.result.value as string);
    }
    return [];
  } catch {
    return [];
  }
}

async function getRadioValue(
  tabId: number,
  backendNodeId: number,
  fallbackLabel: string,
): Promise<string> {
  try {
    const result = await sendCommand<{ object: { objectId: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId },
    );

    if (!result?.object?.objectId) return fallbackLabel;

    const evalResult = await sendCommand<{
      result: { type: string; value: string };
    }>(tabId, "Runtime.callFunctionOn", {
      objectId: result.object.objectId,
      functionDeclaration: "function() { return this.value || ''; }",
      returnByValue: true,
    });

    return (evalResult?.result?.value as string) || fallbackLabel;
  } catch {
    return fallbackLabel;
  }
}

function getPropertyBool(node: AXNode, propName: string): boolean {
  const prop = node.properties?.find((p) => p.name === propName);
  if (!prop) return false;
  // "checked" can be "true", "false", or "mixed" as string in AX tree
  if (
    prop.value.type === "tristate" ||
    prop.value.type === "booleanOrUndefined"
  ) {
    return prop.value.value === "true" || prop.value.value === true;
  }
  return prop.value.value === true || prop.value.value === "true";
}
