const normalizePart = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

export const buildContentHashInput = (
  question: string | undefined,
  answer: string,
  category: string,
): string => {
  const normalizedQuestion = normalizePart(question ?? "");
  const normalizedAnswer = normalizePart(answer);
  const normalizedCategory = normalizePart(category);

  return `${normalizedQuestion}||${normalizedAnswer}||${normalizedCategory}`;
};

const bufferToHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

export const computeContentHash = async (
  question: string | undefined,
  answer: string,
  category: string,
): Promise<string> => {
  const input = buildContentHashInput(question, answer, category);
  const bytes = new TextEncoder().encode(input);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", bytes);

  return bufferToHex(hashBuffer);
};
