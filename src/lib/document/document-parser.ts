import { generateText, Output } from "ai";
import type * as PdfjsDist from "pdfjs-dist";
import { z } from "zod";
import { getTelemetryConfig } from "@/lib/ai/telemetry";
import { createLogger } from "@/lib/logger";
import { getAIModel, getProviderOptions } from "@/lib/providers/model-factory";
import { getKeyVaultService } from "@/lib/security/key-vault-service";
import { storage } from "@/lib/storage";
import type {
  DocumentImportItem,
  DocumentParseResult,
  ExtractedItem,
  ParseDocumentOptions,
  PDFAnnotation,
  TextItem,
} from "@/types/document";
import type { AllowedCategory } from "@/types/memory";

const logger = createLogger("document-parser");

let _pdfjsLib: typeof PdfjsDist | null = null;

class AbortError extends Error {
  constructor() {
    super("Document parsing was cancelled");
    this.name = "AbortError";
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new AbortError();
}

const ExtractedInfoSchema = z.object({
  items: z.array(
    z.object({
      label: z.string().describe("Short label for this piece of information"),
      question: z.string().describe("A question this information would answer"),
      answer: z.string().describe("The extracted information/answer"),
      category: z
        .enum([
          "personal",
          "contact",
          "location",
          "work",
          "education",
          "general",
        ])
        .describe("Category this information belongs to"),
      tags: z
        .array(z.string())
        .describe("Relevant tags for searching (lowercase, single words)"),
    }),
  ),
});

export async function extractTextFromPDF(file: File): Promise<string> {
  if (!_pdfjsLib) {
    _pdfjsLib = await import("pdfjs-dist");
    _pdfjsLib.GlobalWorkerOptions.workerSrc =
      browser.runtime.getURL("/pdf.worker.mjs");
  }

  const pdfjsLib = _pdfjsLib;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = "";
  const allLinks: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    try {
      const annotations = await page.getAnnotations();
      for (const annotation of annotations as PDFAnnotation[]) {
        if (annotation.subtype === "Link" && annotation.url) {
          allLinks.push(annotation.url);
        }
      }
    } catch (e) {
      logger.debug("Could not extract annotations:", e);
    }

    const items = textContent.items as TextItem[];
    const lineMap = new Map<number, TextItem[]>();

    for (const item of items) {
      if (!item.str) continue;
      
      const y = Math.round(item.transform[5]);
      
      if (!lineMap.has(y)) {
        lineMap.set(y, []);
      }
      
      lineMap.get(y)?.push(item);
    }

    const sortedYPositions = [...lineMap.keys()].sort((a, b) => b - a);

    for (const y of sortedYPositions) {
      const lineItems = lineMap.get(y);
      
      if (!lineItems) continue;
      
      lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

      let lineText = "";
      let lastX = 0;
      
      for (const item of lineItems) {
        const x = item.transform[4];
        
        if (lineText && x - lastX > 5) {
          lineText += " ";
        }
        
        lineText += item.str;
        lastX = x + item.width;
      }

      if (lineText.trim()) {
        fullText += `${lineText.trim()}\n`;
      }
    }

    fullText += "\n";
  }

  if (allLinks.length > 0) {
    const uniqueLinks = [...new Set(allLinks)];
    
    fullText += "\n--- HYPERLINKS FOUND IN DOCUMENT ---\n";
    
    for (const link of uniqueLinks) {
      fullText += `${link}\n`;
    }
  }

  logger.debug("Extracted PDF text length:", fullText.length);
  logger.debug("Found hyperlinks:", allLinks.length);
  return fullText;
}

