import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../utils/env.js";
import { fail } from "../utils/response.js";

export type AuthUser = { id: string; email: string; role: "SUPER_ADMIN" | "ADMIN" | "FACULTY" };

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

type JwtPayload = {
  sub: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "FACULTY";
  iat: number;
  exp: number;
};

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    return fail(res, 401, { code: "TOKEN_MISSING", message: "Missing access token" });
  }

  const token = header.slice("Bearer ".length).trim();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    return next();
  } catch (e: unknown) {
    if (e instanceof (jwt as any).TokenExpiredError) {
      return fail(res, 401, { code: "TOKEN_EXPIRED", message: "Access token expired" });
    }
    return fail(res, 401, { code: "TOKEN_INVALID", message: "Invalid access token" });
  }
}

