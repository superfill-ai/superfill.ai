import { generateObject } from "ai";
import { z } from "zod";
import { getAIModel } from "@/lib/ai/model-factory";
import { createLogger } from "@/lib/logger";
import { getKeyVaultService } from "@/lib/security/key-vault-service";
import { storage } from "@/lib/storage";
import type { AllowedCategory } from "@/types/memory";
import type { ProfileImportItem } from "@/types/profile";

const logger = createLogger("profile-parser");

const ProfileExtractedSchema = z.object({
  items: z.array(
    z.object({
      label: z.string().describe("Short label for this information"),
      question: z.string().describe("A form question this would answer"),
      answer: z.string().describe("The extracted information"),
      category: z
        .enum([
          "personal",
          "contact",
          "location",
          "work",
          "education",
          "general",
        ])
        .describe("Category for this information"),
      tags: z
        .array(z.string())
        .describe("Relevant tags for searching (lowercase)"),
    }),
  ),
});

type ExtractedItem = z.infer<typeof ProfileExtractedSchema>["items"][number];

const PROFILE_PARSING_PROMPT = `You are an intelligent profile parser for a form auto-fill application. You're parsing content from a web page (could be LinkedIn, GitHub, Twitter, a personal portfolio, or any profile page). Your job is to extract useful personal and professional information that could help fill out forms automatically.

Extract ANY information that could be useful for filling forms, such as:
- Personal details (full name, first name, last name, username/handle)
- Professional headline/title/bio
- Contact info (email, phone, website)
- Location (city, country)
- About/bio/summary/description
- Work history (job titles, companies, dates, descriptions)
- Current position/role
- Education (schools, degrees, fields of study, dates)
- Skills, technologies, and expertise
- Projects and repositories (for developer profiles)
- Certifications
- Languages spoken
- Social profile URLs (GitHub, Twitter, LinkedIn, personal website, etc.)
- Followers/following counts (if relevant)
- Any other personal or professional details

Guidelines:
1. Extract as many useful pieces of information as you can find
2. Create clear, searchable labels and questions
3. Keep answers concise but complete
4. Use appropriate categories: personal, contact, location, work, education, or general
5. Add relevant lowercase tags for each item
6. For work experience, extract both combined entries AND individual details (current job title, current company separately)
7. For education, extract both combined entries AND individual fields
8. The page may have a "LINKS FOUND ON PAGE" section - use these for social profiles, websites, emails, phone numbers
9. Look for patterns like github.com, linkedin.com, twitter.com, email addresses, phone numbers
10. For developer profiles (GitHub, etc.), extract repos, contributions, tech stack
11. Ignore navigation links, ads, and irrelevant page elements
12. If the page seems to be a login page or error page, extract nothing

Be thorough - users want to capture as much useful information as possible from their profile pages.`;

export async function parseProfileWithAI(
  pageContent: string,
): Promise<ExtractedItem[]> {
  const trimmedContent = pageContent.trim();
  if (!trimmedContent || trimmedContent.length < 50) {
    logger.debug("Page content too short, skipping AI parsing");
    return [];
  }

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

  logger.debug("Parsing profile with AI, content length:", pageContent.length);

  const { object } = await generateObject({
    model,
    schema: ProfileExtractedSchema,
    schemaName: "ProfileExtractedInfo",
    schemaDescription:
      "Information extracted from a profile page for form filling",
    system: PROFILE_PARSING_PROMPT,
    prompt: `Extract all useful personal and professional information from this profile page:\n\n${pageContent}`,
    temperature: 0.1,
  });

  logger.debug("AI extracted items from profile:", object.items.length);
  return object.items;
}

export function convertToImportItems(
  items: ExtractedItem[],
): ProfileImportItem[] {
  return items.map((item, index) => ({
    id: `profile-${index + 1}`,
    label: item.label,
    question: item.question,
    answer: item.answer,
    category: item.category as AllowedCategory,
    tags: item.tags,
    selected: true,
  }));
}