const DOCUMENT_PARSING_PROMPT = `You are an intelligent document parser for a form auto-fill application. Your job is to extract useful personal information from documents that could help fill out forms automatically.

Extract ANY information that could be useful for filling forms, such as:
- Personal details (name, date of birth, nationality, gender, etc.)
- Contact info (email, phone, address, social profiles like LinkedIn, GitHub, Twitter, etc.)
- Work history (job titles, companies, dates, responsibilities)
- Education (schools, degrees, majors, graduation dates, GPA)
- Skills and expertise
- Certifications and licenses
- Projects and achievements
- Languages spoken
- References
- Any other relevant personal or professional information

Guidelines:
1. Extract as many useful pieces of information as you can find
2. Create clear, searchable labels and questions
3. Keep answers concise but complete
4. Use appropriate categories: personal, contact, location, work, education, or general
5. Add relevant lowercase tags for each item (e.g., "email", "phone", "name", "job", "degree")
6. If something could answer multiple common form questions, include it
7. Don't include generic document metadata or irrelevant content
8. Do not produce duplicate or overlapping memories; merge identical facts instead of repeating them
9. Work history: for each job/role/company, emit exactly one memory that includes role, company, location (if present), and the work period (start–end or start–present) in the answer. Do not split a single job into multiple memories
10. Education: emit one memory per distinct qualification. Each education memory must include the institution, degree/program, and its dates/period in the same memory. Use distinct labels/questions so multiple educations are clearly differentiated

IMPORTANT - Hyperlinks:
- The document may have a "HYPERLINKS FOUND IN DOCUMENT" section at the end
- These are the actual URLs from clickable links in the document
- Match these URLs with their context (e.g., if text says "GitHub" and there's a github.com link, use the full URL)
- For social profiles (LinkedIn, GitHub, Twitter, portfolio sites), always use the full URL as the answer
- Common patterns: linkedin.com/in/username, github.com/username, twitter.com/username

Be thorough - users want to capture as much useful information as possible from their documents.`;

async function parseDocumentWithAI(
  text: string,
  logPrefix: string,
  signal?: AbortSignal,
): Promise<ExtractedItem[]> {
  const aiSettings = await storage.aiSettings.getValue();
  const { selectedProvider, selectedModels } = aiSettings;

  if (!selectedProvider) {
    throw new Error(
      "AI provider not configured. Please set up an AI provider in settings.",
    );
  }

  throwIfAborted(signal);

  const keyVaultService = getKeyVaultService();
  const apiKey = await keyVaultService.getKey(selectedProvider);

  if (!apiKey && selectedProvider !== "ollama") {
    throw new Error(
      `API key not configured for ${selectedProvider}. Please add your API key in settings.`,
    );
  }

  const selectedModel = selectedModels?.[selectedProvider];
  const model = getAIModel(selectedProvider, apiKey || "", selectedModel);

  logger.debug(
    `${logPrefix} AI call start — provider: ${selectedProvider}, model: ${selectedModel ?? "default"}, text length: ${text.length} chars`,
  );

  const { output } = await generateText({
    model,
    output: Output.object({
      schema: ExtractedInfoSchema,
      name: "ExtractedInfo",
      description: "Information extracted from a document for form filling",
    }),
    system: DOCUMENT_PARSING_PROMPT,
    prompt: `Extract all useful personal and professional information from this document:\n\n${text}`,
    temperature: 0.1,
    providerOptions: getProviderOptions(selectedProvider),
    ...getTelemetryConfig("document-parsing"),
  });

  logger.debug("AI extracted items:", output.items.length);

  return output.items;
}

