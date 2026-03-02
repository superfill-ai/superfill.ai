import { generateObject, type UserContent } from "ai";
import { z } from "zod";
import { delay } from "@/lib/delay";
import { createLogger, DEBUG } from "@/lib/logger";
import { getAIModel } from "@/lib/providers/model-factory";
import type { AIProvider } from "@/lib/providers/registry";
import type {
  CDPAgentAction,
  CDPAgentConfig,
  CDPAgentProgress,
  CDPAgentResult,
  CDPAgentStep,
  CDPInteractiveElement,
  CDPPageState,
} from "@/types/cdp";
import type { MemoryEntry } from "@/types/memory";
import { executeAction } from "../cdp/cdp-action-executor";
import type { CDPConnection } from "../cdp/cdp-connection";
import { extractInteractiveElements } from "../cdp/cdp-dom-extractor";
import {
  captureAnnotatedScreenshot,
  captureScreenshot,
} from "../cdp/cdp-screenshot";
import {
  createRunId,
  saveScreenshotLocally,
} from "../cdp/cdp-screenshot-saver";

const logger = createLogger("cdp-agent");

/** Zod schema for the AI agent's action response */
const CDPAgentActionSchema = z.object({
  action: z.enum([
    "click",
    "type",
    "select_option",
    "scroll",
    "key_press",
    "wait",
    "done",
    "go_back",
    "tab",
  ]),
  // Common optional fields — we normalize/validate after parsing
  index: z.number().optional(),
  doubleClick: z.boolean().optional(),
  text: z.string().optional(),
  clearFirst: z.boolean().optional(),
  value: z.string().optional(),
  direction: z.enum(["up", "down"]).optional(),
  amount: z.number().optional(),
  key: z.string().optional(),
  duration: z.number().max(3000).optional(),
  summary: z.string().optional(),
  reasoning: z.string().optional(),
  count: z.number().optional(),
  shift: z.boolean().optional(),
});

/**
 * The AI-driven agent loop that controls form filling through CDP.
 * Each iteration: capture state → AI decides action → execute action → repeat.
 */
export class CDPAgent {
  private connection: CDPConnection;
  private config: CDPAgentConfig;
  private memories: MemoryEntry[];
  private provider: AIProvider;
  private apiKey: string;
  private modelName?: string;
  private steps: CDPAgentStep[] = [];
  private allowedAnswers: string[];
  private aborted = false;
  private onProgress?: (progress: CDPAgentProgress) => void;
  private task: string;
  private runId: string;

  constructor(params: {
    connection: CDPConnection;
    config: CDPAgentConfig;
    memories: MemoryEntry[];
    provider: AIProvider;
    apiKey: string;
    modelName?: string;
    task: string;
    onProgress?: (progress: CDPAgentProgress) => void;
  }) {
    this.connection = params.connection;
    this.config = params.config;
    this.memories = params.memories;
    this.provider = params.provider;
    this.apiKey = params.apiKey;
    this.modelName = params.modelName;
    this.task = params.task;
    this.onProgress = params.onProgress;
    this.runId = createRunId();
    this.allowedAnswers = params.memories
      .map((m) => m.answer.trim())
      .filter((answer) => answer.length > 0);
    logger.info(`Agent run initialized with ID: ${this.runId}`);
  }

  abort(): void {
    this.aborted = true;
    logger.info("Agent abort requested");
  }

