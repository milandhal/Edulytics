import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import {
  assertRequiredHeaders,
  createUploadHistoryMetadata,
  ensureUploadFile,
  parseSpreadsheetRows,
  type UploadErrorRow,
} from "../utils/bulkUpload.js";
import { prisma } from "../utils/prisma.js";
import { ok } from "../utils/response.js";
import { ApiError } from "../middleware/errorHandler.js";

const changePasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

// TODO: Replace with email-based flow before production
const DEFAULT_PASSWORD = '12345678';

export const UsersController = {
  async list(req: Request, res: Response) {
    const role =
      typeof req.query.role === "string" && req.query.role.trim()
        ? req.query.role.trim().toUpperCase()
        : undefined;
    const active =
      typeof req.query.active === "string" && req.query.active.trim()
        ? req.query.active.trim().toLowerCase()
        : undefined;

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        ...(role === "ADMIN" || role === "SUPER_ADMIN" || role === "FACULTY" ? { role } : {}),
        ...(active === "true" ? { isActive: true } : {}),
        ...(active === "false" ? { isActive: false } : {}),
      },
      orderBy: { email: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        designation: true,
        phone: true,
        isActive: true,
        mustChangePassword: true,
      },
    });

    return ok(
      res,
      users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        department: user.department,
        designation: user.designation,
        phone: user.phone,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
        role: user.role,
      })),
    );
  },

  async create(req: Request, res: Response) {
    const createSchema = z.object({
      name: z.string().trim().min(1, "Name is required"),
      email: z.string().email(),
      department: z.string().nullable().optional(),
      designation: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      role: z.enum(["ADMIN", "FACULTY"]).default("FACULTY"),
    });

    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError({
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const data = parsed.data;

    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingUser) {
      throw new ApiError({ status: 409, code: "CONFLICT", message: "Email already exists" });
    }

    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

    const newUser = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash,
        mustChangePassword: true,
        role: data.role,
        department: data.department ?? null,
        designation: data.designation ?? null,
        phone: data.phone ?? null,
      },
    });

    const userWithoutPassword = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      department: newUser.department,
      designation: newUser.designation,
      phone: newUser.phone,
      isActive: newUser.isActive,
      mustChangePassword: newUser.mustChangePassword,
      createdAt: newUser.createdAt,
      updatedAt: newUser.updatedAt,
      deletedAt: newUser.deletedAt,
    };
    return ok(res, userWithoutPassword);
  },

  /**
   * PATCH /users/:id/password
   * Admin-only endpoint to reset any user's password.
   * Protected by requireNotSuperAdmin — cannot reset SUPER_ADMIN password.
   */
  async changePassword(req: Request, res: Response) {
    const { id } = req.params;

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError({
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const { newPassword } = parsed.data;

    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!user) {
      throw new ApiError({ status: 404, code: "NOT_FOUND", message: "User not found" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true },
    });

    // Revoke all existing refresh tokens so the user must log in again
    await prisma.refreshToken.updateMany({
      where: { userId: id },
      data: { isRevoked: true },
    });

    return ok(res, { ok: true });
  },

  async bulkUpload(req: Request, res: Response) {
    const file = req.file;
    ensureUploadFile(file);
    if (!file) {
      throw new Error("Upload file is required");
    }

    const { headers, rows } = parseSpreadsheetRows(file);
    assertRequiredHeaders(headers, ["name", "designation", "email"]);
    if (!headers.includes("phoneno") && !headers.includes("phone")) {
      throw new ApiError({
        status: 400,
        code: "INVALID_FILE_HEADERS",
        message: "Missing required columns: phoneno",
      });
    }

    const errors: UploadErrorRow[] = [];
    let created = 0;
    let updated = 0;

    await prisma.$transaction(async (tx) => {
      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;
        const email = row.email.trim().toLowerCase();
        const name = row.name.trim();
        const phone = (row.phoneno ?? row.phone ?? "").trim();

        try {
          if (!name) {
            throw new Error("name is required");
          }

          if (!email) {
            throw new Error("email is required");
          }

          const existing = await tx.user.findUnique({
            where: { email },
            select: { id: true },
          });

          if (existing) {
            await tx.user.update({
              where: { email },
              data: {
                name,
                role: "FACULTY",
                department: row.department?.trim() || null,
                designation: row.designation.trim() || null,
                phone: phone || null,
                isActive: true,
                deletedAt: null,
              },
            });
            updated += 1;
          } else {
            const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 12);
            await tx.user.create({
              data: {
                name,
                email,
                passwordHash,
                mustChangePassword: true,
                role: "FACULTY",
                department: row.department?.trim() || null,
                designation: row.designation.trim() || null,
                phone: phone || null,
              },
            });
            created += 1;
          }
        } catch (error) {
          errors.push({
            row: rowNumber,
            identifier: email || undefined,
            reason: error instanceof Error ? error.message : "Failed to process row",
          });
        }
      }

      if (req.user) {
        try {
          await tx.activityLog.create({
            data: {
              userId: req.user.id,
              action: "Bulk upload faculty",
              entityType: "upload_history",
              metadata: createUploadHistoryMetadata({
                filename: file.originalname,
                rowCount: rows.length,
                successCount: created + updated,
                errorCount: errors.length,
                type: "FACULTY",
              }),
            },
          });
        } catch (error) {
          console.error("Failed to record faculty upload history", error);
        }
      }
    });

    return ok(res, { created, updated, errors });
  },

  /**
   * PATCH /users/:id
   * Update user details
   */
  async update(req: Request, res: Response) {
    const { id } = req.params;
    const updateSchema = z.object({
      name: z.string().trim().min(1).optional(),
      email: z.string().email().optional(),
      department: z.string().nullable().optional(),
      designation: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
      role: z.enum(["ADMIN", "FACULTY"]).optional(),
      isActive: z.boolean().optional(),
    });

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError({
        status: 422,
        code: "VALIDATION_ERROR",
        message: parsed.error.issues[0]?.message ?? "Validation failed",
      });
    }

    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!user) {
      throw new ApiError({ status: 404, code: "NOT_FOUND", message: "User not found" });
    }

    if (parsed.data.email && parsed.data.email !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
      if (existing) {
        throw new ApiError({ status: 409, code: "CONFLICT", message: "Email already exists" });
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: parsed.data.name,
        email: parsed.data.email,
        department: parsed.data.department,
        designation: parsed.data.designation,
        phone: parsed.data.phone,
        role: parsed.data.role,
        isActive: parsed.data.isActive,
      },
    });

    const safeUser = {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      department: updated.department,
      designation: updated.designation,
      phone: updated.phone,
      isActive: updated.isActive,
      mustChangePassword: updated.mustChangePassword,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      deletedAt: updated.deletedAt,
    };
    return ok(res, safeUser);
  },

  /**
   * DELETE /users/:id
   * Soft delete user
   */
  async delete(req: Request, res: Response) {
    const { id } = req.params;

    const user = await prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
    if (!user) {
      throw new ApiError({ status: 404, code: "NOT_FOUND", message: "User not found" });
    }

    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });

    // Revoke tokens
    await prisma.refreshToken.updateMany({
      where: { userId: id },
      data: { isRevoked: true },
    });

    return ok(res, { success: true });
  },
};
