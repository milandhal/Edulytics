import type { NextFunction, Request, Response } from "express";
import { prisma } from "../utils/prisma.js";
import { fail } from "../utils/response.js";

/**
 * requireNotSuperAdmin
 *
 * Prevents any user (including other SUPER_ADMINs) from modifying a SUPER_ADMIN account.
 * Must run AFTER authenticate + requireRole on PATCH /users/:id and DELETE /users/:id routes.
 *
 * Usage: router.patch("/:id", authenticate, requireRole(["ADMIN", "SUPER_ADMIN"]), requireNotSuperAdmin, handler)
 */
export async function requireNotSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const targetId = req.params.id;
  if (!targetId) {
    return fail(res, 400, { code: "BAD_REQUEST", message: "Missing user id in route params" });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: { role: true },
  });

  if (!targetUser) {
    // Let the downstream handler return 404 naturally
    return next();
  }

  if (targetUser.role === "SUPER_ADMIN") {
    return fail(res, 403, { code: "FORBIDDEN", message: "Cannot modify a SUPER_ADMIN account" });
  }

  return next();
}
