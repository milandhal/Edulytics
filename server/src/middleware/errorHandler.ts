import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { fail } from "../utils/response.js";

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(opts: { status: number; code: string; message: string; details?: unknown }) {
    super(opts.message);
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
  }
}

export function notFound(_req: Request, res: Response) {
  return fail(res, 404, { code: "NOT_FOUND", message: "Route not found" });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    console.error(`[ApiError] ${err.status} - ${err.code}: ${err.message}`, err.details ?? '');
    return fail(res, err.status, {
      code: err.code,
      message: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
  }

  if (err instanceof ZodError) {
    return fail(res, 422, {
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: err.flatten(),
    });
  }

  console.error(err);
  return fail(res, 500, { code: "INTERNAL_SERVER_ERROR", message: "Unexpected error" });
}

