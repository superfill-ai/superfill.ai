import { createLogger } from "@/lib/logger";
import type {
  CDPDetectedField,
  CDPDOMMetadata,
  CDPFieldOption,
  CDPFieldRole,
  CDPRadioOption,
  CDPRect,
} from "@/types/autofill";
import { buildFieldFingerprint } from "./cdp-field-fingerprint";
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

const ROW_THRESHOLD_PX = 10;

interface AXNode {
  nodeId: string;
  backendDOMNodeId?: number;
  frameId?: string;
  role?: { type: string; value: string };
  name?: { type: string; value: string; sources?: unknown[] };
  description?: { type: string; value: string };
  value?: { type: string; value: string | number | boolean };
  properties?: AXProperty[];
  childIds?: string[];
  parentId?: string;
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
  const orphanRadios: AXNode[] = [];

  for (const node of axTree.nodes) {
    if (node.ignored) continue;

    const role = node.role?.value;
    if (!role || !INTERACTIVE_ROLES.has(role)) continue;

    const disabled = getPropertyBool(node, "disabled");
    if (disabled) continue;

    if (role === "radio") {
      if (!hasRadioGroupParent(node, nodeMap)) {
        orphanRadios.push(node);
      }
      continue;
    }

    if (role === "radiogroup") {
      const field = await buildRadioGroupField(tabId, node, nodeMap);
      if (field) fields.push(field);
      continue;
    }

    const field = await buildField(tabId, node, role);
    if (field) fields.push(field);
  }

  if (orphanRadios.length > 0) {
    const grouped = await groupOrphanRadios(tabId, orphanRadios, nodeMap);
    fields.push(...grouped);
  }

  const enrichedFields = await enrichAllFields(tabId, fields);
  for (const field of enrichedFields) {
    field.fingerprint = buildFieldFingerprint(field);
  }

  const visibleFields = enrichedFields.filter((f) => {
    if (f.domMetadata && !f.domMetadata.isVisible) return false;
    if (f.domMetadata && !f.domMetadata.isTopElement) return false;
    if (f.domMetadata?.inputType === "password") return false;
    if (f.domMetadata?.inputType === "hidden") return false;
    return true;
  });

  visibleFields.sort((a, b) => {
    const yDiff = a.rect.y - b.rect.y;
    if (Math.abs(yDiff) < ROW_THRESHOLD_PX) {
      return a.rect.x - b.rect.x;
    }
    return yDiff;
  });

  for (let i = 0; i < visibleFields.length; i++) {
    visibleFields[i].highlightIndex = i;
  }

  logger.info(
    `Detected ${visibleFields.length} interactive fields via AX tree (from ${fields.length} raw)`,
  );
  return visibleFields;
}

function hasRadioGroupParent(
  node: AXNode,
  nodeMap: Map<string, AXNode>,
): boolean {
  if (!node.parentId) return false;
  const parent = nodeMap.get(node.parentId);
  return parent?.role?.value === "radiogroup";
}

async function groupOrphanRadios(
  tabId: number,
  radios: AXNode[],
  nodeMap: Map<string, AXNode>,
): Promise<CDPDetectedField[]> {
  const nameGroups = new Map<string, AXNode[]>();

  for (const radio of radios) {
    if (!radio.backendDOMNodeId) continue;
    const htmlName = await getNodeAttribute(
      tabId,
      radio.backendDOMNodeId,
      "name",
    );
    const frameKey = radio.frameId || "main";
    const key = `${frameKey}::${htmlName || `__unnamed_${radio.nodeId}`}`;
    const group = nameGroups.get(key) ?? [];
    group.push(radio);
    nameGroups.set(key, group);
  }

  const fields: CDPDetectedField[] = [];
  for (const [, group] of nameGroups) {
    if (group.length < 2) continue;
    const field = await buildOrphanRadioGroup(tabId, group, nodeMap);
    if (field) fields.push(field);
  }
  return fields;
}