export async function parseDocument(
  file: File,
  options: ParseDocumentOptions = {},
): Promise<DocumentParseResult> {
  const { requestId, onStageChange, signal } = options;
  const logPrefix = requestId ? `[req:${requestId}]` : "[req:?]";
  const totalStart = performance.now();

  try {
    throwIfAborted(signal);
    logger.debug(
      `${logPrefix} Starting document parsing — file: ${file.name}, size: ${file.size} bytes`,
    );

    let text: string;
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    const isTxt =
      file.type === "text/plain" || file.name.toLowerCase().endsWith(".txt");

    if (isPdf) {
      onStageChange?.("reading");
      const readStart = performance.now();
      text = await extractTextFromPDF(file);
      throwIfAborted(signal);
      logger.debug(
        `${logPrefix} PDF text extracted — ${Math.round(performance.now() - readStart)}ms, ${text.length} chars`,
      );
    } else if (isTxt) {
      onStageChange?.("reading");
      const readStart = performance.now();
      text = await file.text();
      throwIfAborted(signal);
      logger.debug(
        `${logPrefix} TXT text read — ${Math.round(performance.now() - readStart)}ms, ${text.length} chars`,
      );
    } else {
      logger.warn(`${logPrefix} Unsupported file type: ${file.type}`);
      return {
        success: false,
        error: "Unsupported file type. Please upload a PDF or text file.",
      };
    }

    if (!text || text.trim().length < 50) {
      logger.warn(
        `${logPrefix} Document text too short (${text.trim().length} chars) — possibly image-based or empty`,
      );
      return {
        success: false,
        error:
          "Could not extract text from document. The file might be image-based or empty.",
      };
    }

    onStageChange?.("parsing");
    const items = await parseDocumentWithAI(text, logPrefix, signal);

    logger.debug(
      `${logPrefix} Parse complete — total: ${Math.round(performance.now() - totalStart)}ms, items: ${items.length}`,
    );

    return {
      success: true,
      items,
      rawText: text,
    };
  } catch (error) {
    if (error instanceof AbortError) {
      logger.debug(`${logPrefix} Parsing cancelled by caller`);
      return { success: false, error: "cancelled" };
    }
    logger.error(
      `${logPrefix} Document parsing error (${Math.round(performance.now() - totalStart)}ms):`,
      error,
    );
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to parse document",
    };
  }
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();

  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();

    if (normalized) {
      seen.add(normalized);
    }
  }
  return [...seen];
}

function normalizeKey(item: ExtractedItem): string {
  const safe = (value: string) => value.trim().toLowerCase();

  return [
    safe(item.label),
    safe(item.question),
    safe(item.answer),
    item.category,
  ]
    .map((part) => part || "")
    .join("|");
}

function deduplicateItems(items: ExtractedItem[]): ExtractedItem[] {
  const byKey = new Map<string, ExtractedItem>();

  for (const item of items) {
    if (!item.label?.trim() || !item.question?.trim() || !item.answer?.trim()) {
      continue;
    }

    const key = normalizeKey(item);
    const existing = byKey.get(key);

    if (existing) {
      const mergedTags = normalizeTags([
        ...(existing.tags || []),
        ...(item.tags || []),
      ]);
      byKey.set(key, { ...existing, tags: mergedTags });
    } else {
      byKey.set(key, { ...item, tags: normalizeTags(item.tags || []) });
    }
  }

  return Array.from(byKey.values());
}

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  
  for (const tag of tags) {
    const normalized = tag.trim().toLowerCase();
    
    if (normalized) {
      seen.add(normalized);
    }
  }
  return [...seen];
}

function normalizeKey(item: ExtractedItem): string {
  const safe = (value: string) => value.trim().toLowerCase();
  
  return [
    safe(item.label),
    safe(item.question),
    safe(item.answer),
    item.category,
  ]
    .map((part) => part || "")
    .join("|");
}

function deduplicateItems(items: ExtractedItem[]): ExtractedItem[] {
  const byKey = new Map<string, ExtractedItem>();

  for (const item of items) {
    if (!item.label?.trim() || !item.question?.trim() || !item.answer?.trim()) {
      continue;
    }

    const key = normalizeKey(item);
    const existing = byKey.get(key);

    if (existing) {
      const mergedTags = normalizeTags([
        ...(existing.tags || []),
        ...(item.tags || []),
      ]);
      byKey.set(key, { ...existing, tags: mergedTags });
    } else {
      byKey.set(key, { ...item, tags: normalizeTags(item.tags || []) });
    }
  }

  return Array.from(byKey.values());
}

export function convertToImportItems(
  items: ExtractedItem[],
): DocumentImportItem[] {
  const deduped = deduplicateItems(items);

  return deduped.map((item, index) => ({
    ...item,
    id: `doc-${index + 1}`,
    selected: true,
  }));
}

export function getCategoryForItem(item: ExtractedItem): AllowedCategory {
  return item.category as AllowedCategory;
}
