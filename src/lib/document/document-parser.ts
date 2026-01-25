import { generateObject } from "ai";
import { z } from "zod";
import { getAIModel } from "@/lib/ai/model-factory";
import { createLogger } from "@/lib/logger";
import { getKeyVaultService } from "@/lib/security/key-vault-service";
import { storage } from "@/lib/storage";
import type { AllowedCategory } from "@/types/memory";

const logger = createLogger("document-parser");

// Simple schema - let AI decide what's important
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

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface PDFAnnotation {
  subtype: string;
  url?: string;
  rect?: number[];
}

export async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");

  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";
  const allLinks: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Extract hyperlinks from annotations
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

  // Append extracted links at the end so AI can use them
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
8. For work experience, extract both summary entries and individual details (title, company, dates)
9. For education, extract both combined entries and individual fields (school, degree, major)

IMPORTANT - Hyperlinks:
- The document may have a "HYPERLINKS FOUND IN DOCUMENT" section at the end
- These are the actual URLs from clickable links in the document
- Match these URLs with their context (e.g., if text says "GitHub" and there's a github.com link, use the full URL)
- For social profiles (LinkedIn, GitHub, Twitter, portfolio sites), always use the full URL as the answer
- Common patterns: linkedin.com/in/username, github.com/username, twitter.com/username

Be thorough - users want to capture as much useful information as possible from their documents.`;

async function parseDocumentWithAI(text: string): Promise<ExtractedItem[]> {
  const aiSettings = await storage.aiSettings.getValue();
  const { selectedProvider, selectedModels } = aiSettings;

  if (!selectedProvider) {
    throw new Error(
      "AI provider not configured. Please set up an AI provider in settings.",
    );
  }

  const keyVaultService = getKeyVaultService();
  const apiKey = await keyVaultService.getKey(selectedProvider);

  if (!apiKey && selectedProvider !== "ollama") {
    throw new Error(
      `API key not configured for ${selectedProvider}. Please add your API key in settings.`,
    );
  }

  const selectedModel = selectedModels?.[selectedProvider];
  const model = getAIModel(selectedProvider, apiKey || "", selectedModel);

  logger.debug("Parsing document with AI, text length:", text.length);

  const { object } = await generateObject({
    model,
    schema: ExtractedInfoSchema,
    schemaName: "ExtractedInfo",
    schemaDescription: "Information extracted from a document for form filling",
    system: DOCUMENT_PARSING_PROMPT,
    prompt: `Extract all useful personal and professional information from this document:\n\n${text}`,
    temperature: 0.1,
  });

  logger.debug("AI extracted items:", object.items.length);
  return object.items;
}

export async function parseDocument(file: File): Promise<DocumentParseResult> {
  try {
    logger.debug("Starting document parsing for:", file.name);

    // Extract text based on file type
    let text: string;

    if (
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
    ) {
      text = await extractTextFromPDF(file);
    } else if (
      file.type === "text/plain" ||
      file.name.toLowerCase().endsWith(".txt")
    ) {
      text = await file.text();
    } else {
      return {
        success: false,
        error: "Unsupported file type. Please upload a PDF or text file.",
      };
    }

    logger.debug("Extracted text length:", text.length);

    if (!text || text.trim().length < 50) {
      return {
        success: false,
        error:
          "Could not extract text from document. The file might be image-based or empty.",
      };
    }

    const items = await parseDocumentWithAI(text);

    return {
      success: true,
      items,
      rawText: text,
    };
  } catch (error) {
    logger.error("Document parsing error:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to parse document",
    };
  }
}

// Convert extracted items to the format needed for import
export interface DocumentImportItem extends ExtractedItem {
  id: string;
  selected: boolean;
}

export function convertToImportItems(
  items: ExtractedItem[],
): DocumentImportItem[] {
  return items.map((item, index) => ({
    ...item,
    id: `doc-${index + 1}`,
    selected: true,
  }));
}

// Helper to get category for memory storage
export function getCategoryForItem(item: ExtractedItem): AllowedCategory {
  return item.category as AllowedCategory;
}
