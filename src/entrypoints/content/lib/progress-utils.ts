import type { AutofillProgress } from "@/types/autofill";

export const getProgressTitle = (
  state: AutofillProgress["state"],
  mode: "preview" | "autopilot" = "preview"
): string => {
  switch (state) {
    case "detecting":
      return mode === "autopilot" ? "Detecting forms..." : "Detecting forms";
    case "analyzing":
      return mode === "autopilot" ? "Analyzing fields..." : "Analyzing fields";
    case "matching":
      return mode === "autopilot" ? "Matching memories..." : "Matching memories";
    case "filling":
      return "Auto-filling fields...";
    case "showing-preview":
      return "Preparing suggestions";
    case "completed":
      return "Auto-fill complete!";
    case "failed":
      return "Auto-fill failed";
    default:
      return mode === "autopilot" ? "Processing..." : "Processing";
  }
};

export const getProgressDescription = (
  progress: AutofillProgress,
  mode: "preview" | "autopilot" = "preview"
): string => {
  if (progress.state === "completed") {
    return `Successfully filled ${progress.fieldsMatched || 0} fields`;
  }

  if (progress.state === "failed") {
    return progress.error || "Something went wrong";
  }

  if (progress.fieldsDetected) {
    if (progress.fieldsMatched !== undefined) {
      return `${progress.fieldsMatched} matches found for ${progress.fieldsDetected} fields`;
    }
    return mode === "autopilot"
      ? `Processing ${progress.fieldsDetected} fields`
      : `Analyzing ${progress.fieldsDetected} fields`;
  }

  return progress.message || (mode === "autopilot" ? "Initializing autopilot mode..." : "Processing...");
};

export const getProgressValue = (state: AutofillProgress["state"]): number => {
  switch (state) {
    case "detecting":
      return 15;
    case "analyzing":
      return 35;
    case "matching":
      return 65;
    case "showing-preview":
      return 75;
    case "filling":
      return 85;
    case "completed":
      return 100;
    case "failed":
      return 0;
    default:
      return 0;
  }
};

export const getProgressIcon = (
  state: AutofillProgress["state"]
): "error" | "success" | "loading" => {
  switch (state) {
    case "failed":
      return "error";
    case "completed":
      return "success";
    default:
      return "loading";
  }
};