  async run(): Promise<CDPAgentResult> {
    const startTime = performance.now();
    let summary = "";

    try {
      for (let step = 0; step < this.config.maxSteps; step++) {
        if (this.aborted) {
          return this.buildResult(startTime, false, "Agent was aborted");
        }

        // 1. Capture current page state
        this.emitProgress({
          state: "capturing",
          message: `Step ${step + 1}: Capturing page state...`,
          stepNumber: step + 1,
          maxSteps: this.config.maxSteps,
        });

        const pageState = await this.capturePageState(step + 1);

        // 2. Send to AI for decision
        this.emitProgress({
          state: "thinking",
          message: `Step ${step + 1}: AI is deciding next action...`,
          stepNumber: step + 1,
          maxSteps: this.config.maxSteps,
          screenshot: pageState.screenshot,
        });

        const action = await this.getNextAction(pageState);

        logger.info(
          `Step ${step + 1}: AI chose action "${action.action}"`,
          action,
        );

        // 3. Check if done
        if (action.action === "done") {
          summary = action.summary;
          this.steps.push({
            stepNumber: step + 1,
            pageState: this.stripScreenshot(pageState),
            action,
            result: { success: true, description: action.summary },
            timestamp: Date.now(),
          });

          this.emitProgress({
            state: "completed",
            message: `Completed: ${action.summary}`,
            stepNumber: step + 1,
            maxSteps: this.config.maxSteps,
            lastAction: action,
          });

          return this.buildResult(startTime, true, undefined, summary);
        }

        // 4. Execute the action
        this.emitProgress({
          state: "acting",
          message: `Step ${step + 1}: ${describeAction(action)}`,
          stepNumber: step + 1,
          maxSteps: this.config.maxSteps,
          lastAction: action,
        });

        const result = await executeAction(
          this.connection,
          action,
          pageState.interactiveElements,
        );

        this.steps.push({
          stepNumber: step + 1,
          pageState: this.stripScreenshot(pageState),
          action,
          result,
          timestamp: Date.now(),
        });

        if (!result.success) {
          logger.warn(`Step ${step + 1} action failed:`, result.error);
          // Don't abort on individual failures — let the AI adapt
        }

        // 5. Wait between actions
        if (result.didNavigate) {
          await delay(1500); // Extra wait for navigation
        } else {
          await delay(this.config.actionDelay);
        }
      }

      // Max steps exhausted
      summary = "Reached maximum number of steps";
      this.emitProgress({
        state: "completed",
        message: `Finished: reached max steps (${this.config.maxSteps})`,
        stepNumber: this.config.maxSteps,
        maxSteps: this.config.maxSteps,
      });

      return this.buildResult(startTime, true, undefined, summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Agent loop failed:", error);

      this.emitProgress({
        state: "failed",
        message: `Failed: ${message}`,
        stepNumber: this.steps.length + 1,
        maxSteps: this.config.maxSteps,
      });

      return this.buildResult(startTime, false, message);
    }
  }

  private async capturePageState(stepNumber: number): Promise<CDPPageState> {
    // Extract interactive elements
    const domState = await extractInteractiveElements(this.connection);

    // Take screenshot (annotated or plain)
    let screenshot: string;
    if (this.config.useVision) {
      if (this.config.annotateScreenshots) {
        screenshot = await captureAnnotatedScreenshot(
          this.connection,
          domState.elements,
        );
      } else {
        screenshot = await captureScreenshot(this.connection);
      }
    } else {
      screenshot = ""; // No vision mode — text only
    }

    const hasMoreContentBelow =
      domState.scrollPosition.y + domState.viewport.height <
      domState.pageSize.height - 50;

    return {
      screenshot,
      interactiveElements: domState.elements,
      url: domState.url,
      title: domState.title,
      viewport: domState.viewport,
      scrollPosition: domState.scrollPosition,
      pageSize: domState.pageSize,
      hasMoreContentBelow,
      stepNumber,
    };
  }

  private async getNextAction(
    pageState: CDPPageState,
  ): Promise<CDPAgentAction> {
    const model = getAIModel(this.provider, this.apiKey, this.modelName);

    const systemPrompt = this.buildSystemPrompt();
    const messages = this.buildMessages(pageState);

    // Log image details and save locally
    if (pageState.screenshot && this.config.useVision) {
      const imageSizeKB = Math.round(
        (pageState.screenshot.length * 3) / 4 / 1024,
      );
      logger.info(
        `[Run ${this.runId}][Step ${pageState.stepNumber}] Sending screenshot to AI`,
        {
          step: pageState.stepNumber,
          imageSizeKB,
          annotated: this.config.annotateScreenshots,
          url: pageState.url,
          viewport: pageState.viewport,
          elementCount: pageState.interactiveElements.length,
          hasMoreContentBelow: pageState.hasMoreContentBelow,
        },
      );

      // Save screenshot locally for debugging
      saveScreenshotLocally(
        this.runId,
        pageState.stepNumber,
        pageState.screenshot,
        {
          url: pageState.url,
          elementCount: pageState.interactiveElements.length,
        },
      );
    } else {
      logger.info(
        `[Step ${pageState.stepNumber}] No screenshot (vision disabled)`,
      );
    }

    logger.info(
      `[Run ${this.runId}][Step ${pageState.stepNumber}] Calling generateObject`,
      {
        provider: this.provider,
        model: this.modelName,
        messageCount: messages.length,
        elementCount: pageState.interactiveElements.length,
        previousSteps: this.steps.length,
      },
    );

    const callStart = performance.now();

    try {
      const result = await generateObject({
        model,
        schema: CDPAgentActionSchema,
        schemaName: "AgentAction",
        schemaDescription:
          "The next action the agent should take to fill the form",
        system: systemPrompt,
        messages,
        temperature: 0.1,
        ...(DEBUG
          ? {
              experimental_telemetry: {
                isEnabled: true,
                functionId: "cdp-agent-action",
                metadata: {
                  step: String(pageState.stepNumber),
                  elementCount: String(pageState.interactiveElements.length),
                },
              },
            }
          : {}),
      });

      const callDuration = Math.round(performance.now() - callStart);

      logger.info(
        `[Run ${this.runId}][Step ${pageState.stepNumber}] generateObject completed in ${callDuration}ms`,
        {
          action: result.object,
          durationMs: callDuration,
          usage: result.usage,
        },
      );

      return this.normalizeAction(result.object as CDPAgentAction);
    } catch (error) {
      const callDuration = Math.round(performance.now() - callStart);
      logger.warn(
        `[Run ${this.runId}][Step ${pageState.stepNumber}] generateObject failed, falling back to wait`,
        { error, durationMs: callDuration },
      );

      this.emitProgress({
        state: "waiting",
        message: `Recovering from schema error, retrying...`,
        stepNumber: pageState.stepNumber,
        maxSteps: this.config.maxSteps,
      });

      return {
        action: "wait",
        duration: 800,
        reasoning: "Model returned invalid schema; retry after short wait",
      };
    }
  }

  private normalizeAction(action: CDPAgentAction): CDPAgentAction {
    const withDefault = <T>(value: T | undefined, fallback: T): T =>
      value === undefined || value === null ? fallback : value;

    switch (action.action) {
      case "click":
        if (action.index === undefined) {
          return {
            action: "wait",
            duration: 500,
            reasoning: "Missing index for click; waiting and retrying",
          };
        }
        return {
          ...action,
          doubleClick: withDefault(action.doubleClick, false),
          reasoning: withDefault(action.reasoning, "Click target element"),
        };
      case "type": {
        if (action.index === undefined || action.text === undefined) {
          return {
            action: "wait",
            duration: 500,
            reasoning: "Missing index or text for type; waiting and retrying",
          };
        }

        const requested = action.text.trim();
        const isAllowed = this.allowedAnswers.some((allowed) => {
          if (allowed === requested) return true;
          if (allowed.length > 0 && requested.length > 0) {
            return allowed.includes(requested) || requested.includes(allowed);
          }
          return false;
        });

        if (!isAllowed) {
          return {
            action: "wait",
            duration: 500,
            reasoning:
              "Typing was skipped because the value is not in the user's memories",
          };
        }

        return {
          ...action,
          clearFirst: withDefault(action.clearFirst, true),
          reasoning: withDefault(action.reasoning, "Type into the field"),
        };
      }
      case "select_option":
        if (action.index === undefined || action.value === undefined) {
          return {
            action: "wait",
            duration: 500,
            reasoning:
              "Missing index or value for select; waiting and retrying",
          };
        }
        return {
          ...action,
          reasoning: withDefault(action.reasoning, "Select matching option"),
        };
      case "scroll":
        return {
          ...action,
          direction: withDefault(action.direction, "down"),
          amount: withDefault(action.amount, 500),
          reasoning: withDefault(action.reasoning, "Scroll to reveal more"),
        };
      case "key_press":
        if (!action.key) {
          return {
            action: "wait",
            duration: 500,
            reasoning: "Missing key for key_press; waiting and retrying",
          };
        }
        return {
          ...action,
          reasoning: withDefault(action.reasoning, "Send key press"),
        };
      case "wait":
        return {
          ...action,
          duration: withDefault(action.duration, 500),
          reasoning: withDefault(action.reasoning, "Pause before next step"),
        };
      case "done":
        return {
          ...action,
          summary: withDefault(action.summary, "Completed form filling"),
          reasoning: withDefault(action.reasoning, "Task complete"),
        };
      case "go_back":
        return {
          ...action,
          reasoning: withDefault(action.reasoning, "Navigate back"),
        };
      case "tab":
        return {
          ...action,
          count: withDefault(action.count, 1),
          shift: withDefault(action.shift, false),
          reasoning: withDefault(action.reasoning, "Advance focus"),
        };
      default:
        return {
          action: "wait",
          duration: 500,
          reasoning: "Unrecognized action; waiting",
        };
    }
  }

  private buildSystemPrompt(): string {
    const memoriesSection = this.memories
      .map(
        (m, i) =>
          `${i + 1}. [${m.category}] Q: ${m.question || "N/A"} → A: ${m.answer}`,
      )
      .join("\n");

    return `You are an AI agent that fills out web forms by controlling a browser.
You interact with web pages step-by-step using available actions.

## Your Task
${this.task}

## User's Stored Information (Memories)
Use these to fill form fields:
${memoriesSection}

## How You Work
1. You receive a screenshot of the current page with numbered interactive elements
2. Each interactive element has a red badge with its index number [N]
3. You choose ONE action per step (click, type, select, scroll, etc.)
4. After your action executes, you'll see the updated page state
5. Repeat until the form is completely filled, then use "done"

## Available Actions
- **click**: Click an element by index. Use for buttons, links, checkboxes, radio buttons, or to focus input fields.
- **type**: Type text into a focused input/textarea. Automatically clicks the element first. Set clearFirst=true to replace existing text.
- **select_option**: Select an option in a <select> dropdown by value or text.
- **scroll**: Scroll the page up or down to reveal more content.
- **key_press**: Press a keyboard key (Enter, Tab, Escape, ArrowDown, etc.)
- **wait**: Wait for page changes (max 3000ms). Use after actions that trigger loading.
- **done**: Signal that the task is complete. Include a summary of what was accomplished.
- **go_back**: Navigate to the previous page.
- **tab**: Press Tab to move focus (shift=true for reverse).

## Critical Rules
1. **ONLY use information from the user's memories.** NEVER fabricate data.
2. For fields with no matching memory, SKIP them (don't type anything).
3. For SELECT dropdowns, use select_option with the exact option value/text.
4. For custom dropdowns (div-based), click to open → wait → click the option.
5. If a field already has the correct value, don't modify it.
6. After filling all fillable fields, use the "done" action.
7. If you see a CAPTCHA or login wall, use "done" and explain you couldn't proceed.
8. If you're stuck in a loop (same state for 3+ steps), use "done".
9. Scroll down if you suspect there are more form fields below the fold.
10. When typing, match the field's expected format (email format for email fields, etc.)
11. For date fields, use the format shown in the placeholder or try common formats.
12. For phone fields, include country code if a separate country code field isn't present.

## Strategy
1. First, scan the visible form fields and plan which memories map to which fields
2. Fill fields top-to-bottom, left-to-right for the most natural flow
3. Handle dependent fields (e.g., country → state dropdowns) in order
4. After filling visible fields, scroll to check for more
5. Once all fields are filled, use "done" with a summary

## Important Notes
- Element indices [N] shown in screenshots correspond to the interactive elements list
- Some elements may not be visible in the screenshot but are in the elements list
- Custom components (React Select, Combobox) may require click → type → select sequences
- Don't submit the form unless the task explicitly asks you to
`;
  }

  private buildMessages(
    pageState: CDPPageState,
  ): Array<{ role: "user"; content: UserContent | string }> {
    const messages: Array<{
      role: "user";
      content: UserContent | string;
    }> = [];

    const visionCapable = this.config.useVision && this.supportsVisionModel();

    // Add previous steps as context (last 5 steps to keep context manageable)
    const recentSteps = this.steps.slice(-5);
    if (recentSteps.length > 0) {
      const historyText = recentSteps
        .map(
          (s) =>
            `Step ${s.stepNumber}: ${describeAction(s.action)} → ${s.result.success ? "✓" : "✗"} ${s.result.description}`,
        )
        .join("\n");

      if (visionCapable) {
        messages.push({
          role: "user",
          content: [
            {
              type: "text" as const,
              text: `## Previous Actions\n${historyText}\n\n---\n`,
            },
          ],
        });
      } else {
        messages.push({
          role: "user",
          content: `## Previous Actions\n${historyText}\n\n---\n`,
        });
      }
    }

    // Build current state message
    const elementsText = this.formatElementsList(pageState.interactiveElements);
    const allowedValuesText = this.formatAllowedValues();

    const stateText = `## Current Page State (Step ${pageState.stepNumber}/${this.config.maxSteps})
**URL**: ${pageState.url}
**Title**: ${pageState.title}
**Viewport**: ${pageState.viewport.width}x${pageState.viewport.height}
**Scroll**: ${pageState.scrollPosition.x},${pageState.scrollPosition.y}
**More content below**: ${pageState.hasMoreContentBelow ? "Yes" : "No"}

## Interactive Elements (${pageState.interactiveElements.length} found)
${elementsText}

  ## Allowed Answers (only type values from this list)
  ${allowedValuesText}

Choose your next action. Pick ONE action to perform.`;

    if (visionCapable && pageState.screenshot) {
      const content: UserContent = [
        {
          type: "image" as const,
          image: pageState.screenshot,
          mediaType: "image/jpeg",
        },
        { type: "text" as const, text: stateText },
      ];
      messages.push({ role: "user", content });
    } else {
      messages.push({ role: "user", content: stateText });
    }

    return messages;
  }

  private supportsVisionModel(): boolean {
    const model = (this.modelName || "").toLowerCase();

    if (this.provider === "anthropic") return true;
    if (this.provider === "gemini") return true;
    if (this.provider === "openai") {
      return /gpt-4o|gpt-4\.1|vision/.test(model);
    }

    // Groq/deepseek/ollama and other OpenAI-compatible providers default to text-only
    return false;
  }

  private formatElementsList(elements: CDPInteractiveElement[]): string {
    if (elements.length === 0) return "No interactive elements found.";

    return elements
      .map((el) => {
        const parts = [`[${el.index}] <${el.tagName}`];

        if (el.type) parts.push(` type="${el.type}"`);
        if (el.role) parts.push(` role="${el.role}"`);
        if (el.name) parts.push(` name="${el.name}"`);
        if (el.id) parts.push(` id="${el.id}"`);
        if (el.placeholder) parts.push(` placeholder="${el.placeholder}"`);
        if (el.ariaLabel) parts.push(` aria-label="${el.ariaLabel}"`);
        parts.push(">");

        const meta: string[] = [];
        if (el.label) meta.push(`label="${el.label}"`);
        if (el.currentValue)
          meta.push(`value="${el.currentValue.substring(0, 100)}"`);
        if (el.text && el.tagName !== "input" && el.tagName !== "textarea") {
          meta.push(`text="${el.text.substring(0, 100)}"`);
        }
        if (!el.isEnabled) meta.push("DISABLED");
        if (el.isFocused) meta.push("FOCUSED");
        if (el.options && el.options.length > 0) {
          const optPreview = el.options
            .slice(0, 10)
            .map((o) => `"${o.value}"`)
            .join(", ");
          meta.push(
            `options=[${optPreview}${el.options.length > 10 ? ", ..." : ""}]`,
          );
        }

        if (meta.length > 0) parts.push(` (${meta.join(", ")})`);

        return parts.join("");
      })
      .join("\n");
  }

  private formatAllowedValues(): string {
    if (this.allowedAnswers.length === 0) {
      return "No memories available; do not type anything.";
    }

    return this.memories
      .map((m, i) => {
        const label = m.question?.trim().length
          ? m.question.trim()
          : m.category;
        return `${i + 1}. ${label}: ${m.answer}`;
      })
      .join("\n");
  }

  private stripScreenshot(
    pageState: CDPPageState,
  ): Omit<CDPPageState, "screenshot"> {
    const { screenshot: _, ...rest } = pageState;
    return rest;
  }

  private buildResult(
    startTime: number,
    success: boolean,
    error?: string,
    summary?: string,
  ): CDPAgentResult {
    return {
      success,
      totalSteps: this.steps.length,
      steps: this.steps,
      duration: performance.now() - startTime,
      summary: summary || error || "Unknown",
      error,
    };
  }

  private emitProgress(progress: Omit<CDPAgentProgress, never>): void {
    this.onProgress?.(progress);
  }
}

function describeAction(action: CDPAgentAction): string {
  switch (action.action) {
    case "click":
      return `Click element [${action.index}]`;
    case "type":
      return `Type "${action.text.substring(0, 30)}${action.text.length > 30 ? "..." : ""}" into [${action.index}]`;
    case "select_option":
      return `Select "${action.value}" in [${action.index}]`;
    case "scroll":
      return `Scroll ${action.direction} ${action.amount ?? 500}px`;
    case "key_press":
      return `Press ${action.key}`;
    case "wait":
      return `Wait ${action.duration}ms`;
    case "done":
      return `Done: ${action.summary}`;
    case "go_back":
      return "Go back";
    case "tab":
      return `${action.shift ? "Shift+" : ""}Tab x${action.count ?? 1}`;
  }
}
