import { createLogger } from "@/lib/logger";
import type { AllowedCategory } from "@/types/memory";
import type {
  ResumeCertification,
  ResumeData,
  ResumeEducation,
  ResumeExperience,
  ResumeImportItem,
  ResumeParserResult,
  ResumeProject,
} from "@/types/resume";

const logger = createLogger("resume-parser");

// Common patterns for extracting information
const EMAIL_REGEX = /[\w.-]+@[\w.-]+\.\w+/gi;
const PHONE_REGEX = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
const LINKEDIN_REGEX = /(?:linkedin\.com\/in\/|linkedin:?\s*)([a-zA-Z0-9-]+)/gi;
const GITHUB_REGEX = /(?:github\.com\/|github:?\s*)([a-zA-Z0-9-]+)/gi;

// Section headers to identify different parts of the resume - more comprehensive patterns
const SECTION_HEADERS: Record<string, RegExp> = {
  experience:
    /^(?:work\s*)?experience|^employment(?:\s*history)?|^work\s*history|^professional\s*experience|^career\s*history/i,
  education:
    /^education(?:al\s*background)?|^academic(?:\s*background)?|^qualifications/i,
  skills:
    /^(?:technical\s*)?skills|^competencies|^expertise|^technologies|^core\s*competencies|^areas\s*of\s*expertise/i,
  summary:
    /^(?:professional\s*)?summary|^objective|^profile|^about(?:\s*me)?|^career\s*objective|^executive\s*summary/i,
  contact: /^contact(?:\s*info(?:rmation)?)?/i,
  certifications:
    /^certifications?|^certificates?|^licenses?(?:\s*&\s*certifications?)?|^professional\s*certifications?/i,
  languages: /^languages?(?:\s*spoken)?/i,
  projects:
    /^projects?|^portfolio|^personal\s*projects?|^key\s*projects?|^notable\s*projects?/i,
  achievements:
    /^achievements?|^accomplishments?|^awards?(?:\s*&\s*achievements?)?|^honors?(?:\s*&\s*awards?)?/i,
  publications: /^publications?|^research|^papers?/i,
  volunteer: /^volunteer(?:ing)?(?:\s*experience)?|^community\s*service/i,
  interests: /^interests?|^hobbies?/i,
  references: /^references?/i,
};

// Flatten for section detection
const ALL_SECTION_PATTERNS = Object.values(SECTION_HEADERS);

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export async function extractTextFromPDF(file: File): Promise<string> {
  // Dynamically import pdfjs-dist
  const pdfjsLib = await import("pdfjs-dist");

  // Set the worker source
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.mjs",
    import.meta.url,
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Group text items by their Y position to preserve line structure
    const items = textContent.items as TextItem[];
    const lineMap = new Map<number, TextItem[]>();

    for (const item of items) {
      if (!item.str) continue;
      // Round Y position to group items on same line (PDF coords have Y increasing upward)
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) {
        lineMap.set(y, []);
      }
      lineMap.get(y)?.push(item);
    }

    // Sort lines by Y position (descending since PDF Y goes up)
    const sortedYPositions = [...lineMap.keys()].sort((a, b) => b - a);

    for (const y of sortedYPositions) {
      const lineItems = lineMap.get(y);
      if (!lineItems) continue;
      // Sort items on the same line by X position
      lineItems.sort((a, b) => a.transform[4] - b.transform[4]);

      // Join items with appropriate spacing
      let lineText = "";
      let lastX = 0;
      for (const item of lineItems) {
        const x = item.transform[4];
        // Add space if there's a gap between items
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

    fullText += "\n"; // Page break
  }

  logger.debug("Extracted PDF text:\n", fullText.slice(0, 2000));
  return fullText;
}

function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

function extractPhones(text: string): string[] {
  const matches = text.match(PHONE_REGEX);
  return matches ? [...new Set(matches.map((p) => p.trim()))] : [];
}

function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

function extractLinkedIn(text: string): string | undefined {
  const match = text.match(LINKEDIN_REGEX);
  if (match) {
    // Try to get the full URL first
    const urlMatch = text.match(
      /https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+/i,
    );
    if (urlMatch) return urlMatch[0];
    return `https://linkedin.com/in/${match[1]}`;
  }
  return undefined;
}

function extractGitHub(text: string): string | undefined {
  const match = text.match(GITHUB_REGEX);
  if (match) {
    const urlMatch = text.match(
      /https?:\/\/(?:www\.)?github\.com\/[a-zA-Z0-9-]+/i,
    );
    if (urlMatch) return urlMatch[0];
    return `https://github.com/${match[1]}`;
  }
  return undefined;
}