async function getNodeAttribute(
  tabId: number,
  backendNodeId: number,
  attr: string,
): Promise<string | null> {
  try {
    const resolved = await sendCommand<{ object: { objectId: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId },
    );
    if (!resolved?.object?.objectId) return null;

    const result = await sendCommand<{
      result: { type: string; value: string };
    }>(tabId, "Runtime.callFunctionOn", {
      objectId: resolved.object.objectId,
      functionDeclaration: `function(a) { return this.getAttribute(a) || ''; }`,
      arguments: [{ value: attr }],
      returnByValue: true,
    });
    return result?.result?.value || null;
  } catch {
    return null;
  }
}

async function buildOrphanRadioGroup(
  tabId: number,
  radioNodes: AXNode[],
  _nodeMap: Map<string, AXNode>,
): Promise<CDPDetectedField | null> {
  const radioOptions: CDPRadioOption[] = [];
  let groupRect: CDPRect | null = null;
  let selectedValue = "";

  for (const child of radioNodes) {
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
      expandRect(groupRect, childRect);
    }
  }

  if (radioOptions.length === 0) return null;

  const groupName = radioNodes.find((n) => n.name?.value)?.name?.value ?? "";

  const firstNodeId =
    radioNodes[0].backendDOMNodeId ?? radioOptions[0].backendNodeId;

  return {
    opid: `cdp-orphan-rg-${firstNodeId}`,
    highlightIndex: 0,
    backendNodeId: firstNodeId,
    frameId: radioNodes[0]?.frameId,
    role: "radiogroup",
    name: String(groupName),
    description: "",
    value: selectedValue,
    required: radioNodes.some((n) => getPropertyBool(n, "required")),
    disabled: false,
    options: radioOptions.map((r) => ({ value: r.value, label: r.label })),
    rect: groupRect ?? { x: 0, y: 0, width: 0, height: 0 },
    radioOptions,
  };
}

