import { createLogger } from "@/lib/logger";

const logger = createLogger("shadow-dom-patch");

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  world: "MAIN",

  main() {
    const originalAttachShadow = Element.prototype.attachShadow;

    // Defensive check to ensure originalAttachShadow exists and is a function
    if (typeof originalAttachShadow !== "function") {
      logger.error("Element.prototype.attachShadow is not a function");
      return;
    }

    /**
     * SECURITY CONSIDERATION: Global Shadow DOM Mode Override
     *
     * This override forces all shadow roots to use mode: "open" instead of "closed".
     *
     * WHY THIS IS NECESSARY:
     * - Autofill functionality requires access to form fields inside shadow DOM
     * - Closed shadow roots prevent any external JavaScript (including extensions) from accessing the DOM tree
     * - Many modern web components (custom elements, design systems) use closed shadow roots for encapsulation
     * - Without this patch, autofill would fail silently on these fields
     *
     * THREAT MODEL & RISKS:
     * - Exposes all shadow DOM content that was intended to be private
     * - Web components relying on closed shadows for security may be compromised
     * - Sensitive data in closed shadow roots (e.g., payment forms, authentication UI) becomes accessible
     * - Third-party scripts on the page can now access what should have been encapsulated content
     * - May break web components that rely on closed shadow behavior for functionality
     *
     * ALTERNATIVES CONSIDERED:
     * 1. Origin-specific targeting: Only patch on known-safe domains
     *    - Rejected: Too brittle, requires maintaining allowlist, misses legitimate use cases
     * 2. Runtime toggle based on autofill state: Only patch when user activates autofill
     *    - Investigated: WXT supports dynamic content script registration via chrome.scripting.registerContentScripts
     *    - Rejected: Timing issues - patch must run at document_start before any shadow roots are created
     *    - Late registration would miss early shadow attachments, breaking detection
     * 3. Component-specific instrumentation: Hook into known UI libraries
     *    - Rejected: Not scalable, requires knowledge of all possible frameworks
     * 4. MutationObserver on document: Detect and patch shadow roots after creation
     *    - Rejected: Cannot modify already-attached closed shadow roots
     *
     * DECISION:
     * - Accept global override as necessary trade-off for reliable autofill
     * - User explicitly installs extension understanding it modifies page behavior
     * - Extension runs in isolated context, limiting exposure of the opened shadows
     * - Security benefit of autofill (reducing password reuse, secure credential management) outweighs risks
     *
     * FUTURE IMPROVEMENTS:
     * - Consider per-origin user permissions for shadow DOM access
     * - Explore browser API proposals for extension-specific shadow DOM access
     * - Monitor for breaking changes in web component behavior
     */
    Element.prototype.attachShadow = function (
      init: ShadowRootInit,
    ): ShadowRoot {
      try {
        return originalAttachShadow.call(this, { ...init, mode: "open" });
      } catch (error) {
        logger.error(
          "Shadow DOM patch failed, falling back to original:",
          error,
        );
        try {
          return originalAttachShadow.call(this, init);
        } catch (fallbackError) {
          logger.error("Shadow DOM original call also failed:", fallbackError);
          throw fallbackError;
        }
      }
    };
  },
});
