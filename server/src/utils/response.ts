import type { Response } from "express";

export type ApiErrorPayload = {
  code: string;
  message: string;
  details?: unknown;
};

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>) {
  return res.json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function fail(
  res: Response,
  status: number,
  error: ApiErrorPayload,
) {
  return res.status(status).json({ success: false, error });
}

