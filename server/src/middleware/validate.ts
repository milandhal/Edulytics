import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!result.success) {
      return next(result.error);
    }
    // Keep original req objects; handlers can re-parse body subsets if needed.
    return next();
  };
}