function extractName(text: string): {
  name?: string;
  firstName?: string;
  lastName?: string;
} {
  // The name is usually at the very beginning of the resume
  const lines = text.split("\n").filter((line) => line.trim());

  // First non-empty line is often the name
  for (const line of lines.slice(0, 10)) {
    const trimmed = line.trim();
    // Skip if it looks like a section header or contains special characters
    if (
      trimmed.length > 2 &&
      trimmed.length < 50 &&
      !trimmed.includes("@") &&
      !trimmed.match(/^\d/) &&
      !trimmed.match(
        /^(resume|cv|curriculum|phone|email|address|linkedin|github)/i,
      ) &&
      !trimmed.match(/https?:\/\//i) &&
      !ALL_SECTION_PATTERNS.some((p) => p.test(trimmed))
    ) {
      // Check if it looks like a name (mostly letters and spaces)
      if (/^[A-Za-z\s.'-]+$/.test(trimmed)) {
        const parts = trimmed.split(/\s+/);
        if (parts.length >= 1 && parts.length <= 5) {
          return {
            name: trimmed,
            firstName: parts[0],
            lastName: parts.length > 1 ? parts.slice(1).join(" ") : undefined,
          };
        }
      }
    }
  }

  return {};
}

/**
 * Find all sections in the text and return their boundaries
 */
function findAllSections(
  text: string,
): Map<string, { start: number; end: number; content: string }> {
  const lines = text.split("\n");
  const sections = new Map<
    string,
    { start: number; end: number; content: string }
  >();
  const sectionStarts: Array<{
    name: string;
    lineIndex: number;
    charIndex: number;
  }> = [];

  let charIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineStart = charIndex;
    charIndex += lines[i].length + 1; // +1 for newline

    if (!line) continue;

    // Check if this line is a section header
    for (const [sectionName, pattern] of Object.entries(SECTION_HEADERS)) {
      if (pattern.test(line)) {
        sectionStarts.push({
          name: sectionName,
          lineIndex: i,
          charIndex: lineStart,
        });
        break;
      }
    }
  }

  // Extract content for each section
  for (let i = 0; i < sectionStarts.length; i++) {
    const current = sectionStarts[i];
    const next = sectionStarts[i + 1];

    const startLine = current.lineIndex + 1; // Skip header line
    const endLine = next ? next.lineIndex : lines.length;

    const content = lines.slice(startLine, endLine).join("\n").trim();

    sections.set(current.name, {
      start: current.charIndex,
      end: next ? next.charIndex : text.length,
      content,
    });
  }

  logger.debug("Found sections:", [...sections.keys()]);
  return sections;
}

function extractSection(
  text: string,
  sectionPattern: RegExp,
  _nextPatterns: RegExp[],
): string {
  const lines = text.split("\n");
  let inSection = false;
  const sectionContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!inSection) {
      // Check if this line starts the section we want
      if (sectionPattern.test(line)) {
        inSection = true;
      }
    } else {
      // Check if this line starts a new section (end of current section)
      const isNewSection = ALL_SECTION_PATTERNS.some((p) => p.test(line));
      if (isNewSection) {
        break;
      }
      sectionContent.push(lines[i]);
    }
  }

  return sectionContent.join("\n").trim();
}

// Date patterns for matching dates in resumes
const DATE_PATTERNS = [
  // "Jan 2020 - Present", "January 2020 - Dec 2023"
  /(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.,]?\s*\d{4}\s*[-–—to]+\s*(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[.,]?\s*\d{4}|Present|Current|Now|Ongoing)/gi,
  // "2020 - 2023", "2020 - Present"
  /\b\d{4}\s*[-–—to]+\s*(?:\d{4}|Present|Current|Now|Ongoing)\b/gi,
  // "01/2020 - 12/2023"
  /\d{1,2}\/\d{4}\s*[-–—to]+\s*(?:\d{1,2}\/\d{4}|Present|Current|Now|Ongoing)/gi,
];

function extractDates(text: string): {
  startDate?: string;
  endDate?: string;
  isCurrent: boolean;
} {
  for (const pattern of DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const dateStr = match[0];
      const parts = dateStr.split(/[-–—]|to/i).map((p) => p.trim());
      const isCurrent = /present|current|now|ongoing/i.test(parts[1] || "");
      return {
        startDate: parts[0],
        endDate: isCurrent ? "Present" : parts[1],
        isCurrent,
      };
    }
  }
  return { isCurrent: false };
}

