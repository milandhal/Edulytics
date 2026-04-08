import { Prisma, SubjectType } from "@prisma/client";
import * as XLSX from "xlsx";

import { ApiError } from "../middleware/errorHandler.js";

export type UploadType = "STUDENTS" | "SUBJECTS" | "FACULTY";

export type UploadErrorRow = {
  row: number;
  identifier?: string;
  reason: string;
};

export type ParsedRow = Record<string, string>;

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normalizeCell(value: unknown) {
  if (value == null) {
    return "";
  }

  return String(value).trim();
}

export function ensureUploadFile(file?: Express.Multer.File) {
  if (!file) {
    throw new ApiError({
      status: 400,
      code: "FILE_REQUIRED",
      message: "A CSV or XLSX file is required",
    });
  }
}

export function parseSpreadsheetRows(file: Express.Multer.File) {
  let workbook: XLSX.WorkBook;

  try {
    workbook = XLSX.read(file.buffer, { type: "buffer" });
  } catch (error) {
    throw new ApiError({
      status: 400,
      code: "INVALID_FILE_FORMAT",
      message: "Unable to read the uploaded file. Please use a valid CSV or XLSX file.",
      details: error instanceof Error ? error.message : undefined,
    });
  }

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new ApiError({
      status: 400,
      code: "EMPTY_FILE",
      message: "The uploaded file does not contain any sheets",
    });
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Array<unknown>>(worksheet, {
    header: 1,
    blankrows: false,
    defval: "",
    raw: false,
  });

  if (rows.length === 0) {
    return { headers: [] as string[], rows: [] as ParsedRow[] };
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map(normalizeHeader);

  return {
    headers,
    rows: dataRows
      .map((row) => {
        const parsed: ParsedRow = {};
        headers.forEach((header, index) => {
          parsed[header] = normalizeCell(row[index]);
        });
        return parsed;
      })
      .filter((row) => Object.values(row).some((value) => value !== "")),
  };
}

export function assertRequiredHeaders(headers: string[], requiredHeaders: string[]) {
  const missingHeaders = requiredHeaders.filter((header) => !headers.includes(header));

  if (missingHeaders.length > 0) {
    throw new ApiError({
      status: 400,
      code: "INVALID_FILE_HEADERS",
      message: `Missing required columns: ${missingHeaders.join(", ")}`,
    });
  }
}

export function normalizeOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function parseIntegerField(value: string, fieldName: string) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${fieldName} must be an integer`);
  }

  return parsed;
}

export function parseDecimalField(value: string, fieldName: string) {
  const parsed = Number.parseFloat(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a number`);
  }

  return new Prisma.Decimal(parsed.toString());
}

export function parseSubjectType(value: string) {
  const normalized = value.trim().toUpperCase();

  if (!normalized) {
    throw new Error("type is required");
  }

  if (!Object.values(SubjectType).includes(normalized as SubjectType)) {
    throw new Error(`type must be one of ${Object.values(SubjectType).join(", ")}`);
  }

  return normalized as SubjectType;
}

export function createUploadHistoryMetadata(input: {
  filename: string;
  rowCount: number;
  successCount: number;
  errorCount: number;
  type: UploadType;
}) {
  return {
    filename: input.filename,
    rowCount: input.rowCount,
    successCount: input.successCount,
    errorCount: input.errorCount,
    uploadedAt: new Date().toISOString(),
    uploadedBy: null,
    type: input.type,
    status: "DONE",
  };
}
