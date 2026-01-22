export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  world: "MAIN",

  main() {
    const originalAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (
      init: ShadowRootInit,
    ): ShadowRoot {
      return originalAttachShadow.call(this, { ...init, mode: "open" });
    };
  },
});