function parseExperience(experienceText: string): ResumeExperience[] {
  const experiences: ResumeExperience[] = [];
  const lines = experienceText.split("\n").filter((l) => l.trim());

  if (lines.length === 0) return experiences;

  logger.debug("Parsing experience text:", experienceText.slice(0, 500));

  // Strategy: Look for entries that start with a job title or company name
  // Usually followed by dates, then bullet points

  let currentExp: ResumeExperience | null = null;
  let descriptionLines: string[] = [];

  const flushCurrentExp = () => {
    if (currentExp && (currentExp.title || currentExp.company)) {
      if (descriptionLines.length > 0) {
        currentExp.description = descriptionLines
          .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
          .filter(Boolean)
          .join("\n");
      }
      experiences.push(currentExp);
    }
    currentExp = null;
    descriptionLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check if this line contains a date range - might be start of new entry
    const dates = extractDates(line);
    const hasDate = dates.startDate || dates.endDate;

    // Check if line looks like a title/company line (not a bullet point)
    const isBulletPoint = /^[•\-*▪◦●○]/.test(line);
    const looksLikeHeader =
      !isBulletPoint &&
      line.length < 150 &&
      (hasDate ||
        /^[A-Z]/.test(line) ||
        /\b(?:Inc|LLC|Corp|Ltd|Company|Co\.|Technologies|Solutions|Engineer|Developer|Manager|Director|Lead|Senior|Junior|Intern|Analyst|Consultant|Specialist|Coordinator)\b/i.test(
          line,
        ));

    if (looksLikeHeader && !isBulletPoint) {
      // This might be a new entry
      // Check if next line also looks like header info (title or company)
      const nextLine = lines[i + 1]?.trim() || "";
      const nextHasDate = extractDates(nextLine).startDate;
      const nextIsBullet = /^[•\-*▪◦●○]/.test(nextLine);

      // If current line has date, it's likely "Title | Company | Date" format
      // If next line has date, current line is title/company, next is date
      if (hasDate || (!currentExp && !nextIsBullet)) {
        flushCurrentExp();

        currentExp = {
          title: "",
          company: "",
          ...dates,
        };

        // Try to parse "Title at Company" or "Title | Company" or "Title - Company"
        const lineWithoutDate = line
          .replace(DATE_PATTERNS[0], "")
          .replace(DATE_PATTERNS[1], "")
          .replace(DATE_PATTERNS[2], "")
          .trim();

        const titleCompanyMatch = lineWithoutDate.match(
          /^(.+?)\s*(?:at|@|\||[-–—,])\s*(.+?)$/i,
        );
        if (titleCompanyMatch) {
          currentExp.title = titleCompanyMatch[1].trim();
          currentExp.company = titleCompanyMatch[2].trim();
        } else {
          // Might be just title or just company
          currentExp.title = lineWithoutDate;
        }

        // Check next line for company name or additional info
        if (nextLine && !nextIsBullet && !nextHasDate) {
          const nextLineClean = nextLine
            .replace(DATE_PATTERNS[0], "")
            .replace(DATE_PATTERNS[1], "")
            .replace(DATE_PATTERNS[2], "")
            .trim();
          if (nextLineClean && !currentExp.company) {
            currentExp.company = nextLineClean;
            i++; // Skip next line
          } else if (nextLineClean && !currentExp.title) {
            currentExp.title = nextLineClean;
            i++;
          }
        }
      }
    } else if (isBulletPoint && currentExp) {
      // This is a description bullet point
      descriptionLines.push(line);
    } else if (currentExp && line.length > 20) {
      // Might be a continuation of description
      descriptionLines.push(line);
    }
  }

  flushCurrentExp();

  logger.debug("Parsed experiences:", experiences.length);
  return experiences;
}

