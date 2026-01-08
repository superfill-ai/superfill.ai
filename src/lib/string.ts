export const normalizeString = (str: string): string => {
  return str.toLowerCase().trim().replace(/\s+/g, " ");
};

export const normalizeFieldName = (fieldName: string): string => {
  if (!fieldName) return "";

  return fieldName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
};

export const CANONICAL_FIELD_QUESTIONS: Record<string, string> = {
  "first name": "first name",
  "given name": "first name",
  forename: "first name",
  "last name": "last name",
  surname: "last name",
  "family name": "last name",
  "full name": "full name",
  "your name": "full name",

  "email address": "email address",
  email: "email address",
  "e-mail": "email address",

  "phone number": "phone number",
  telephone: "phone number",
  mobile: "phone number",
  "cell phone": "phone number",

  "street address": "street address",
  "address line 1": "street address",
  address: "street address",
  city: "city",
  town: "city",
  state: "state",
  province: "state",
  "zip code": "zip code",
  "postal code": "zip code",
  country: "country",
};

export const getCanonicalQuestion = (question: string): string => {
  const normalized = normalizeString(question);
  return CANONICAL_FIELD_QUESTIONS[normalized] || normalized;
};
