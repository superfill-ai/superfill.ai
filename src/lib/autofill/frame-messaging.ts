export const MAIN_FRAME_ID = 0;

export const mainFrameTarget = (
  tabId: number,
): {
  tabId: number;
  frameId: typeof MAIN_FRAME_ID;
} => ({
  frameId: MAIN_FRAME_ID,
  tabId,
});
