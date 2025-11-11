import { createLogger } from "@/lib/logger";
import type {
  CompressedFieldData,
  CompressedMemoryData,
  FieldMapping,
} from "@/types/autofill";
import {
  FIELD_PURPOSE_KEYWORDS,
  MIN_MATCH_CONFIDENCE,
  STOP_WORDS,
} from "./constants";
import { createEmptyMapping, roundConfidence } from "./mapping-utils";
import type { WebsiteContext } from "@/types/context";


const logger = createLogger("fallback-matcher");

export class FallbackMatcher {
  async matchFields(
    fields: CompressedFieldData[],
    memories: CompressedMemoryData[],
  ): Promise<FieldMapping[]> {
    const startTime = performance.now();

    try {
      const mappings = fields.map((field) =>
        this.matchSingleField(field, memories),
      );

      const elapsed = performance.now() - startTime;
      logger.info(
        `Fallback matching completed in ${elapsed.toFixed(2)}ms for ${fields.length} fields`,
      );

      return mappings;
    } catch (error) {
      logger.error("Fallback matching failed:", error);
      return fields.map((field) =>
        createEmptyMapping<CompressedFieldData, FieldMapping>(
          field,
          "Fallback matching error",
        ),
      );
    }
  }

  private matchSingleField(
    field: CompressedFieldData,
    memories: CompressedMemoryData[],
  ): FieldMapping {
    if (memories.length === 0) {
      return createEmptyMapping<CompressedFieldData, FieldMapping>(
        field,
        "No memories available",
      );
    }

    const candidates = memories
      .map((memory) => ({
        memory,
        score: this.calculateMatchScore(field, memory),
        reasons: this.buildMatchReasons(field, memory),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score);

    if (candidates.length === 0) {
      return createEmptyMapping<CompressedFieldData, FieldMapping>(
        field,
        "No matching memory found",
      );
    }

    const bestCandidate = candidates[0];
    const confidence = roundConfidence(bestCandidate.score);

    const alternativeMatches = candidates.slice(1, 4).map((candidate) => ({
      memoryId: candidate.memory.id,
      value: candidate.memory.answer,
      confidence: roundConfidence(candidate.score),
    }));

    if (confidence < MIN_MATCH_CONFIDENCE) {
      return {
        fieldOpid: field.opid,
        memoryId: null,
        value: null,
        confidence,
        reasoning: `Low confidence match (${(confidence * 100).toFixed(0)}%). ${bestCandidate.reasons.join(" · ")}`,
        alternativeMatches,
      };
    }

    return {
      fieldOpid: field.opid,
      memoryId: bestCandidate.memory.id,
      value: bestCandidate.memory.answer,
      confidence,
      reasoning: bestCandidate.reasons.join(" · "),
      alternativeMatches,
    };
  }

  private calculateMatchScore(
    field: CompressedFieldData,
    memory: CompressedMemoryData,
  ): number {
    const purposeScore = this.scorePurposeMatch(field, memory) * 0.4;
    const contextScore = this.scoreContextSimilarity(field, memory) * 0.3;
    const categoryScore = this.scoreCategoryMatch(field, memory) * 0.2;
    const labelScore = this.scoreLabelOverlap(field, memory) * 0.1;

    return Math.min(
      1,
      purposeScore + contextScore + categoryScore + labelScore,
    );
  }

  private scorePurposeMatch(
    field: CompressedFieldData,
    memory: CompressedMemoryData,
  ): number {
    if (field.purpose === "unknown") {
      return 0;
    }

    const keywords = FIELD_PURPOSE_KEYWORDS[field.purpose] || [];
    const memoryText = `${memory.question} ${memory.category}`.toLowerCase();

    const matchedKeywords = keywords.filter((keyword) =>
      memoryText.includes(keyword.toLowerCase()),
    );

    if (matchedKeywords.length === 0) {
      return 0;
    }

    return Math.min(1, 0.6 + matchedKeywords.length * 0.2);
  }

  private scoreContextSimilarity(
    field: CompressedFieldData,
    memory: CompressedMemoryData,
  ): number {
    if (!field.context || !memory.question) {
      return 0;
    }

    const fieldContext = field.context.toLowerCase();
    const memoryQuestion = memory.question.toLowerCase();

    const fieldTokens = this.tokenize(fieldContext);
    const memoryTokens = this.tokenize(memoryQuestion);
    const overlap = this.computeTokenOverlap(fieldTokens, memoryTokens);

    if (overlap === 0) {
      return 0;
    }

    const union = new Set([...fieldTokens, ...memoryTokens]);
    return overlap / union.size;
  }

  private scoreCategoryMatch(
    field: CompressedFieldData,
    memory: CompressedMemoryData,
  ): number {
    const fieldLabels = field.labels.join(" ").toLowerCase();
    const category = memory.category.toLowerCase();

    if (fieldLabels.includes(category)) {
      return 0.8;
    }

    const categoryTokens = this.tokenize(category);
    const labelTokens = this.tokenize(fieldLabels);
    const overlap = this.computeTokenOverlap(categoryTokens, labelTokens);

    return overlap > 0 ? Math.min(0.6, overlap * 0.3) : 0;
  }

  private scoreLabelOverlap(
    field: CompressedFieldData,
    memory: CompressedMemoryData,
  ): number {
    const fieldText = field.labels.join(" ").toLowerCase();
    const memoryText = `${memory.question} ${memory.answer}`.toLowerCase();

    const fieldTokens = this.tokenize(fieldText);
    const memoryTokens = this.tokenize(memoryText);

    const overlap = this.computeTokenOverlap(fieldTokens, memoryTokens);

    return overlap > 0 ? Math.min(1, overlap * 0.5) : 0;
  }

  private buildMatchReasons(
    field: CompressedFieldData,
    memory: CompressedMemoryData,
  ): string[] {
    const reasons: string[] = [];

    if (field.purpose !== "unknown") {
      const keywords = FIELD_PURPOSE_KEYWORDS[field.purpose] || [];
      const memoryText = `${memory.question} ${memory.category}`.toLowerCase();
      const matchedKeywords = keywords.filter((kw) =>
        memoryText.includes(kw.toLowerCase()),
      );

      if (matchedKeywords.length > 0) {
        reasons.push(`Purpose "${field.purpose}" matches memory context`);
      }
    }

    if (
      field.labels
        .join(" ")
        .toLowerCase()
        .includes(memory.category.toLowerCase())
    ) {
      reasons.push(`Category "${memory.category}" found in field labels`);
    }

    if (field.context && memory.question) {
      const fieldTokens = this.tokenize(field.context.toLowerCase());
      const memoryTokens = this.tokenize(memory.question.toLowerCase());
      const overlap = this.computeTokenOverlap(fieldTokens, memoryTokens);

      if (overlap > 0) {
        reasons.push(`${overlap} shared keywords with memory question`);
      }
    }

    if (reasons.length === 0) {
      reasons.push("Weak match based on partial context overlap");
    }

    return reasons;
  }

  private tokenize(text: string): Set<string> {
    const tokens = new Set<string>();
    const words = text.toLowerCase().split(/[^a-z0-9]+/);

    for (const word of words) {
      if (word.length < 2) continue;
      if (STOP_WORDS.has(word)) continue;
      tokens.add(word);
    }

    return tokens;
  }

  private computeTokenOverlap(setA: Set<string>, setB: Set<string>): number {
    let count = 0;
    for (const token of setA) {
      if (setB.has(token)) {
        count++;
      }
    }
    return count;
  }
}