function parseEducation(educationText: string): ResumeEducation[] {
  const educationList: ResumeEducation[] = [];
  const lines = educationText.split("\n").filter((l) => l.trim());

  if (lines.length === 0) return educationList;

  logger.debug("Parsing education text:", educationText.slice(0, 500));

  let currentEducation: ResumeEducation | null = null;
  let additionalInfo: string[] = [];

  const flushCurrentEducation = () => {
    if (
      currentEducation &&
      (currentEducation.school || currentEducation.degree)
    ) {
      if (additionalInfo.length > 0 && !currentEducation.activities) {
        currentEducation.activities = additionalInfo.join(", ");
      }
      educationList.push(currentEducation);
    }
    currentEducation = null;
    additionalInfo = [];
  };

  // School name patterns
  const schoolPattern =
    /University|College|Institute|School|Academy|Polytechnic|IIT|NIT|BITS|MIT|Stanford|Harvard|Berkeley|UCLA|IIIT/i;

  // Degree patterns
  const degreePattern =
    /Bachelor|Master|PhD|Ph\.D|Doctorate|B\.S\.?|B\.A\.?|M\.S\.?|M\.A\.?|B\.E\.?|M\.E\.?|B\.Tech|M\.Tech|MBA|BBA|B\.Com|M\.Com|Associate|Diploma|Certificate|BTech|MTech|BSc|MSc|BA|MA|BS|MS/i;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const isBulletPoint = /^[•\-*▪◦●○]/.test(line);
    const hasSchool = schoolPattern.test(line);
    const hasDegree = degreePattern.test(line);
    const dates = extractDates(line);
    const hasDate = dates.startDate || dates.endDate;

    // Check for GPA in line
    const gpaMatch = line.match(
      /(?:GPA|CGPA|Grade)[:\s]*(\d+\.?\d*)\s*(?:\/\s*(\d+\.?\d*))?/i,
    );

    // Start new education entry if we find a school or degree
    if ((hasSchool || hasDegree) && !isBulletPoint) {
      flushCurrentEducation();

      currentEducation = {
        school: "",
        ...dates,
      };

      // Try to extract school and degree from the line
      const lineWithoutDate = line
        .replace(DATE_PATTERNS[0], "")
        .replace(DATE_PATTERNS[1], "")
        .replace(DATE_PATTERNS[2], "")
        .trim();

      // Pattern: "Degree in Field from School" or "Degree - Field | School"
      const degreeFieldSchoolMatch = lineWithoutDate.match(
        /^(.+?(?:Bachelor|Master|PhD|B\.?S\.?|B\.?A\.?|M\.?S\.?|M\.?A\.?|B\.?Tech|M\.?Tech|MBA)[^,|]*)\s*(?:in|,|\||-)\s*(.+?)(?:\s*(?:from|at|\||-|,)\s*(.+))?$/i,
      );

      if (degreeFieldSchoolMatch) {
        currentEducation.degree = degreeFieldSchoolMatch[1]?.trim();
        currentEducation.fieldOfStudy = degreeFieldSchoolMatch[2]?.trim();
        if (degreeFieldSchoolMatch[3]) {
          currentEducation.school = degreeFieldSchoolMatch[3].trim();
        }
      } else if (hasSchool && !hasDegree) {
        // Line is just school name
        currentEducation.school = lineWithoutDate;
      } else if (hasDegree && !hasSchool) {
        // Line is just degree
        const degreeParts = lineWithoutDate.split(/\s+in\s+/i);
        currentEducation.degree = degreeParts[0]?.trim();
        if (degreeParts.length > 1) {
          currentEducation.fieldOfStudy = degreeParts[1]?.trim();
        }
      } else {
        // Both in same line - try to split
        const parts = lineWithoutDate.split(/[,|]/);
        for (const part of parts) {
          const trimmedPart = part.trim();
          if (schoolPattern.test(trimmedPart) && !currentEducation.school) {
            currentEducation.school = trimmedPart;
          } else if (
            degreePattern.test(trimmedPart) &&
            !currentEducation.degree
          ) {
            const degreeParts = trimmedPart.split(/\s+in\s+/i);
            currentEducation.degree = degreeParts[0]?.trim();
            if (degreeParts.length > 1) {
              currentEducation.fieldOfStudy = degreeParts[1]?.trim();
            }
          }
        }
      }

      if (gpaMatch) {
        currentEducation.gpa = gpaMatch[2]
          ? `${gpaMatch[1]}/${gpaMatch[2]}`
          : gpaMatch[1];
      }

      // Check next lines for additional info
      continue;
    }

    // Process lines after finding a school/degree
    if (currentEducation) {
      if (gpaMatch && !currentEducation.gpa) {
        currentEducation.gpa = gpaMatch[2]
          ? `${gpaMatch[1]}/${gpaMatch[2]}`
          : gpaMatch[1];
      }

      if (hasDate && !currentEducation.startDate) {
        currentEducation.startDate = dates.startDate;
        currentEducation.endDate = dates.endDate;
      }

      // Check if this line has school name we're missing
      if (!currentEducation.school && hasSchool) {
        currentEducation.school = line
          .replace(DATE_PATTERNS[0], "")
          .replace(DATE_PATTERNS[1], "")
          .replace(DATE_PATTERNS[2], "")
          .trim();
      }

      // Check if this line has degree we're missing
      if (!currentEducation.degree && hasDegree) {
        const degreeParts = line.split(/\s+in\s+/i);
        currentEducation.degree = degreeParts[0]?.trim();
        if (degreeParts.length > 1 && !currentEducation.fieldOfStudy) {
          currentEducation.fieldOfStudy = degreeParts[1]?.trim();
        }
      }

      // Bullet points are activities/achievements
      if (isBulletPoint) {
        additionalInfo.push(line.replace(/^[•\-*▪◦●○]\s*/, "").trim());
      }
    }
  }

  flushCurrentEducation();

  logger.debug("Parsed education:", educationList.length);
  return educationList;
}

