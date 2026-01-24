export interface CsvOptions {
  delimiter?: string;
  quote?: string;
  escape?: string;
  lineBreak?: string;
}

const DEFAULT_OPTIONS: Required<CsvOptions> = {
  delimiter: ",",
  quote: '"',
  escape: '"',
  lineBreak: "\n",
};

function escapeField(value: string, options: Required<CsvOptions>): string {
  const { delimiter, quote, escape: escapeChar } = options;

  if (
    value.includes(delimiter) ||
    value.includes(quote) ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    const escaped = value.replace(new RegExp(quote, "g"), escapeChar + quote);
    return quote + escaped + quote;
  }

  return value;
}

export function stringifyToCSV<T extends Record<string, unknown>>(
  data: T[],
  headers: (keyof T)[],
  options: CsvOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { delimiter, lineBreak } = opts;

  const headerRow = headers
    .map((h) => escapeField(String(h), opts))
    .join(delimiter);

  const dataRows = data.map((row) => {
    return headers
      .map((header) => {
        const value = row[header];

        if (value === null || value === undefined) {
          return "";
        }

        if (Array.isArray(value)) {
          return escapeField(value.join(";"), opts);
        }

        return escapeField(String(value), opts);
      })
      .join(delimiter);
  });

  return [headerRow, ...dataRows].join(lineBreak);
}

export function parseCSV<T extends Record<string, unknown>>(
  csvString: string,
  options: CsvOptions = {},
): T[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { delimiter, quote } = opts;

  const lines = csvString.split(/\r?\n/).filter((line) => line.trim());

  if (lines.length === 0) {
    return [];
  }

  const headers = parseLine(lines[0], delimiter, quote);

  const data: T[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i], delimiter, quote);

    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      const value = values[index] || "";

      if (value.includes(";")) {
        row[header] = value
          .split(";")
          .map((v) => v.trim())
          .filter(Boolean);
      } else {
        row[header] = value;
      }
    });

    data.push(row as T);
  }

  return data;
}

function parseLine(line: string, delimiter: string, quote: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === quote) {
      if (inQuotes && nextChar === quote) {
        current += quote;
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());

  return result;
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export function readCSVFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") {
        resolve(text);
      } else {
        reject(new Error("Failed to read file as text"));
      }
    };

    reader.onerror = () => {
      reject(new Error("Failed to read file"));
    };

    reader.readAsText(file);
  });
}
