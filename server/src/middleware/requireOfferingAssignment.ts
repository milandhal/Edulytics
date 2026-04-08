import type { NextFunction, Request, Response } from "express";
import { prisma } from "../utils/prisma.js";
import { fail } from "../utils/response.js";

/**
 * requireOfferingAssignment
 *
 * Guards teacher access to /offerings/:id/** routes.
 * - SUPER_ADMIN / ADMIN bypass this check entirely.
 * - FACULTY: must have a row in faculty_assignments for this offering.
 *   Returns 403 NOT_ASSIGNED otherwise.
 *
 * Usage: router.use("/:id/marks", authenticate, requireOfferingAssignment, ...)
 */
export async function requireOfferingAssignment(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const user = req.user;
  if (!user) {
    return fail(res, 401, { code: "TOKEN_MISSING", message: "Missing access token" });
  }

  // ADMIN and SUPER_ADMIN bypass the assignment check
  if (user.role === "ADMIN" || user.role === "SUPER_ADMIN") {
    return next();
  }

  const offeringId = req.params.id;
  if (!offeringId) {
    return fail(res, 400, { code: "BAD_REQUEST", message: "Missing offering id in route params" });
  }

  const assignment = await prisma.facultyAssignment.findUnique({
    where: {
      courseOfferingId_userId: {
        courseOfferingId: offeringId,
        userId: user.id,
      },
    },
    select: { id: true },
  });

  if (!assignment) {
    return fail(res, 403, { code: "NOT_ASSIGNED", message: "You are not assigned to this offering" });
  }

  return next();
}
