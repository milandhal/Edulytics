import { ExamComponent } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../utils/prisma.js";
import { fail } from "../utils/response.js";

const componentMap: Record<string, ExamComponent> = {
  mid: ExamComponent.MID_SEM,
  end: ExamComponent.END_SEM,
  quiz: ExamComponent.QUIZ,
  asn: ExamComponent.ASSIGNMENT,
  att: ExamComponent.ATTENDANCE,
};

export async function requireStructureUnlocked(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.method === "GET") {
    return next();
  }

  const offeringId = req.params.id;
  if (!offeringId) {
    return fail(res, 400, { code: "BAD_REQUEST", message: "Missing offering id in route params" });
  }

  const componentKey = req.params.comp;

  if (componentKey) {
    const component = componentMap[componentKey.toLowerCase()];
    if (!component) {
      return fail(res, 400, { code: "BAD_REQUEST", message: "Invalid exam component" });
    }

    const setup = await prisma.examSetup.findUnique({
      where: {
        courseOfferingId_component: {
          courseOfferingId: offeringId,
          component,
        },
      },
      select: { isStructureLocked: true },
    });

    if (setup?.isStructureLocked) {
      return fail(res, 403, {
        code: "STRUCTURE_LOCKED",
        message: "Exam structure is locked and cannot be modified",
      });
    }

    return next();
  }

  const lockedSetup = await prisma.examSetup.findFirst({
    where: {
      courseOfferingId: offeringId,
      isStructureLocked: true,
    },
    select: { id: true },
  });

  if (lockedSetup) {
    return fail(res, 403, {
      code: "STRUCTURE_LOCKED",
      message: "Exam structure is locked and cannot be modified",
    });
  }

  return next();
}
