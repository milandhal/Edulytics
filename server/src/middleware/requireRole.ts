import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";
import { fail } from "../utils/response.js";

export function requireRole(roles: Role | Role[]) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return fail(res, 401, { code: "TOKEN_MISSING", message: "Missing access token" });
    }
    if (!allowed.includes(req.user.role)) {
      return fail(res, 403, { code: "FORBIDDEN", message: "Forbidden" });
    }
    return next();
  };
}

