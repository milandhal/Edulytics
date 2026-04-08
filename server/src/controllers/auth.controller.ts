import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { StringValue } from "ms";
import { env } from "../utils/env.js";
import { prisma } from "../utils/prisma.js";
import { ok } from "../utils/response.js";
import { ApiError } from "../middleware/errorHandler.js";

function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function signAccessToken(user: { id: string; email: string; role: "SUPER_ADMIN" | "ADMIN" | "FACULTY" }) {
  const expiresIn = env.ACCESS_TOKEN_TTL as unknown as StringValue;
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, env.JWT_SECRET, { expiresIn });
}

function serializeAuthUser(user: {
  id: string;
  name: string;
  email: string;
  role: "SUPER_ADMIN" | "ADMIN" | "FACULTY";
  department?: string | null;
  mustChangePassword: boolean;
}) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    department: user.department ?? undefined,
    mustChangePassword: user.mustChangePassword,
  };
}

function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: "/api/v1/auth",
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie("refreshToken", { path: "/api/v1/auth" });
}

export const AuthController = {
  async login(req: Request, res: Response) {
    const { email, password } = req.body as { email: string; password: string };

    const user = await prisma.user.findFirst({
      where: { email, deletedAt: null, isActive: true },
      select: { id: true, name: true, email: true, passwordHash: true, role: true, department: true, mustChangePassword: true },
    });
    if (!user) throw new ApiError({ status: 401, code: "INVALID_CREDENTIALS", message: "Invalid credentials" });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) throw new ApiError({ status: 401, code: "INVALID_CREDENTIALS", message: "Invalid credentials" });

    const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role });

    const refreshToken = crypto.randomBytes(48).toString("base64url");
    const tokenHash = sha256(refreshToken);
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: { userId: user.id, tokenHash, expiresAt, isRevoked: false },
    });

    setRefreshCookie(res, refreshToken);
    return ok(res, { accessToken, user: serializeAuthUser(user) });
  },

  async refresh(req: Request, res: Response) {
    const raw = req.cookies?.refreshToken as string | undefined;
    if (!raw) throw new ApiError({ status: 401, code: "REFRESH_TOKEN_INVALID", message: "Missing refresh token" });

    const tokenHash = sha256(raw);
    const token = await prisma.refreshToken.findFirst({
      where: { tokenHash, isRevoked: false, expiresAt: { gt: new Date() } },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            department: true,
            mustChangePassword: true,
            deletedAt: true,
            isActive: true,
          },
        },
      },
    });
    if (!token?.user || token.user.deletedAt !== null || !token.user.isActive) {
      throw new ApiError({ status: 401, code: "REFRESH_TOKEN_INVALID", message: "Invalid refresh token" });
    }

    // Rotate: revoke old token, issue new one.
    await prisma.refreshToken.update({ where: { id: token.id }, data: { isRevoked: true } });

    const newRefreshToken = crypto.randomBytes(48).toString("base64url");
    const newHash = sha256(newRefreshToken);
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await prisma.refreshToken.create({
      data: { userId: token.user.id, tokenHash: newHash, expiresAt, isRevoked: false },
    });

    const accessToken = signAccessToken({ id: token.user.id, email: token.user.email, role: token.user.role });
    setRefreshCookie(res, newRefreshToken);
    return ok(res, { accessToken, user: serializeAuthUser(token.user) });
  },

  async logout(req: Request, res: Response) {
    const raw = req.cookies?.refreshToken as string | undefined;
    if (raw) {
      const tokenHash = sha256(raw);
      await prisma.refreshToken.updateMany({ where: { tokenHash }, data: { isRevoked: true } });
    }
    clearRefreshCookie(res);
    return ok(res, { ok: true });
  },

  async me(req: Request, res: Response) {
    if (!req.user) throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, role: true, department: true, mustChangePassword: true },
    });
    if (!user) throw new ApiError({ status: 404, code: "NOT_FOUND", message: "User not found" });
    return ok(res, serializeAuthUser(user));
  },

  async changePassword(req: Request, res: Response) {
    if (!req.user) throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new ApiError({ status: 404, code: "NOT_FOUND", message: "User not found" });

    const match = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!match) {
      throw new ApiError({ status: 401, code: "WRONG_PASSWORD", message: "Current password is incorrect" });
    }

    if (newPassword.length < 8) {
      throw new ApiError({ status: 400, code: "PASSWORD_TOO_SHORT", message: "Password must be at least 8 characters" });
    }

    if (newPassword === currentPassword) {
      throw new ApiError({ status: 400, code: "SAME_PASSWORD", message: "New password must be different" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash, mustChangePassword: false },
    });

    return ok(res, { success: true });
  },
};