function parseSkills(skillsText: string): string[] {
  const skills: string[] = [];

  if (!skillsText) return skills;

  logger.debug("Parsing skills text:", skillsText.slice(0, 500));

  // Remove common headers and labels
  const cleanText = skillsText
    .replace(/(?:technical\s+)?skills?:?/gi, "")
    .replace(/(?:programming\s+)?languages?:?/gi, "")
    .replace(/frameworks?:?/gi, "")
    .replace(/tools?:?/gi, "")
    .replace(/technologies?:?/gi, "")
    .replace(/databases?:?/gi, "")
    .replace(/platforms?:?/gi, "");

  // Split by common delimiters
  const items = cleanText.split(/[,;•|▪◦●○\n]+/);

  for (const item of items) {
    // Clean up the skill text
    const skill = item
      .trim()
      .replace(/^[-–—]\s*/, "") // Remove leading dashes
      .replace(/\s*[-–—]\s*$/, ""); // Remove trailing dashes

    // Skip empty, too short, or too long items
    if (skill.length < 2 || skill.length > 60) continue;

    // Skip if it looks like a category header
    if (
      /^(?:programming|languages|frameworks|tools|technologies|databases|platforms|soft\s*skills|hard\s*skills)$/i.test(
        skill,
      )
    )
      continue;

    // Skip dates and numbers
    if (/^\d+$/.test(skill) || /^\d{4}/.test(skill)) continue;

    // Add if not duplicate
    if (!skills.some((s) => s.toLowerCase() === skill.toLowerCase())) {
      skills.push(skill);
    }
  }

  logger.debug("Parsed skills:", skills.length);
  return skills;
}

function parseProjects(projectsText: string): ResumeProject[] {
  const projects: ResumeProject[] = [];
  const lines = projectsText.split("\n").filter((l) => l.trim());

  if (lines.length === 0) return projects;

  logger.debug("Parsing projects text:", projectsText.slice(0, 500));

  let currentProject: ResumeProject | null = null;
  let descriptionLines: string[] = [];

  const flushCurrentProject = () => {
    if (currentProject?.name) {
      if (descriptionLines.length > 0) {
        currentProject.description = descriptionLines
          .map((l) => l.replace(/^[•\-*▪◦●○]\s*/, "").trim())
          .filter(Boolean)
          .join("\n");
      }
      projects.push(currentProject);
    }
    currentProject = null;
    descriptionLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const isBulletPoint = /^[•\-*▪◦●○]/.test(line);
    const dates = extractDates(line);
    const hasDate = dates.startDate || dates.endDate;

    // Check if line looks like a project title (not a bullet, relatively short)
    const looksLikeTitle =
      !isBulletPoint && line.length < 100 && (/^[A-Z]/.test(line) || hasDate);

    if (looksLikeTitle && !isBulletPoint) {
      flushCurrentProject();

      const lineWithoutDate = line
        .replace(DATE_PATTERNS[0], "")
        .replace(DATE_PATTERNS[1], "")
        .replace(DATE_PATTERNS[2], "")
        .trim()
        .replace(/[|–—-]\s*$/, "")
        .trim();

      currentProject = {
        name: lineWithoutDate,
        ...dates,
      };

      // Check for URL in the line
      const urlMatch = line.match(URL_REGEX);
      if (urlMatch) {
        currentProject.url = urlMatch[0];
        currentProject.name = currentProject.name
          .replace(urlMatch[0], "")
          .trim();
      }

      // Check for technologies in parentheses or after colon
      const techMatch = line.match(/(?:\(|:)\s*([^)]+)\s*\)?$/);
      if (techMatch) {
        currentProject.technologies = techMatch[1]
          .split(/[,;]/)
          .map((t) => t.trim());
        currentProject.name = currentProject.name
          .replace(techMatch[0], "")
          .trim();
      }
    } else if (isBulletPoint && currentProject) {
      descriptionLines.push(line);
    } else if (currentProject && line.length > 20) {
      // Might be a continuation
      descriptionLines.push(line);
    }
  }

  flushCurrentProject();

  logger.debug("Parsed projects:", projects.length);
  return projects;
}

function parseAchievements(achievementsText: string): string[] {
  const achievements: string[] = [];
  const lines = achievementsText.split("\n").filter((l) => l.trim());

  if (lines.length === 0) return achievements;

  logger.debug("Parsing achievements text:", achievementsText.slice(0, 500));

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Remove bullet points
    const cleaned = trimmed.replace(/^[•\-*▪◦●○]\s*/, "").trim();

    if (cleaned.length > 10 && cleaned.length < 500) {
      achievements.push(cleaned);
    }
  }

  logger.debug("Parsed achievements:", achievements.length);
  return achievements;
}

