import type z from "zod";
import type { ExtractedInfoSchema } from "@/lib/ai/schemas";

export type ExtractedItem = z.infer<
  typeof ExtractedInfoSchema
>["items"][number];

export interface DocumentParseResult {
  success: boolean;
  items?: ExtractedItem[];
  rawText?: string;
  error?: string;
}

export type DocumentParserStatus =
  | "idle"
  | "reading"
  | "parsing"
  | "success"
  | "error";

export interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export interface PDFAnnotation {
  subtype: string;
  url?: string;
  rect?: number[];
}

export interface ParseDocumentOptions {
  requestId?: string;
  onStageChange?: (stage: "reading" | "parsing") => void;
  signal?: AbortSignal;
}

export interface DocumentImportItem extends ExtractedItem {
  id: string;
  selected: boolean;
}
