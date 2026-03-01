/** CDP Agent Loop types for browser-use style form filling */

/** An interactive element discovered on the page via CDP */
export interface CDPInteractiveElement {
  /** Sequential index used for AI reference (shown in annotated screenshot) */
  index: number;
  /** Element tag name (input, select, textarea, button, a, etc.) */
  tagName: string;
  /** Element type attribute (text, email, submit, etc.) */
  type: string | null;
  /** Element role attribute */
  role: string | null;
  /** Visible text content or value */
  text: string;
  /** Placeholder text */
  placeholder: string | null;
  /** aria-label */
  ariaLabel: string | null;
  /** Associated label text */
  label: string | null;
  /** Element name attribute */
  name: string | null;
  /** Element id attribute */
  id: string | null;
  /** Bounding box in page coordinates */
  boundingBox: CDPBoundingBox;
  /** Whether the element is currently visible in viewport */
  isVisible: boolean;
  /** Whether the element is enabled (not disabled/readonly) */
  isEnabled: boolean;
  /** Whether the element is focused */
  isFocused: boolean;
  /** Current value (for input/textarea/select) */
  currentValue: string;
  /** Available options for select elements */
  options?: CDPSelectOption[];
  /** CDP backend node ID for direct targeting */
  backendNodeId: number;
  /** CDP object ID for runtime evaluation */
  objectId?: string;
  /** XPath for element identification */
  xpath: string;
}

export interface CDPSelectOption {
  value: string;
  text: string;
  selected: boolean;
}

export interface CDPBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The current state of the page sent to the AI agent */
export interface CDPPageState {
  /** Base64-encoded screenshot of the current viewport */
  screenshot: string;
  /** All interactive elements found on the page */
  interactiveElements: CDPInteractiveElement[];
  /** Current page URL */
  url: string;
  /** Current page title */
  title: string;
  /** Viewport dimensions */
  viewport: { width: number; height: number };
  /** Current scroll position */
  scrollPosition: { x: number; y: number };
  /** Total page dimensions */
  pageSize: { width: number; height: number };
  /** Whether there's more content below the fold */
  hasMoreContentBelow: boolean;
  /** The step number in the agent loop */
  stepNumber: number;
}

/** Actions the AI agent can request */
export type CDPAgentAction =
  | CDPClickAction
  | CDPTypeAction
  | CDPSelectOptionAction
  | CDPScrollAction
  | CDPKeyPressAction
  | CDPWaitAction
  | CDPDoneAction
  | CDPGoBackAction
  | CDPTabAction;

export interface CDPClickAction {
  action: "click";
  /** Index of the element to click */
  index: number;
  /** Optional: double-click */
  doubleClick?: boolean;
  reasoning: string;
}

export interface CDPTypeAction {
  action: "type";
  /** Index of the element to type into */
  index: number;
  /** Text to type */
  text: string;
  /** Whether to clear the field first (default: true) */
  clearFirst?: boolean;
  reasoning: string;
}

export interface CDPSelectOptionAction {
  action: "select_option";
  /** Index of the select element */
  index: number;
  /** The option value to select */
  value: string;
  reasoning: string;
}

export interface CDPScrollAction {
  action: "scroll";
  /** Direction to scroll */
  direction: "up" | "down";
  /** Pixels to scroll (default: 500) */
  amount?: number;
  reasoning: string;
}

export interface CDPKeyPressAction {
  action: "key_press";
  /** Key to press (e.g., "Enter", "Tab", "Escape") */
  key: string;
  reasoning: string;
}

export interface CDPWaitAction {
  action: "wait";
  /** Milliseconds to wait (max 3000) */
  duration: number;
  reasoning: string;
}

export interface CDPDoneAction {
  action: "done";
  /** Summary of what was accomplished */
  summary: string;
  reasoning: string;
}

export interface CDPGoBackAction {
  action: "go_back";
  reasoning: string;
}

export interface CDPTabAction {
  action: "tab";
  /** Press Tab key N times (default: 1) */
  count?: number;
  /** Whether to hold shift (shift+tab for reverse) */
  shift?: boolean;
  reasoning: string;
}

/** Result of executing a single action */
export interface CDPActionResult {
  success: boolean;
  /** Description of what happened */
  description: string;
  /** Error message if failed */
  error?: string;
  /** Whether the page navigated as a result */
  didNavigate?: boolean;
}

/** Configuration for the CDP agent loop */
export interface CDPAgentConfig {
  /** Maximum number of steps before the agent is forced to stop */
  maxSteps: number;
  /** Whether to use vision (screenshot) mode */
  useVision: boolean;
  /** Whether to annotate screenshots with element indices */
  annotateScreenshots: boolean;
  /** Viewport width */
  viewportWidth: number;
  /** Viewport height */
  viewportHeight: number;
  /** Delay between actions in ms */
  actionDelay: number;
  /** Whether to take a screenshot after each action */
  screenshotAfterAction: boolean;
}

export const DEFAULT_CDP_AGENT_CONFIG: CDPAgentConfig = {
  maxSteps: 50,
  useVision: true,
  annotateScreenshots: true,
  viewportWidth: 1280,
  viewportHeight: 900,
  actionDelay: 500,
  screenshotAfterAction: true,
};

/** A single step in the agent loop history */
export interface CDPAgentStep {
  stepNumber: number;
  /** The page state at this step */
  pageState: Omit<CDPPageState, "screenshot">;
  /** The action the AI chose */
  action: CDPAgentAction;
  /** Result of executing the action */
  result: CDPActionResult;
  /** Timestamp */
  timestamp: number;
}

/** Overall result of the CDP agent autofill session */
export interface CDPAgentResult {
  success: boolean;
  /** Total steps taken */
  totalSteps: number;
  /** History of all steps */
  steps: CDPAgentStep[];
  /** Total duration in ms */
  duration: number;
  /** Final summary from the AI */
  summary: string;
  /** Error if failed */
  error?: string;
}

/** Progress updates for the UI */
export type CDPAgentProgressState =
  | "connecting"
  | "capturing"
  | "thinking"
  | "acting"
  | "waiting"
  | "completed"
  | "failed"
  | "disconnected";

export interface CDPAgentProgress {
  state: CDPAgentProgressState;
  message: string;
  stepNumber: number;
  maxSteps: number;
  lastAction?: CDPAgentAction;
  screenshot?: string;
}
