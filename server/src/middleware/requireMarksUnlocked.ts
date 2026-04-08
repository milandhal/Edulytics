import type { NextFunction, Request, Response } from "express";
import { prisma } from "../utils/prisma.js";
import { fail } from "../utils/response.js";

/**
 * requireMarksUnlocked
 *
 * Blocks marks write operations when course_offerings.isMarksLocked = true.
 * Run AFTER requireOfferingAssignment on marks write routes.
 *
 * Usage: router.post("/:id/marks", authenticate, requireOfferingAssignment, requireMarksUnlocked, handler)
 */
export async function requireMarksUnlocked(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const offeringId = req.params.id;
  if (!offeringId) {
    return fail(res, 400, { code: "BAD_REQUEST", message: "Missing offering id in route params" });
  }

  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    select: { isMarksLocked: true },
  });

  if (!offering) {
    return fail(res, 404, { code: "NOT_FOUND", message: "Course offering not found" });
  }

  if (offering.isMarksLocked) {
    return fail(res, 403, { code: "MARKS_LOCKED", message: "Marks are locked for this offering" });
  }

  return next();
}
