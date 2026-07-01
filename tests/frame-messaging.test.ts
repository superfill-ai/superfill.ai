import { describe, expect, test } from "bun:test";
import { mainFrameTarget } from "@/lib/autofill/frame-messaging";

describe("frame messaging", () => {
  test("targets preview UI messages to the main frame", () => {
    expect(mainFrameTarget(123)).toEqual({ frameId: 0, tabId: 123 });
  });
});