async function buildField(
  tabId: number,
  node: AXNode,
  role: string,
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
    highlightIndex: 0,
    backendNodeId,
    frameId: node.frameId,
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
      expandRect(groupRect, childRect);
    }
  }

  if (radioOptions.length === 0) return null;

  const options: CDPFieldOption[] = radioOptions.map((r) => ({
    value: r.value,
    label: r.label,
  }));

  return {
    opid: backendNodeId ? `cdp-${backendNodeId}` : `cdp-rg-${groupNode.nodeId}`,
    highlightIndex: 0,
    backendNodeId: backendNodeId ?? radioOptions[0].backendNodeId,
    frameId: groupNode.frameId,
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

function expandRect(target: CDPRect, source: CDPRect): void {
  const right = Math.max(target.x + target.width, source.x + source.width);
  const bottom = Math.max(target.y + target.height, source.y + source.height);
  target.x = Math.min(target.x, source.x);
  target.y = Math.min(target.y, source.y);
  target.width = right - target.x;
  target.height = bottom - target.y;
}

async function enrichAllFields(
  tabId: number,
  fields: CDPDetectedField[],
): Promise<CDPDetectedField[]> {
  const enriched: CDPDetectedField[] = [];

  for (const field of fields) {
    const meta = await enrichFieldFromDOM(tabId, field.backendNodeId);
    if (meta) {
      field.domMetadata = meta;

      if (meta.placeholder && !field.name) {
        field.name = meta.placeholder;
      }
    }

    if (field.role === "radiogroup" && field.radioOptions?.length) {
      const groupLabel = await findRadioGroupLabel(
        tabId,
        field.radioOptions[0].backendNodeId,
      );
      if (groupLabel) {
        field.name = groupLabel;
        if (field.domMetadata) field.domMetadata.labelText = groupLabel;
      }
    }

    enriched.push(field);
  }

  return enriched;
}

async function findRadioGroupLabel(
  tabId: number,
  firstRadioNodeId: number,
): Promise<string | null> {
  try {
    const resolved = await sendCommand<{ object: { objectId: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId: firstRadioNodeId },
    );
    if (!resolved?.object?.objectId) return null;

    const result = await sendCommand<{
      result: { type: string; value: string };
    }>(tabId, "Runtime.callFunctionOn", {
      objectId: resolved.object.objectId,
      functionDeclaration: `function() {
        const el = this;
        const cleanText = (s) => {
          if (!s) return null;
          const c = s.replace(/[\\n\\r\\t]+/g, ' ').replace(/\\s+/g, ' ').trim();
          return (c.length > 2 && c.length < 200) ? c : null;
        };

        // Check fieldset/legend pattern
        const fieldset = el.closest('fieldset');
        if (fieldset) {
          const legend = fieldset.querySelector('legend');
          if (legend) return cleanText(legend.textContent);
        }

        // Check [role="group"]/[role="radiogroup"] with aria-label/aria-labelledby
        const group = el.closest('[role="group"], [role="radiogroup"]');
        if (group) {
          const ariaLabel = group.getAttribute('aria-label');
          if (ariaLabel) return cleanText(ariaLabel);
          const lblId = group.getAttribute('aria-labelledby');
          if (lblId) {
            const lblEl = document.getElementById(lblId);
            if (lblEl) return cleanText(lblEl.textContent);
          }
        }

        // Walk up to find a label/question container above the radio group
        let container = el.parentElement;
        let depth = 0;
        while (container && depth < 6) {
          const hasMultipleRadios = container.querySelectorAll('input[type="radio"]').length > 1;
          if (hasMultipleRadios) {
            const candidates = container.querySelectorAll(
              'label, legend, [class*="label"], [class*="question"], [class*="title"], [class*="heading"]'
            );
            for (const c of candidates) {
              if (c.querySelector('input[type="radio"]')) continue;
              const txt = cleanText(c.textContent);
              if (txt) return txt;
            }
            // Also check text above the radios via previous siblings
            let prev = container.previousElementSibling;
            let sibDepth = 0;
            while (prev && sibDepth < 3) {
              const txt = cleanText(prev.textContent);
              if (txt) return txt;
              prev = prev.previousElementSibling;
              sibDepth++;
            }
          }
          container = container.parentElement;
          depth++;
        }
        return null;
      }`,
      returnByValue: true,
    });

    return (result?.result?.value as string) || null;
  } catch {
    return null;
  }
}

async function enrichFieldFromDOM(
  tabId: number,
  backendNodeId: number,
): Promise<CDPDOMMetadata | null> {
  try {
    const resolved = await sendCommand<{ object: { objectId: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId },
    );

    if (!resolved?.object?.objectId) return null;

    const result = await sendCommand<{
      result: { type: string; value: string };
    }>(tabId, "Runtime.callFunctionOn", {
      objectId: resolved.object.objectId,
      functionDeclaration: `function() {
        const el = this;
        const style = window.getComputedStyle(el);
        const isVisible = !!(
          el.offsetWidth > 0 &&
          el.offsetHeight > 0 &&
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          style.opacity !== '0' &&
          !el.closest('[aria-hidden="true"]')
        );

        let isTopElement = true;
        if (isVisible) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            const inViewport = cy >= 0 && cy <= window.innerHeight && cx >= 0 && cx <= window.innerWidth;
            if (inViewport) {
              try {
                const topEl = document.elementFromPoint(cx, cy);
                if (topEl) {
                  let current = topEl;
                  let found = false;
                  while (current) {
                    if (current === el) { found = true; break; }
                    current = current.parentElement;
                  }
                  isTopElement = found;
                }
              } catch (e) {}
            }
          }
        }

        const isShadowHost = !!el.getRootNode()?.host;

        const cleanText = (s) => {
          if (!s) return null;
          const c = s.replace(/[\\n\\r\\t]+/g, ' ').replace(/\\s+/g, ' ').trim();
          return (c.length > 0 && c.length < 200) ? c : null;
        };

        // 1. Explicit label: el.labels API, label[for], or closest parent label
        let labelText = null;
        if (el.labels && el.labels.length > 0) {
          labelText = cleanText(el.labels[0].textContent);
        } else if (el.id) {
          const lbl = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
          if (lbl) labelText = cleanText(lbl.textContent);
        }
        if (!labelText) {
          const parentLabel = el.closest('label');
          if (parentLabel) {
            const clone = parentLabel.cloneNode(true);
            clone.querySelectorAll('input, select, textarea').forEach(n => n.remove());
            labelText = cleanText(clone.textContent);
          }
        }

        // 2. aria-label / aria-labelledby
        if (!labelText) {
          const ariaLabel = el.getAttribute('aria-label');
          if (ariaLabel) {
            labelText = cleanText(ariaLabel);
          } else {
            const ariaLabelledBy = el.getAttribute('aria-labelledby');
            if (ariaLabelledBy) {
              const parts = ariaLabelledBy.split(/\\s+/)
                .map(id => document.getElementById(id)?.textContent?.trim())
                .filter(Boolean);
              if (parts.length > 0) labelText = cleanText(parts.join(' '));
            }
          }
        }

        // 3. Contextual label: walk up DOM looking for label/legend/question text
        //    in a nearby container (handles Lever-style forms, schema-generated forms)
        if (!labelText) {
          let container = el.parentElement;
          let depth = 0;
          while (container && depth < 5) {
            const candidates = container.querySelectorAll(
              'label, legend, [class*="label"], [class*="question"], [class*="title"], [class*="heading"]'
            );
            for (const c of candidates) {
              if (c === el || c.contains(el)) continue;
              if (c.querySelector('input, select, textarea')) continue;
              const txt = cleanText(c.textContent);
              if (txt && txt.length > 2) {
                labelText = txt;
                break;
              }
            }
            if (labelText) break;
            container = container.parentElement;
            depth++;
          }
        }

        // 4. Positional label: find nearest text above the field (like non-CDP method)
        if (!labelText) {
          const rect = el.getBoundingClientRect();
          let bestText = null;
          let bestDist = 120;
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
              const t = node.textContent?.trim();
              if (!t || t.length < 3 || t.length > 200) return NodeFilter.FILTER_REJECT;
              const p = node.parentElement;
              if (!p) return NodeFilter.FILTER_REJECT;
              const tag = p.tagName.toLowerCase();
              if (['script','style','noscript','input','textarea','select','button','option'].includes(tag))
                return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          });
          let n = walker.nextNode();
          let checked = 0;
          while (n && checked < 200) {
            checked++;
            const p = n.parentElement;
            if (p) {
              const pr = p.getBoundingClientRect();
              if (pr.bottom <= rect.top && (rect.top - pr.bottom) < bestDist) {
                const hOverlap = Math.min(rect.right, pr.right) > Math.max(rect.left, pr.left);
                const hDist = Math.min(Math.abs(rect.left - pr.right), Math.abs(pr.left - rect.right));
                if (hOverlap || hDist < 50) {
                  bestDist = rect.top - pr.bottom;
                  bestText = cleanText(p.textContent);
                }
              }
            }
            n = walker.nextNode();
          }
          if (bestText) labelText = bestText;
        }

        let ariaDescText = null;
        const describedBy = el.getAttribute('aria-describedby');
        if (describedBy) {
          const parts = describedBy.split(/\\s+/)
            .map(id => document.getElementById(id)?.textContent?.trim())
            .filter(Boolean);
          if (parts.length > 0) ariaDescText = parts.join(' ');
        }

        let helperText = null;
        const parent = el.parentElement;
        if (parent) {
          const helper = parent.querySelector(
            '[class*="help"], [class*="hint"], [class*="description"], [class*="error"], [class*="caption"]'
          );
          if (helper && helper !== el) {
            helperText = cleanText(helper.textContent);
          }
        }

        const form = el.closest('form');
        const ml = el.maxLength;

        // Build a unique CSS selector for highlight from content script
        let cssSelector = null;
        if (el.id) {
          cssSelector = '#' + CSS.escape(el.id);
        } else {
          const parts = [];
          let cur = el;
          while (cur && cur !== document.body && parts.length < 6) {
            let seg = cur.tagName.toLowerCase();
            if (cur.id) {
              parts.unshift('#' + CSS.escape(cur.id));
              break;
            }
            const p = cur.parentElement;
            if (p) {
              const siblings = Array.from(p.children).filter(c => c.tagName === cur.tagName);
              if (siblings.length > 1) {
                seg += ':nth-of-type(' + (siblings.indexOf(cur) + 1) + ')';
              }
            }
            parts.unshift(seg);
            cur = cur.parentElement;
          }
          if (parts.length > 0) cssSelector = parts.join(' > ');
        }

        return JSON.stringify({
          tagName: el.tagName.toLowerCase(),
          inputType: el.type || null,
          placeholder: el.placeholder || el.getAttribute('placeholder') || null,
          autocomplete: el.getAttribute('autocomplete') || null,
          htmlName: el.getAttribute('name') || null,
          htmlId: el.id || null,
          labelText: labelText || null,
          ariaDescribedByText: ariaDescText,
          helperText: helperText,
          maxLength: (ml && ml > 0 && ml < 524288) ? ml : null,
          formAction: form ? (form.action || null) : null,
          formName: form ? (form.getAttribute('name') || form.id || null) : null,
          isVisible: isVisible,
          isTopElement: isTopElement,
          isContentEditable: el.isContentEditable || false,
          isShadowHost: isShadowHost,
          cssSelector: cssSelector
        });
      }`,
      returnByValue: true,
    });

    if (result?.result?.value) {
      return JSON.parse(result.result.value as string) as CDPDOMMetadata;
    }
    return null;
  } catch {
    return null;
  }
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
    const resolved = await sendCommand<{ object: { objectId: string } }>(
      tabId,
      "DOM.resolveNode",
      { backendNodeId },
    );

    if (!resolved?.object?.objectId) return [];

    const evalResult = await sendCommand<{
      result: { type: string; value: string };
    }>(tabId, "Runtime.callFunctionOn", {
      objectId: resolved.object.objectId,
      functionDeclaration: `function() {
        const el = this;

        if (el.tagName === 'SELECT') {
          return JSON.stringify(
            Array.from(el.options).map(o => ({ value: o.value, label: o.textContent.trim() }))
          );
        }

        if (el.list) {
          return JSON.stringify(
            Array.from(el.list.options).map(o => ({ value: o.value, label: o.label || o.textContent.trim() }))
          );
        }

        const listboxId = el.getAttribute('aria-owns') || el.getAttribute('aria-controls');
        if (listboxId) {
          for (const id of listboxId.split(/\\s+/)) {
            const listbox = document.getElementById(id);
            if (listbox) {
              const opts = listbox.querySelectorAll('[role="option"], li[data-value], li');
              if (opts.length > 0 && opts.length < 200) {
                return JSON.stringify(
                  Array.from(opts).map(o => ({
                    value: o.getAttribute('data-value') || o.getAttribute('value') || o.textContent.trim(),
                    label: o.textContent.trim()
                  }))
                );
              }
            }
          }
        }

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
      const options = JSON.parse(evalResult.result.value as string);
      if (options.length > 0) return options;
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
  if (
    prop.value.type === "tristate" ||
    prop.value.type === "booleanOrUndefined"
  ) {
    return prop.value.value === "true" || prop.value.value === true;
  }
  return prop.value.value === true || prop.value.value === "true";
}