function parseCertifications(
  certificationsText: string,
): ResumeCertification[] {
  const certifications: ResumeCertification[] = [];
  const lines = certificationsText.split("\n").filter((l) => l.trim());

  if (lines.length === 0) return certifications;

  logger.debug(
    "Parsing certifications text:",
    certificationsText.slice(0, 500),
  );

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) continue;

    // Remove bullet points
    const cleaned = trimmed.replace(/^[•\-*▪◦●○]\s*/, "").trim();

    const dates = extractDates(cleaned);
    const nameWithoutDate = cleaned
      .replace(DATE_PATTERNS[0], "")
      .replace(DATE_PATTERNS[1], "")
      .replace(DATE_PATTERNS[2], "")
      .trim();

    // Try to extract issuer (usually after a dash or pipe)
    const parts = nameWithoutDate.split(/\s*[-–—|]\s*/);

    certifications.push({
      name: parts[0]?.trim() || nameWithoutDate,
      issuer: parts[1]?.trim(),
      date: dates.startDate,
    });
  }

  logger.debug("Parsed certifications:", certifications.length);
  return certifications;
}

export function parseResumeText(text: string): ResumeData {
  logger.debug("Parsing resume text, length:", text.length);
  logger.debug("First 1000 chars:", text.slice(0, 1000));

  // Find all sections first
  const sections = findAllSections(text);

  // Extract basic info
  const { name, firstName, lastName } = extractName(text);
  const emails = extractEmails(text);
  const phones = extractPhones(text);
  const linkedin = extractLinkedIn(text);
  const github = extractGitHub(text);
  const urls = extractUrls(text).filter((candidate) => {
    try {
      const urlObj = new URL(candidate);
      const hostname = urlObj.hostname.toLowerCase();
      if (
        hostname === "linkedin.com" ||
        hostname.endsWith(".linkedin.com") ||
        hostname === "github.com" ||
        hostname.endsWith(".github.com")
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  });

  // Extract sections using both methods for robustness
  const experienceText =
    sections.get("experience")?.content ||
    extractSection(text, SECTION_HEADERS.experience, ALL_SECTION_PATTERNS);

  const educationText =
    sections.get("education")?.content ||
    extractSection(text, SECTION_HEADERS.education, ALL_SECTION_PATTERNS);

  const skillsText =
    sections.get("skills")?.content ||
    extractSection(text, SECTION_HEADERS.skills, ALL_SECTION_PATTERNS);

  const summaryText =
    sections.get("summary")?.content ||
    extractSection(text, SECTION_HEADERS.summary, ALL_SECTION_PATTERNS);

  const projectsText =
    sections.get("projects")?.content ||
    extractSection(text, SECTION_HEADERS.projects, ALL_SECTION_PATTERNS);

  const achievementsText =
    sections.get("achievements")?.content ||
    extractSection(text, SECTION_HEADERS.achievements, ALL_SECTION_PATTERNS);

  const certificationsText =
    sections.get("certifications")?.content ||
    extractSection(text, SECTION_HEADERS.certifications, ALL_SECTION_PATTERNS);

  // Parse structured data
  const experience = parseExperience(experienceText);
  const education = parseEducation(educationText);
  const skills = parseSkills(skillsText);
  const projects = parseProjects(projectsText);
  const achievements = parseAchievements(achievementsText);
  const certifications = parseCertifications(certificationsText);

  // Try to extract location from contact area or near name
  // More comprehensive location patterns
  const locationPatterns = [
    // "City, State" or "City, State ZIP"
    /(?:^|\n)([A-Z][a-zA-Z\s]+,\s*[A-Z]{2}(?:\s+\d{5})?)/m,
    // "City, Country"
    /(?:^|\n)([A-Z][a-zA-Z\s]+,\s*[A-Z][a-zA-Z\s]+)/m,
    // Location near contact info
    /(?:location|address|based\s*in)[:\s]*([A-Za-z\s,]+)/i,
  ];

  let location: string | undefined;
  for (const pattern of locationPatterns) {
    const match = text.match(pattern);
    if (match) {
      location = match[1].trim();
      break;
    }
  }

  const result: ResumeData = {
    name,
    firstName,
    lastName,
    email: emails[0],
    phone: phones[0],
    location,
    website: urls[0],
    linkedin,
    github,
    summary: summaryText || undefined,
    experience,
    education,
    skills,
    projects,
    achievements,
    certifications,
  };

  logger.debug("Parsed resume data:", {
    name: result.name,
    email: result.email,
    experienceCount: result.experience.length,
    educationCount: result.education.length,
    skillsCount: result.skills.length,
    projectsCount: result.projects?.length || 0,
    achievementsCount: result.achievements?.length || 0,
    certificationsCount: result.certifications?.length || 0,
  });

  return result;
}

export async function parseResumePDF(file: File): Promise<ResumeParserResult> {
  try {
    logger.debug("Starting PDF parsing for:", file.name);

    const text = await extractTextFromPDF(file);
    logger.debug("Extracted text length:", text.length);

    if (!text || text.trim().length < 50) {
      return {
        success: false,
        error:
          "Could not extract text from PDF. The file might be image-based or protected.",
      };
    }

    const data = parseResumeText(text);

    return {
      success: true,
      data,
      rawText: text,
    };
  } catch (error) {
    logger.error("PDF parsing error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to parse PDF",
    };
  }
}

export function convertResumeToImportItems(
  data: ResumeData,
): ResumeImportItem[] {
  const items: ResumeImportItem[] = [];
  let idCounter = 0;

  const createItem = (
    label: string,
    question: string,
    answer: string,
    category: AllowedCategory,
    tags: string[],
    source: ResumeImportItem["source"],
  ): ResumeImportItem => ({
    id: `resume-${++idCounter}`,
    label,
    question,
    answer,
    category,
    tags,
    selected: true,
    source,
  });

  // Name
  if (data.name) {
    items.push(
      createItem(
        "Full Name",
        "What is your full name?",
        data.name,
        "personal",
        ["name", "personal"],
        "name",
      ),
    );
  }

  if (data.firstName) {
    items.push(
      createItem(
        "First Name",
        "What is your first name?",
        data.firstName,
        "personal",
        ["name", "personal", "first-name"],
        "name",
      ),
    );
  }

  if (data.lastName) {
    items.push(
      createItem(
        "Last Name",
        "What is your last name?",
        data.lastName,
        "personal",
        ["name", "personal", "last-name"],
        "name",
      ),
    );
  }

  // Contact
  if (data.email) {
    items.push(
      createItem(
        "Email",
        "What is your email address?",
        data.email,
        "contact",
        ["email", "contact"],
        "contact",
      ),
    );
  }

  if (data.phone) {
    items.push(
      createItem(
        "Phone",
        "What is your phone number?",
        data.phone,
        "contact",
        ["phone", "contact"],
        "contact",
      ),
    );
  }

  if (data.location) {
    items.push(
      createItem(
        "Location",
        "Where are you located?",
        data.location,
        "location",
        ["location", "address"],
        "contact",
      ),
    );
  }

  if (data.website) {
    items.push(
      createItem(
        "Website",
        "What is your website?",
        data.website,
        "contact",
        ["website", "url", "contact"],
        "contact",
      ),
    );
  }

  if (data.linkedin) {
    items.push(
      createItem(
        "LinkedIn",
        "What is your LinkedIn profile?",
        data.linkedin,
        "contact",
        ["linkedin", "social", "contact"],
        "contact",
      ),
    );
  }

  if (data.github) {
    items.push(
      createItem(
        "GitHub",
        "What is your GitHub profile?",
        data.github,
        "contact",
        ["github", "social", "contact"],
        "contact",
      ),
    );
  }

  // Summary
  if (data.summary) {
    items.push(
      createItem(
        "Professional Summary",
        "Tell me about yourself",
        data.summary,
        "personal",
        ["summary", "bio", "about"],
        "summary",
      ),
    );
  }

  // Experience
  const currentJob = data.experience.find((exp) => exp.isCurrent);
  if (currentJob) {
    if (currentJob.title) {
      items.push(
        createItem(
          "Current Job Title",
          "What is your current job title?",
          currentJob.title,
          "work",
          ["job", "title", "current"],
          "experience",
        ),
      );
    }

    if (currentJob.company) {
      items.push(
        createItem(
          "Current Company",
          "Where do you currently work?",
          currentJob.company,
          "work",
          ["company", "employer", "current"],
          "experience",
        ),
      );
    }
  }

  // All experience entries
  data.experience.forEach((exp, index) => {
    const prefix = exp.isCurrent ? "Current" : `Previous (${index + 1})`;
    const dateRange = [exp.startDate, exp.endDate].filter(Boolean).join(" - ");

    const experienceText = [
      exp.title,
      exp.company && `at ${exp.company}`,
      dateRange && `(${dateRange})`,
      exp.location,
    ]
      .filter(Boolean)
      .join(" ");

    if (experienceText) {
      items.push(
        createItem(
          `${prefix} Experience`,
          `Describe your ${prefix.toLowerCase()} work experience`,
          experienceText,
          "work",
          ["experience", "work", exp.isCurrent ? "current" : "previous"],
          "experience",
        ),
      );
    }
  });

  // Education
  data.education.forEach((edu, index) => {
    const educationText = [
      edu.degree,
      edu.fieldOfStudy && `in ${edu.fieldOfStudy}`,
      edu.school && `from ${edu.school}`,
      edu.startDate && edu.endDate && `(${edu.startDate} - ${edu.endDate})`,
      edu.gpa && `GPA: ${edu.gpa}`,
    ]
      .filter(Boolean)
      .join(" ");

    if (educationText) {
      items.push(
        createItem(
          `Education ${index + 1}`,
          "Describe your educational background",
          educationText,
          "education",
          ["education", "school", "degree"],
          "education",
        ),
      );
    }

    if (edu.school) {
      items.push(
        createItem(
          `School/University ${index + 1}`,
          "What school or university did you attend?",
          edu.school,
          "education",
          ["school", "university", "education"],
          "education",
        ),
      );
    }

    if (edu.degree) {
      items.push(
        createItem(
          `Degree ${index + 1}`,
          "What degree did you earn?",
          edu.degree,
          "education",
          ["degree", "education"],
          "education",
        ),
      );
    }

    if (edu.fieldOfStudy) {
      items.push(
        createItem(
          `Field of Study ${index + 1}`,
          "What was your field of study or major?",
          edu.fieldOfStudy,
          "education",
          ["major", "field", "education"],
          "education",
        ),
      );
    }
  });

  // Skills
  if (data.skills.length > 0) {
    items.push(
      createItem(
        "Skills",
        "What are your professional skills?",
        data.skills.join(", "),
        "personal",
        ["skills", "abilities"],
        "skills",
      ),
    );

    // Top 10 individual skills
    data.skills.slice(0, 10).forEach((skill) => {
      items.push(
        createItem(
          `Skill: ${skill}`,
          `Do you have experience with ${skill}?`,
          skill,
          "personal",
          ["skill", skill.toLowerCase()],
          "skills",
        ),
      );
    });
  }

  // Projects
  if (data.projects && data.projects.length > 0) {
    data.projects.forEach((project, index) => {
      const projectText = [
        project.name,
        project.technologies?.length && `(${project.technologies.join(", ")})`,
        project.description,
        project.url && `URL: ${project.url}`,
      ]
        .filter(Boolean)
        .join(" - ");

      if (projectText) {
        items.push(
          createItem(
            `Project ${index + 1}: ${project.name}`,
            "Describe a project you've worked on",
            projectText,
            "work",
            ["project", "portfolio"],
            "projects",
          ),
        );
      }

      if (project.description) {
        items.push(
          createItem(
            `Project Description: ${project.name}`,
            `Describe your ${project.name} project`,
            project.description,
            "work",
            ["project", "description"],
            "projects",
          ),
        );
      }
    });

    // Combined projects list
    const allProjectNames = data.projects.map((p) => p.name).join(", ");
    items.push(
      createItem(
        "All Projects",
        "List your notable projects",
        allProjectNames,
        "work",
        ["projects", "portfolio"],
        "projects",
      ),
    );
  }

  // Achievements
  if (data.achievements && data.achievements.length > 0) {
    data.achievements.forEach((achievement, index) => {
      items.push(
        createItem(
          `Achievement ${index + 1}`,
          "Describe an achievement or accomplishment",
          achievement,
          "personal",
          ["achievement", "accomplishment", "award"],
          "achievements",
        ),
      );
    });

    // Combined achievements
    items.push(
      createItem(
        "All Achievements",
        "List your achievements and accomplishments",
        data.achievements.join("\n"),
        "personal",
        ["achievements", "accomplishments"],
        "achievements",
      ),
    );
  }

  // Certifications
  if (data.certifications && data.certifications.length > 0) {
    data.certifications.forEach((cert, index) => {
      const certText = [
        cert.name,
        cert.issuer && `by ${cert.issuer}`,
        cert.date,
      ]
        .filter(Boolean)
        .join(" - ");

      items.push(
        createItem(
          `Certification ${index + 1}: ${cert.name}`,
          "List your professional certifications",
          certText,
          "education",
          ["certification", "certificate", "license"],
          "certifications",
        ),
      );
    });

    // Combined certifications
    const allCerts = data.certifications.map((c) => c.name).join(", ");
    items.push(
      createItem(
        "All Certifications",
        "What certifications do you have?",
        allCerts,
        "education",
        ["certifications", "certificates"],
        "certifications",
      ),
    );
  }

  return items;
}
