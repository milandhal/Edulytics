import type { Request, Response } from "express";
import { Grade, Prisma, StudentStatus } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../middleware/errorHandler.js";
import {
  autoEnrollStudentInMatchingOfferings,
  autoEnrollStudentsForOffering,
  resolvePreferredAcademicYearId,
} from "../services/autoEnrollment.service.js";
import {
  assertRequiredHeaders,
  createUploadHistoryMetadata,
  ensureUploadFile,
  normalizeOptionalText as normalizeUploadText,
  parseDecimalField,
  parseIntegerField,
  parseSpreadsheetRows,
  parseSubjectType,
  type UploadErrorRow,
} from "../utils/bulkUpload.js";
import { prisma } from "../utils/prisma.js";
import { ok } from "../utils/response.js";

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (value == null || value === "") {
      return undefined;
    }
    return value;
  });

const createStudentSchema = z
  .object({
    reg: optionalString,
    registrationNumber: optionalString,
    name: z.string().trim().min(1, "Student name is required"),
    email: optionalString.pipe(z.string().email().optional()),
    phone: optionalString,
    programId: optionalString,
    program: optionalString,
    branchId: optionalString,
    branch: optionalString,
    semester: z.number().int().min(1).max(20).optional(),
    currentSemester: z.number().int().min(1).max(20).optional(),
    admissionYear: z.number().int().min(2000).max(2100).optional(),
    batch: z.number().int().min(2000).max(2100).optional(),
    section: optionalString.nullable(),
  })
  .superRefine((value, ctx) => {
    if (!value.reg && !value.registrationNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Registration number is required",
        path: ["registrationNumber"],
      });
    }

    if (!value.branchId && !value.branch) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Branch is required",
        path: ["branch"],
      });
    }

    if (value.semester == null && value.currentSemester == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current semester is required",
        path: ["currentSemester"],
      });
    }
  });

const createOfferingSchema = z
  .object({
    subjectId: optionalString,
    subjectCode: optionalString,
    branchId: optionalString,
    branch: optionalString,
    semesterNumber: z.number().int().min(1).max(20).optional(),
    semester: z.number().int().min(1).max(20).optional(),
    academicYearId: optionalString,
    academicYear: optionalString,
    section: optionalString.nullable(),
  })
  .superRefine((value, ctx) => {
    if (!value.subjectId && !value.subjectCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Subject is required",
        path: ["subjectId"],
      });
    }

    if (!value.branchId && !value.branch) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Branch is required",
        path: ["branch"],
      });
    }

    if (value.semesterNumber == null && value.semester == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Semester number is required",
        path: ["semesterNumber"],
      });
    }

    if (!value.academicYearId && !value.academicYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Academic year is required",
        path: ["academicYear"],
      });
    }
  });

const assignFacultySchema = z.object({
  userId: z.string().trim().min(1, "userId is required"),
});

const unassignFacultySchema = z.object({
  userId: z.string().trim().min(1, "userId is required"),
});

const updateOfferingLockSchema = z.object({
  isMarksLocked: z.boolean(),
});

const nonEmptyStudentIdsSchema = z.array(z.string().trim().min(1)).min(1, "studentIds must not be empty");

const bulkPromoteByIdsSchema = z.object({
  studentIds: nonEmptyStudentIdsSchema,
  toSemester: z.number().int().min(1).max(20),
});

const bulkPromoteByFilterSchema = z.object({
  branchCode: z.string().trim().min(1, "branchCode is required"),
  fromSemester: z.number().int().min(1).max(20),
  toSemester: z.number().int().min(1).max(20),
  academicYearId: z.string().trim().min(1, "academicYearId is required"),
});

const bulkGraduateByIdsSchema = z.object({
  studentIds: nonEmptyStudentIdsSchema,
});

const bulkGraduateByFilterSchema = z.object({
  branchCode: z.string().trim().min(1, "branchCode is required"),
  batch: z.number().int().min(2000).max(2100),
});

const bulkStatusSchema = z.object({
  studentIds: nonEmptyStudentIdsSchema,
  status: z.enum([StudentStatus.ACTIVE, StudentStatus.INACTIVE, StudentStatus.DROPPED_OUT]),
});

const bulkSoftDeleteSchema = z.object({
  studentIds: nonEmptyStudentIdsSchema,
});

const createProgramSchema = z.object({
  code: z.string().trim().min(1, "Program code is required"),
  name: z.string().trim().min(1, "Program name is required"),
  type: z.enum(["UG", "PG"]),
  totalSemesters: z.number().int().min(1).max(20),
});

const createBranchSchema = z.object({
  programId: z.string().trim().min(1, "Program ID is required"),
  code: z.string().trim().min(1, "Branch code is required"),
  name: z.string().trim().min(1, "Branch name is required"),
});

const saveGradesSchema = z.array(
  z.object({
    grade: z.string(),
    minScore: z.number().nullable().optional(),
    maxScore: z.number().nullable().optional(),
    points: z.number().optional(),
  })
);

const saveAttainmentSchema = z.object({
  level1: z.number().int().min(0).max(100),
  level2: z.number().int().min(0).max(100),
  level3: z.number().int().min(0).max(100),
});

const updateProgramSchema = z.object({
  code: z.string().trim().min(1, "Program code is required").optional(),
  name: z.string().trim().min(1, "Program name is required").optional(),
  type: z.enum(["UG", "PG"]).optional(),
  totalSemesters: z.number().int().min(1).max(20).optional(),
});

const updateBranchSchema = z.object({
  code: z.string().trim().min(1, "Branch code is required").optional(),
  name: z.string().trim().min(1, "Branch name is required").optional(),
});

const createSubjectSchema = z.object({
  code: z.string().trim().min(1, "Subject code is required"),
  name: z.string().trim().min(1, "Subject name is required"),
  type: z.enum(["THEORY", "LAB", "HONS_MINOR", "ELECTIVE", "ACTIVITY"]),
  lectureHours: z.number().int().min(0),
  tutorialHours: z.number().int().min(0),
  practicalHours: z.number().int().min(0),
  credits: z.number().int().min(1),
  branchCodes: z.array(z.string().trim()).optional(),
  semester: z.number().int().min(1).max(20).optional(),
});

const updateSubjectSchema = z.object({
  name: z.string().trim().min(1).optional(),
  type: z.enum(["THEORY", "LAB", "HONS_MINOR", "ELECTIVE", "ACTIVITY"]).optional(),
  lectureHours: z.number().int().min(0).optional(),
  tutorialHours: z.number().int().min(0).optional(),
  practicalHours: z.number().int().min(0).optional(),
  credits: z.number().int().min(1).optional(),
});

const patchIsActiveSchema = z.object({
  isActive: z.boolean(),
});

function parseOrThrow<T>(schema: z.ZodSchema<T>, payload: unknown) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ApiError({
      status: 422,
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message ?? "Validation failed",
      details: parsed.error.flatten(),
    });
  }

  return parsed.data;
}

function normalizeOptionalField(value?: string | null) {
  if (value == null) {
    return null;
  }

  return normalizeUploadText(value);
}

function parseAcademicYearLabel(label: string) {
  const trimmed = label.trim();
  const match = trimmed.match(/^(\d{4})\s*-\s*(\d{2}|\d{4})$/);

  if (!match) {
    const year = new Date().getFullYear();
    return { label: trimmed, startYear: year, endYear: year + 1 };
  }

  const startYear = Number(match[1]);
  const endPart = match[2];
  const endYear =
    endPart.length === 4
      ? Number(endPart)
      : Math.floor(startYear / 100) * 100 + Number(endPart);

  return { label: trimmed, startYear, endYear };
}

async function resolveProgram(tx: Prisma.TransactionClient, programId?: string, programName?: string) {
  if (programId) {
    const program = await tx.program.findFirst({
      where: { id: programId, deletedAt: null, isActive: true },
    });
    if (!program) {
      throw new ApiError({ status: 404, code: "PROGRAM_NOT_FOUND", message: "Program not found" });
    }
    return program;
  }

  const program = await tx.program.findFirst({
    where: {
      deletedAt: null,
      isActive: true,
      name: { equals: programName, mode: "insensitive" },
    },
  });

  if (!program) {
    throw new ApiError({ status: 404, code: "PROGRAM_NOT_FOUND", message: "Program not found" });
  }

  return program;
}

async function resolveBranch(tx: Prisma.TransactionClient, branchId?: string, branchValue?: string) {
  if (branchId) {
    const branch = await tx.branch.findFirst({
      where: { id: branchId, deletedAt: null, isActive: true },
    });
    if (!branch) {
      throw new ApiError({ status: 404, code: "BRANCH_NOT_FOUND", message: "Branch not found" });
    }
    return branch;
  }

  const normalized = branchValue?.trim();
  const branch = await tx.branch.findFirst({
    where: {
      deletedAt: null,
      isActive: true,
      OR: [
        { code: normalized?.toUpperCase() },
        { name: { equals: normalized, mode: "insensitive" } },
      ],
    },
  });

  if (!branch) {
    throw new ApiError({ status: 404, code: "BRANCH_NOT_FOUND", message: "Branch not found" });
  }

  return branch;
}

async function resolveSubject(tx: Prisma.TransactionClient, subjectId?: string, subjectCode?: string) {
  if (subjectId) {
    const subject = await tx.subject.findFirst({
      where: { id: subjectId, deletedAt: null },
    });
    if (!subject) {
      throw new ApiError({ status: 404, code: "SUBJECT_NOT_FOUND", message: "Subject not found" });
    }
    return subject;
  }

  const subject = await tx.subject.findFirst({
    where: { code: subjectCode?.toUpperCase(), deletedAt: null },
  });

  if (!subject) {
    throw new ApiError({ status: 404, code: "SUBJECT_NOT_FOUND", message: "Subject not found" });
  }

  return subject;
}

async function resolveAcademicYear(
  tx: Prisma.TransactionClient,
  academicYearId?: string,
  academicYearLabel?: string,
) {
  if (academicYearId) {
    const academicYear = await tx.academicYear.findFirst({
      where: { id: academicYearId, deletedAt: null },
    });
    if (!academicYear) {
      throw new ApiError({
        status: 404,
        code: "ACADEMIC_YEAR_NOT_FOUND",
        message: "Academic year not found",
      });
    }
    return academicYear;
  }

  if (!academicYearLabel) {
    throw new ApiError({
      status: 422,
      code: "ACADEMIC_YEAR_REQUIRED",
      message: "Academic year is required",
    });
  }

  const parsed = parseAcademicYearLabel(academicYearLabel);
  const hasCurrent = await tx.academicYear.count({
    where: { deletedAt: null, isCurrent: true },
  });

  return tx.academicYear.upsert({
    where: { label: parsed.label },
    update: {
      startYear: parsed.startYear,
      endYear: parsed.endYear,
    },
    create: {
      label: parsed.label,
      startYear: parsed.startYear,
      endYear: parsed.endYear,
      isCurrent: hasCurrent === 0,
    },
  });
}

function normalizeProgramLookupValue(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function deriveProgramCodeFromName(name: string) {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function findStudentTargetsByIds(tx: Prisma.TransactionClient, studentIds: string[]) {
  return tx.student.findMany({
    where: {
      id: { in: studentIds },
      deletedAt: null,
    },
    include: {
      program: { select: { id: true, name: true, totalSemesters: true } },
      branch: { select: { id: true, code: true, name: true } },
    },
  });
}

async function findActiveStudentTargetsByBranchAndSemester(
  tx: Prisma.TransactionClient,
  branchCode: string,
  fromSemester: number,
) {
  return tx.student.findMany({
    where: {
      deletedAt: null,
      status: StudentStatus.ACTIVE,
      currentSemester: fromSemester,
      branch: {
        code: branchCode.toUpperCase(),
        deletedAt: null,
        isActive: true,
      },
    },
    include: {
      program: { select: { id: true, name: true, totalSemesters: true } },
      branch: { select: { id: true, code: true, name: true } },
    },
  });
}

async function findStudentTargetsByBranchAndBatch(
  tx: Prisma.TransactionClient,
  branchCode: string,
  batch: number,
) {
  return tx.student.findMany({
    where: {
      deletedAt: null,
      status: StudentStatus.ACTIVE,
      admissionYear: batch,
      branch: {
        code: branchCode.toUpperCase(),
        deletedAt: null,
        isActive: true,
      },
    },
    include: {
      program: { select: { id: true, name: true, totalSemesters: true } },
      branch: { select: { id: true, code: true, name: true } },
    },
  });
}

async function logStudentBulkAction(
  tx: Prisma.TransactionClient,
  req: Request,
  action: string,
  metadata: Record<string, unknown>,
) {
  if (!req.user) {
    return;
  }

  await tx.activityLog.create({
    data: {
      userId: req.user.id,
      action,
      entityType: "student_bulk_action",
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}

async function findOrCreateUnsectionedOffering(tx: Prisma.TransactionClient, input: {
  subjectId: string;
  branchId: string;
  semesterNumber: number;
  academicYearId: string;
}) {
  const existing = await tx.courseOffering.findFirst({
    where: {
      deletedAt: null,
      subjectId: input.subjectId,
      branchId: input.branchId,
      semesterNumber: input.semesterNumber,
      academicYearId: input.academicYearId,
      section: null,
    },
    select: { id: true },
  });

  if (existing) {
    return tx.courseOffering.update({
      where: { id: existing.id },
      data: {
        isMarksLocked: false,
        isSetupLocked: false,
        deletedAt: null,
      },
    });
  }

  return tx.courseOffering.create({
    data: {
      subjectId: input.subjectId,
      branchId: input.branchId,
      semesterNumber: input.semesterNumber,
      academicYearId: input.academicYearId,
      section: null,
    },
  });
}

export const WriteController = {
  async createProgram(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;
    const payload = parseOrThrow(createProgramSchema, req.body);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.program.findFirst({
        where: { name: payload.name, deletedAt: null },
      });
      if (existing) {
        throw new ApiError({ status: 409, code: "PROGRAM_EXISTS", message: "Program with this name already exists" });
      }

      const program = await tx.program.create({
        data: {
          name: payload.name,
          type: payload.type,
          totalSemesters: payload.totalSemesters,
          isActive: true,
        },
      });

      await tx.activityLog.create({
        data: {
          userId: actorUserId,
          action: "Created academic program",
          entityType: "program",
          entityId: program.id,
          metadata: { name: program.name },
        },
      });

      return program;
    });

    return ok(res, result);
  },

  async patchProgram(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;
    const { id } = req.params;
    const payload = parseOrThrow(patchIsActiveSchema, req.body);

    const result = await prisma.$transaction(async (tx) => {
      const program = await tx.program.update({
        where: { id },
        data: { isActive: payload.isActive },
      });
      await tx.activityLog.create({
        data: {
          userId: actorUserId,
          action: `${payload.isActive ? "Activated" : "Deactivated"} program`,
          entityType: "program",
          entityId: program.id,
        },
      });
      return program;
    });
    return ok(res, result);
  },

  async updateProgram(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;
    const { id } = req.params;
    const payload = parseOrThrow(updateProgramSchema, req.body);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.program.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Program not found" });
      }

      if (payload.name && payload.name !== existing.name) {
        const duplicate = await tx.program.findFirst({
          where: {
            id: { not: id },
            deletedAt: null,
            name: { equals: payload.name, mode: "insensitive" },
          },
        });
        if (duplicate) {
          throw new ApiError({
            status: 409,
            code: "PROGRAM_EXISTS",
            message: "Program with this name already exists",
          });
        }
      }

      const updated = await tx.program.update({
        where: { id },
        data: {
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(payload.type !== undefined ? { type: payload.type } : {}),
          ...(payload.totalSemesters !== undefined
            ? { totalSemesters: payload.totalSemesters }
            : {}),
        },
      });

      await tx.activityLog.create({
        data: {
          userId: actorUserId,
          action: "Updated academic program",
          entityType: "program",
          entityId: updated.id,
          metadata: { name: updated.name },
        },
      });

      return updated;
    });

    return ok(res, result);
  },

  async deleteProgram(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;
    const { id } = req.params;

    const [branchCount, studentCount] = await Promise.all([
      prisma.branch.count({ where: { programId: id, deletedAt: null } }),
      prisma.student.count({ where: { programId: id, deletedAt: null } }),
    ]);

    if (branchCount > 0 || studentCount > 0) {
      throw new ApiError({
        status: 400,
        code: "RESTRICTED",
        message: `Cannot delete program with active branches (${branchCount}) or students (${studentCount})`,
      });
    }

    await prisma.$transaction(async (tx) => {
      const program = await tx.program.findFirst({
        where: { id, deletedAt: null },
      });

      if (!program) {
        throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Program not found" });
      }

      await tx.program.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false },
      });

      await tx.activityLog.create({
        data: {
          userId: actorUserId,
          action: "Deleted academic program",
          entityType: "program",
          entityId: id,
        },
      });
    });

    return ok(res, { success: true });
  },

  async createBranch(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;
    const payload = parseOrThrow(createBranchSchema, req.body);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.branch.findFirst({
        where: { code: payload.code.toUpperCase(), programId: payload.programId, deletedAt: null },
      });
      if (existing) {
        throw new ApiError({ status: 409, code: "BRANCH_EXISTS", message: "Branch with this code already exists in this program" });
      }

      const branch = await tx.branch.create({
        data: {
          programId: payload.programId,
          code: payload.code.toUpperCase(),
          name: payload.name,
          isActive: true,
        },
      });

      await tx.activityLog.create({
        data: {
          userId: actorUserId,
          action: "Created academic branch",
          entityType: "branch",
          entityId: branch.id,
          metadata: { code: branch.code, programId: branch.programId },
        },
      });

      return branch;
    });

    return ok(res, result);
  },

  async patchBranch(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;
    const { id } = req.params;
    const payload = parseOrThrow(patchIsActiveSchema, req.body);

    const result = await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.update({
        where: { id },
        data: { isActive: payload.isActive },
      });
      await tx.activityLog.create({
        data: {
          userId: actorUserId,
          action: `${payload.isActive ? "Activated" : "Deactivated"} branch ${branch.code}`,
          entityType: "branch",
          entityId: branch.id,
          metadata: { code: branch.code, programId: branch.programId },
        },
      });
      return branch;
    });
    return ok(res, result);
  },

  async updateBranch(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;
    const { id } = req.params;
    const payload = parseOrThrow(updateBranchSchema, req.body);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.branch.findFirst({
        where: { id, deletedAt: null },
      });
      if (!existing) {
        throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Branch not found" });
      }

      const nextCode = payload.code?.toUpperCase();
      if (nextCode && nextCode !== existing.code) {
        const duplicate = await tx.branch.findFirst({
          where: {
            id: { not: id },
            deletedAt: null,
            programId: existing.programId,
            code: nextCode,
          },
        });
        if (duplicate) {
          throw new ApiError({
            status: 409,
            code: "BRANCH_EXISTS",
            message: "Branch with this code already exists in this program",
          });
        }
      }

      const updated = await tx.branch.update({
        where: { id },
        data: {
          ...(payload.name !== undefined ? { name: payload.name } : {}),
          ...(nextCode !== undefined ? { code: nextCode } : {}),
        },
      });

      await tx.activityLog.create({
        data: {
          userId: actorUserId,
          action: "Updated academic branch",
          entityType: "branch",
          entityId: updated.id,
          metadata: { code: updated.code, programId: updated.programId },
        },
      });

      return updated;
    });

    return ok(res, result);
  },

  async deleteBranch(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;
    const { id } = req.params;

    const students = await prisma.student.count({ where: { branchId: id, deletedAt: null } });
    const offerings = await prisma.courseOffering.count({ where: { branchId: id, deletedAt: null } });

    if (students > 0 || offerings > 0) {
      throw new ApiError({
        status: 400,
        code: "RESTRICTED",
        message: `Cannot delete branch with active students (${students}) or offerings (${offerings})`,
      });
    }

    await prisma.$transaction(async (tx) => {
      const branch = await tx.branch.findUnique({ where: { id } });
      if (branch) {
        await tx.branch.delete({ where: { id } });
        await tx.activityLog.create({
          data: {
            userId: actorUserId,
            action: `Deleted branch ${branch.code}`,
            entityType: "branch",
          },
        });
      }
    });

    return ok(res, { success: true });
  },

  async saveGrades(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;
    const payload = parseOrThrow(saveGradesSchema, req.body);
    
    await prisma.$transaction(async (tx) => {
      for (const item of payload) {
        await tx.gradeConfig.update({
          where: { grade: item.grade as Grade },
          data: {
            minScore: item.minScore,
            maxScore: item.maxScore,
            ...(item.points !== undefined && { gradePoint: item.points })
          }
        });
      }
      await tx.activityLog.create({
        data: { userId: actorUserId, action: "Updated grade scale", entityType: "settings" }
      });
    });
    return ok(res, { success: true });
  },

  async saveAttainmentSettings(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;
    const payload = parseOrThrow(saveAttainmentSchema, req.body);

    await prisma.$transaction(async (tx) => {
      await tx.attainmentConfig.update({ where: { level: 1 }, data: { studentPercentageThreshold: payload.level1 }});
      await tx.attainmentConfig.update({ where: { level: 2 }, data: { studentPercentageThreshold: payload.level2 }});
      await tx.attainmentConfig.update({ where: { level: 3 }, data: { studentPercentageThreshold: payload.level3 }});
      
      await tx.activityLog.create({
        data: { userId: actorUserId, action: "Updated attainment thresholds", entityType: "settings" }
      });
    });
    return ok(res, { success: true });
  },

  async setActiveAcademicYear(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;
    const { id } = req.params;

    const result = await prisma.$transaction(async (tx) => {
      const targetYear = await tx.academicYear.findUnique({ where: { id, deletedAt: null } });
      if (!targetYear) {
        throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Academic year not found" });
      }

      await tx.academicYear.updateMany({
        where: { isCurrent: true },
        data: { isCurrent: false }
      });

      const updated = await tx.academicYear.update({
        where: { id },
        data: { isCurrent: true }
      });

      await tx.activityLog.create({
        data: {
          userId: actorUserId,
          action: "Set active academic year",
          entityType: "settings",
          metadata: { academicYearId: id, label: updated.label }
        }
      });

      return updated;
    });

    return ok(res, result);
  },

  async createStudent(req: Request, res: Response) {
    const payload = parseOrThrow(createStudentSchema, req.body);

    const result = await prisma.$transaction(async (tx) => {
      const branch = await resolveBranch(tx, payload.branchId, payload.branch);
      const program =
        payload.programId || payload.program
          ? await resolveProgram(tx, payload.programId, payload.program)
          : await resolveProgram(tx, branch.programId, undefined);

      if (branch.programId !== program.id) {
        throw new ApiError({
          status: 422,
          code: "PROGRAM_BRANCH_MISMATCH",
          message: "Selected branch does not belong to the selected program",
        });
      }

      const currentSemester = payload.currentSemester ?? payload.semester!;
      const registrationNumber = payload.registrationNumber ?? payload.reg!;
      const admissionYear = payload.admissionYear ?? payload.batch ?? new Date().getFullYear();

      const student = await tx.student.create({
        data: {
          registrationNumber,
          name: payload.name.trim(),
          email: normalizeOptionalField(payload.email),
          phone: normalizeOptionalField(payload.phone),
          programId: program.id,
          branchId: branch.id,
          admissionYear,
          currentSemester,
          section: normalizeOptionalField(payload.section),
          status: StudentStatus.ACTIVE,
          graduationYear: null,
          graduationDate: null,
        },
      });

      const academicYearId = await resolvePreferredAcademicYearId(tx);
      const autoEnrolledCount = academicYearId
        ? await autoEnrollStudentInMatchingOfferings(tx, {
            studentId: student.id,
            branchId: branch.id,
            semesterNumber: currentSemester,
            academicYearId,
          })
        : 0;

      if (req.user) {
        await tx.activityLog.create({
          data: {
            userId: req.user.id,
            action: "Created student",
            entityType: "student",
            entityId: student.id,
            metadata: {
              registrationNumber: student.registrationNumber,
              autoEnrolledCount,
            },
          },
        });
      }

      return {
        id: student.id,
        reg: student.registrationNumber,
        name: student.name,
        program: program.name,
        branch: branch.code,
        sem: student.currentSemester,
        section: student.section ?? "",
        batch: student.admissionYear,
        cgpa: 0,
        backlogs: 0,
        active: student.status === StudentStatus.ACTIVE,
        status: student.status,
        graduationYear: student.graduationYear,
        graduationDate: student.graduationDate?.toISOString() ?? null,
        autoEnrolledCount,
      };
    });

    return ok(res, result);
  },

  async createOffering(req: Request, res: Response) {
    const payload = parseOrThrow(createOfferingSchema, req.body);

    const result = await prisma.$transaction(async (tx) => {
      const subject = await resolveSubject(tx, payload.subjectId, payload.subjectCode);
      const branch = await resolveBranch(tx, payload.branchId, payload.branch);
      const academicYear = await resolveAcademicYear(tx, payload.academicYearId, payload.academicYear);
      const semesterNumber = payload.semesterNumber ?? payload.semester!;
      const section = normalizeOptionalField(payload.section);

      const existing = await tx.courseOffering.findFirst({
        where: {
          deletedAt: null,
          subjectId: subject.id,
          branchId: branch.id,
          semesterNumber,
          academicYearId: academicYear.id,
          section,
        },
      });

      if (existing) {
        throw new ApiError({
          status: 409,
          code: "OFFERING_EXISTS",
          message: "Offering already exists for this subject, branch, semester, and academic year",
        });
      }

      const offering = await tx.courseOffering.create({
        data: {
          subjectId: subject.id,
          branchId: branch.id,
          semesterNumber,
          academicYearId: academicYear.id,
          section,
        },
      });

      const autoEnrolledCount = await autoEnrollStudentsForOffering(tx, {
        courseOfferingId: offering.id,
        branchId: branch.id,
        semesterNumber,
      });

      // Auto-create 5 CO definitions (CO1-CO5) as per system specification
      await tx.coDefinition.createMany({
        data: [1, 2, 3, 4, 5].map((n) => ({
          courseOfferingId: offering.id,
          coNumber: n,
          label: `CO${n}`,
          description: `Description for CO${n}`,
        })),
      });

      if (req.user) {
        await tx.activityLog.create({
          data: {
            userId: req.user.id,
            action: "Created offering",
            entityType: "course_offering",
            entityId: offering.id,
            metadata: {
              subjectCode: subject.code,
              branchCode: branch.code,
              semesterNumber,
              academicYear: academicYear.label,
              autoEnrolledCount,
            },
          },
        });
      }

      return {
        id: offering.id,
        subjectId: offering.subjectId,
        branchId: offering.branchId,
        semesterNumber: offering.semesterNumber,
        academicYear: academicYear.label,
        facultyId: null,
        isMarksLocked: offering.isMarksLocked,
        autoEnrolledCount,
      };
    });

    return ok(res, result);
  },

  async assignOfferingFaculty(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;

    const offeringId = req.params.id;
    if (!offeringId) {
      throw new ApiError({ status: 400, code: "INVALID_ID", message: "Offering id is required" });
    }

    const { userId } = parseOrThrow(assignFacultySchema, req.body);

    const result = await prisma.$transaction(async (tx) => {
      const [offering, faculty] = await Promise.all([
        tx.courseOffering.findFirst({
          where: { id: offeringId, deletedAt: null },
          include: {
            subject: { select: { code: true } },
            branch: { select: { code: true } },
          },
        }),
        tx.user.findFirst({
          where: { id: userId, deletedAt: null, isActive: true, role: "FACULTY" },
          select: { id: true, name: true, email: true, department: true },
        }),
      ]);

      if (!offering) {
        throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Offering not found" });
      }

      if (!faculty) {
        throw new ApiError({ status: 404, code: "FACULTY_NOT_FOUND", message: "Faculty not found" });
      }

      await tx.facultyAssignment.deleteMany({
        where: { courseOfferingId: offeringId },
      });

      await tx.facultyAssignment.create({
        data: {
          courseOfferingId: offeringId,
          userId: faculty.id,
        },
      });

      await tx.activityLog.create({
        data: {
          userId: actorUserId,
          action: "Assigned faculty to offering",
          entityType: "course_offering",
          entityId: offeringId,
          metadata: {
            facultyEmail: faculty.email,
            facultyDepartment: faculty.department,
            subjectCode: offering.subject.code,
            branchCode: offering.branch.code,
            semesterNumber: offering.semesterNumber,
          },
        },
      });

      return {
        offeringId,
        user: {
          id: faculty.id,
          name: faculty.name,
          email: faculty.email,
          department: faculty.department ?? "",
        },
      };
    });

    return ok(res, result);
  },

  async unassignOfferingFaculty(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;

    const offeringId = req.params.id;
    if (!offeringId) {
      throw new ApiError({ status: 400, code: "INVALID_ID", message: "Offering id is required" });
    }

    const { userId } = parseOrThrow(unassignFacultySchema, req.body);

    const result = await prisma.$transaction(async (tx) => {
      const offering = await tx.courseOffering.findFirst({
        where: { id: offeringId, deletedAt: null },
        include: {
          subject: { select: { code: true } },
          branch: { select: { code: true } },
        },
      });

      if (!offering) {
        throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Offering not found" });
      }

      const deleted = await tx.facultyAssignment.deleteMany({
        where: { courseOfferingId: offeringId, userId },
      });

      if (deleted.count === 0) {
        throw new ApiError({
          status: 404,
          code: "FACULTY_ASSIGNMENT_NOT_FOUND",
          message: "Faculty assignment not found",
        });
      }

      await tx.activityLog.create({
        data: {
          userId: actorUserId,
          action: "Unassigned faculty from offering",
          entityType: "course_offering",
          entityId: offeringId,
          metadata: {
            facultyUserId: userId,
            subjectCode: offering.subject.code,
            branchCode: offering.branch.code,
            semesterNumber: offering.semesterNumber,
          },
        },
      });

      return {
        offeringId,
        unassignedUserId: userId,
      };
    });

    return ok(res, result);
  },

  async setOfferingMarksLock(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;

    const offeringId = req.params.id;
    if (!offeringId) {
      throw new ApiError({ status: 400, code: "INVALID_ID", message: "Offering id is required" });
    }

    const { isMarksLocked } = parseOrThrow(updateOfferingLockSchema, req.body);

    const offering = await prisma.courseOffering.findFirst({
      where: { id: offeringId, deletedAt: null },
      select: { id: true },
    });

    if (!offering) {
      throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Offering not found" });
    }

    await prisma.$transaction([
      prisma.courseOffering.update({
        where: { id: offeringId },
        data: { isMarksLocked },
      }),
      prisma.activityLog.create({
        data: {
          userId: actorUserId,
          action: isMarksLocked ? "Locked offering marks" : "Unlocked offering marks",
          entityType: "course_offering",
          entityId: offeringId,
          metadata: {
            isMarksLocked,
          },
        },
      }),
    ]);

    return ok(res, {
      id: offeringId,
      isMarksLocked,
    });
  },

  async deleteOffering(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;

    const offeringId = req.params.id;
    if (!offeringId) {
      throw new ApiError({ status: 400, code: "INVALID_ID", message: "Offering id is required" });
    }

    const offering = await prisma.courseOffering.findFirst({
      where: { id: offeringId, deletedAt: null },
      select: { id: true },
    });

    if (!offering) {
      throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Offering not found" });
    }

    await prisma.$transaction([
      prisma.courseOffering.update({
        where: { id: offeringId },
        data: {
          deletedAt: new Date(),
        },
      }),
      prisma.activityLog.create({
        data: {
          userId: actorUserId,
          action: "Deleted offering",
          entityType: "course_offering",
          entityId: offeringId,
        },
      }),
    ]);

    return ok(res, { id: offeringId, deleted: true });
  },

  async bulkUploadStudents(req: Request, res: Response) {
    const file = req.file;
    ensureUploadFile(file);
    if (!file) {
      throw new Error("Upload file is required");
    }

    const { headers, rows } = parseSpreadsheetRows(file);
    assertRequiredHeaders(headers, [
      "registration_number",
      "name",
      "program",
      "branch",
      "admission_year",
      "current_semester",
    ]);

    const errors: UploadErrorRow[] = [];
    let saved = 0;

    const [programs, branches, academicYearId] = await Promise.all([
      prisma.program.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.branch.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, code: true, programId: true },
      }),
      resolvePreferredAcademicYearId(prisma),
    ]);

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;

      try {
        const registrationNumber = row.registration_number.trim();
        const name = row.name.trim();
        const programValue = row.program.trim();
        const branchCode = row.branch.trim().toUpperCase();

        if (!registrationNumber || !name || !programValue || !branchCode) {
          throw new Error("registration_number, name, program, and branch are required");
        }

        if (registrationNumber.length > 20) {
          throw new Error("registration_number must be at most 20 characters");
        }

        const admissionYear = parseIntegerField(row.admission_year, "admission_year");
        const currentSemester = parseIntegerField(
          row.current_semester,
          "current_semester",
        );

        const normalizedProgram = normalizeProgramLookupValue(programValue);
        const program = programs.find((candidate) => {
          const normalizedName = normalizeProgramLookupValue(candidate.name);
          const derivedCode = deriveProgramCodeFromName(candidate.name);

          return (
            normalizedName.includes(normalizedProgram) ||
            normalizedProgram.includes(normalizedName) ||
            derivedCode === normalizedProgram.toUpperCase()
          );
        });

        if (!program) {
          errors.push({
            row: rowNumber,
            identifier: registrationNumber,
            reason: `Program not found: ${programValue}`,
          });
          continue;
        }

        const branch = branches.find((candidate) => candidate.code === branchCode);

        if (!branch) {
          errors.push({
            row: rowNumber,
            identifier: registrationNumber,
            reason: `Branch not found: ${branchCode}`,
          });
          continue;
        }

        if (branch.programId !== program.id) {
          errors.push({
            row: rowNumber,
            identifier: registrationNumber,
            reason: `Branch ${branchCode} does not belong to program ${programValue}`,
          });
          continue;
        }

        const student = await prisma.student.upsert({
          where: { registrationNumber },
          update: {
            name,
            currentSemester,
            email: normalizeUploadText(row.email ?? ""),
            phone: normalizeUploadText(row.phone ?? ""),
            section: normalizeUploadText(row.section ?? ""),
            status: StudentStatus.ACTIVE,
            graduationYear: null,
            graduationDate: null,
            deletedAt: null,
          },
          create: {
            registrationNumber,
            name,
            programId: program.id,
            branchId: branch.id,
            admissionYear,
            currentSemester,
            email: normalizeUploadText(row.email ?? ""),
            phone: normalizeUploadText(row.phone ?? ""),
            section: normalizeUploadText(row.section ?? ""),
            status: StudentStatus.ACTIVE,
            graduationYear: null,
            graduationDate: null,
          },
        });

        if (academicYearId) {
          const offerings = await prisma.courseOffering.findMany({
            where: {
              deletedAt: null,
              branchId: branch.id,
              semesterNumber: currentSemester,
              academicYearId,
            },
            select: { id: true },
          });

          if (offerings.length > 0) {
            await prisma.studentEnrollment.createMany({
              data: offerings.map((offering) => ({
                studentId: student.id,
                courseOfferingId: offering.id,
              })),
              skipDuplicates: true,
            });
          }
        }

        saved += 1;
      } catch (error) {
        errors.push({
          row: rowNumber,
          identifier: row.registration_number?.trim() || undefined,
          reason: error instanceof Error ? error.message : "Failed to process row",
        });
      }
    }

    if (req.user) {
      try {
        await prisma.activityLog.create({
          data: {
            userId: req.user.id,
            action: "Bulk upload students",
            entityType: "upload_history",
            metadata: createUploadHistoryMetadata({
              filename: file.originalname,
              rowCount: rows.length,
              successCount: saved,
              errorCount: errors.length,
              type: "STUDENTS",
            }),
          },
        });
      } catch (error) {
        console.error("Failed to record student upload history", error);
      }
    }

    return ok(res, { success: true, saved, errors });
  },

  async createSubject(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;
    const payload = parseOrThrow(createSubjectSchema, req.body);

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.subject.findFirst({
        where: { code: payload.code.toUpperCase(), deletedAt: null },
      });
      if (existing) {
        throw new ApiError({ status: 409, code: "SUBJECT_EXISTS", message: "Subject with this code already exists" });
      }

      const subject = await tx.subject.create({
        data: {
          code: payload.code.toUpperCase(),
          name: payload.name,
          type: payload.type,
          lectureHours: payload.lectureHours,
          tutorialHours: payload.tutorialHours,
          practicalHours: payload.practicalHours,
          credits: payload.credits,
        },
      });

      await tx.activityLog.create({
        data: {
          userId: actorUserId,
          action: "Created subject",
          entityType: "subject",
          entityId: subject.id,
          metadata: { code: subject.code },
        },
      });

      return subject;
    });

    return ok(res, result);
  },

  async updateSubject(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;
    const { id } = req.params;
    const payload = parseOrThrow(updateSubjectSchema, req.body);

    const result = await prisma.$transaction(async (tx) => {
      const subject = await tx.subject.findUnique({ where: { id } });
      if (!subject) throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Subject not found" });

      const updated = await tx.subject.update({
        where: { id },
        data: payload,
      });

      await tx.activityLog.create({
        data: {
          userId: actorUserId,
          action: "Updated subject metadata",
          entityType: "subject",
          entityId: subject.id,
        },
      });

      return updated;
    });

    return ok(res, result);
  },

  async deleteSubject(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorUserId = req.user.id;
    const { id } = req.params;

    const offerings = await prisma.courseOffering.count({ where: { subjectId: id, deletedAt: null } });

    if (offerings > 0) {
      throw new ApiError({
        status: 400,
        code: "RESTRICTED",
        message: `Cannot delete subject with active course offerings (${offerings})`,
      });
    }

    await prisma.$transaction(async (tx) => {
      const subject = await tx.subject.findUnique({ where: { id } });
      if (subject) {
        await tx.subject.update({
          where: { id },
          data: {
             deletedAt: new Date(),
             code: `DEL_${Date.now()}_${subject.code}`
          }
        });
        await tx.activityLog.create({
          data: {
            userId: actorUserId,
            action: `Deleted subject ${subject.code}`.trim(),
            entityType: "subject",
          },
        });
      }
    });

    return ok(res, { success: true });
  },

  async bulkUploadSubjects(req: Request, res: Response) {
    const file = req.file;
    ensureUploadFile(file);
    if (!file) {
      throw new Error("Upload file is required");
    }

    const { headers, rows } = parseSpreadsheetRows(file);
    assertRequiredHeaders(headers, [
      "code",
      "name",
      "type",
      "lecture_hours",
      "tutorial_hours",
      "practical_hours",
      "credits",
      "branch_codes",
      "semester",
    ]);

    const errors: UploadErrorRow[] = [];
    let saved = 0;

    await prisma.$transaction(async (tx) => {
      const [branches, academicYearId] = await Promise.all([
        tx.branch.findMany({
          where: { deletedAt: null, isActive: true },
          select: { id: true, code: true },
        }),
        resolvePreferredAcademicYearId(tx),
      ]);

      if (!academicYearId) {
        throw new ApiError({
          status: 422,
          code: "ACADEMIC_YEAR_NOT_FOUND",
          message: "No active academic year is available for subject upload",
        });
      }

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;

        try {
          const code = row.code.trim().toUpperCase();
          const name = row.name.trim();

          if (!code || !name) {
            throw new Error("code and name are required");
          }

          const type = parseSubjectType(row.type);
          const lectureHours = parseIntegerField(row.lecture_hours, "lecture_hours");
          const tutorialHours = parseIntegerField(
            row.tutorial_hours,
            "tutorial_hours",
          );
          const practicalHours = parseIntegerField(
            row.practical_hours,
            "practical_hours",
          );
          const credits = parseDecimalField(row.credits, "credits");
          const semesterNumber = parseIntegerField(row.semester, "semester");
          const branchCodes = row.branch_codes
            .split(",")
            .map((value) => value.trim().toUpperCase())
            .filter(Boolean);

          if (branchCodes.length === 0) {
            throw new Error("branch_codes must contain at least one branch code");
          }

          const resolvedBranches = branchCodes
            .map((branchCode) => branches.find((branch) => branch.code === branchCode))
            .filter((branch): branch is NonNullable<typeof branch> => Boolean(branch));

          const missingBranches = branchCodes.filter(
            (branchCode) => !resolvedBranches.some((branch) => branch.code === branchCode),
          );

          if (missingBranches.length > 0) {
            errors.push({
              row: rowNumber,
              identifier: code,
              reason: `Branches not found: ${missingBranches.join(", ")}`,
            });
            continue;
          }

          const subject = await tx.subject.upsert({
            where: { code },
            update: {
              name,
              type,
              lectureHours,
              tutorialHours,
              practicalHours,
              credits,
              deletedAt: null,
            },
            create: {
              code,
              name,
              type,
              lectureHours,
              tutorialHours,
              practicalHours,
              credits,
            },
          });

          for (const branch of resolvedBranches) {
            await findOrCreateUnsectionedOffering(tx, {
              subjectId: subject.id,
              branchId: branch.id,
              semesterNumber,
              academicYearId,
            });
          }

          saved += 1;
        } catch (error) {
          errors.push({
            row: rowNumber,
            identifier: row.code?.trim().toUpperCase() || undefined,
            reason: error instanceof Error ? error.message : "Failed to process row",
          });
        }
      }

      if (req.user) {
        try {
          await tx.activityLog.create({
            data: {
              userId: req.user.id,
              action: "Bulk upload subjects",
              entityType: "upload_history",
              metadata: createUploadHistoryMetadata({
                filename: file.originalname,
                rowCount: rows.length,
                successCount: saved,
                errorCount: errors.length,
                type: "SUBJECTS",
              }),
            },
          });
        } catch (error) {
          console.error("Failed to record subject upload history", error);
        }
      }
    });

    return ok(res, { success: true, saved, errors });
  },

  async bulkPromoteStudents(req: Request, res: Response) {
    const payload = req.body ?? {};
    const hasStudentIds = Array.isArray(payload.studentIds);

    if (hasStudentIds && payload.studentIds.length === 0) {
      throw new ApiError({
        status: 400,
        code: "STUDENT_IDS_REQUIRED",
        message: "studentIds must not be empty",
      });
    }

    const parsed = hasStudentIds
      ? parseOrThrow(bulkPromoteByIdsSchema, payload)
      : parseOrThrow(bulkPromoteByFilterSchema, payload);

    const result = await prisma.$transaction(async (tx) => {
      const targetAcademicYearId =
        "academicYearId" in parsed
          ? parsed.academicYearId
          : await resolvePreferredAcademicYearId(tx);

      if (!targetAcademicYearId) {
        throw new ApiError({
          status: 422,
          code: "ACADEMIC_YEAR_NOT_FOUND",
          message: "No active academic year is available for promotion",
        });
      }

      const students =
        "studentIds" in parsed
          ? await findStudentTargetsByIds(tx, parsed.studentIds)
          : await findActiveStudentTargetsByBranchAndSemester(
              tx,
              parsed.branchCode,
              parsed.fromSemester,
            );

      const fromSemester =
        "fromSemester" in parsed
          ? parsed.fromSemester
          : students[0]?.currentSemester;

      if (fromSemester == null) {
        return { promoted: 0, enrolled: 0 };
      }

      if (parsed.toSemester !== fromSemester + 1) {
        throw new ApiError({
          status: 400,
          code: "INVALID_SEMESTER_TRANSITION",
          message: `toSemester must be exactly ${fromSemester + 1}`,
        });
      }

      if (parsed.toSemester > 8) {
        throw new ApiError({
          status: 400,
          code: "SEMESTER_LIMIT_EXCEEDED",
          message: "toSemester cannot be greater than 8 for B.Tech students",
        });
      }

      const invalidStudents = students
        .filter((student) => student.status !== StudentStatus.ACTIVE)
        .map((student) => ({
          id: student.id,
          name: student.name,
          reason: `Student is ${student.status.toLowerCase()}`,
        }));

      const semesterMismatchStudents = students
        .filter((student) => student.currentSemester + 1 !== parsed.toSemester)
        .map((student) => ({
          id: student.id,
          name: student.name,
          reason: `Current semester ${student.currentSemester} cannot be promoted to ${parsed.toSemester}`,
        }));

      const maxSemesterStudents = students
        .filter((student) => parsed.toSemester > student.program.totalSemesters)
        .map((student) => ({
          id: student.id,
          name: student.name,
          reason: `${student.program.name} has a maximum semester of ${student.program.totalSemesters}`,
        }));

      const combinedInvalid = [...invalidStudents, ...semesterMismatchStudents, ...maxSemesterStudents];

      if (combinedInvalid.length > 0) {
        throw new ApiError({
          status: 400,
          code: "PROMOTION_VALIDATION_FAILED",
          message: "Some students cannot be promoted to the requested semester",
          details: combinedInvalid,
        });
      }

      if (students.length === 0) {
        return { promoted: 0, enrolled: 0 };
      }

      await tx.student.updateMany({
        where: {
          id: { in: students.map((student) => student.id) },
        },
        data: {
          currentSemester: parsed.toSemester,
        },
      });

      const offeringsByBranch = new Map<string, string[]>();
      let enrollmentCount = 0;

      for (const student of students) {
        if (!offeringsByBranch.has(student.branchId)) {
          const offerings = await tx.courseOffering.findMany({
            where: {
              deletedAt: null,
              branchId: student.branchId,
              semesterNumber: parsed.toSemester,
              academicYearId: targetAcademicYearId,
            },
            select: { id: true },
          });

          offeringsByBranch.set(
            student.branchId,
            offerings.map((offering) => offering.id),
          );
        }

        const offeringIds = offeringsByBranch.get(student.branchId) ?? [];

        if (offeringIds.length > 0) {
          const created = await tx.studentEnrollment.createMany({
            data: offeringIds.map((courseOfferingId) => ({
              studentId: student.id,
              courseOfferingId,
            })),
            skipDuplicates: true,
          });

          enrollmentCount += created.count;
        }
      }

      await logStudentBulkAction(tx, req, "Bulk promote students", {
        studentCount: students.length,
        toSemester: parsed.toSemester,
        academicYearId: targetAcademicYearId,
      });

      return { promoted: students.length, enrolled: enrollmentCount };
    });

    return ok(res, result);
  },

  async bulkGraduateStudents(req: Request, res: Response) {
    const payload = req.body ?? {};
    const hasStudentIds = Array.isArray(payload.studentIds);

    if (hasStudentIds && payload.studentIds.length === 0) {
      throw new ApiError({
        status: 400,
        code: "STUDENT_IDS_REQUIRED",
        message: "studentIds must not be empty",
      });
    }

    const parsed = hasStudentIds
      ? parseOrThrow(bulkGraduateByIdsSchema, payload)
      : parseOrThrow(bulkGraduateByFilterSchema, payload);

    const result = await prisma.$transaction(async (tx) => {
      const students =
        "studentIds" in parsed
          ? await findStudentTargetsByIds(tx, parsed.studentIds)
          : await findStudentTargetsByBranchAndBatch(tx, parsed.branchCode, parsed.batch);

      const skipped = students
        .filter((student) => {
          if (student.status !== StudentStatus.ACTIVE) {
            return true;
          }

          return student.currentSemester !== student.program.totalSemesters;
        })
        .map((student) => ({
          id: student.id,
          name: student.name,
          reason:
            student.status !== StudentStatus.ACTIVE
              ? `Student is ${student.status.toLowerCase()}`
              : `Student is in semester ${student.currentSemester}, final semester is ${student.program.totalSemesters}`,
        }));

      if (skipped.length > 0) {
        throw new ApiError({
          status: 400,
          code: "GRADUATION_VALIDATION_FAILED",
          message: "Some students are not eligible for graduation",
          details: skipped,
        });
      }

      if (students.length === 0) {
        return { graduated: 0, skipped: [] as Array<{ id: string; name: string; reason: string }> };
      }

      const now = new Date();
      const graduationYear = now.getFullYear();

      await tx.student.updateMany({
        where: {
          id: { in: students.map((student) => student.id) },
        },
        data: {
          status: StudentStatus.GRADUATED,
          graduationYear,
          graduationDate: now,
        },
      });

      await logStudentBulkAction(tx, req, "Bulk graduate students", {
        studentCount: students.length,
        graduationYear,
      });

      return { graduated: students.length, skipped: [] as Array<{ id: string; name: string; reason: string }> };
    });

    return ok(res, result);
  },

  async bulkUpdateStudentStatus(req: Request, res: Response) {
    const payload = req.body ?? {};

    if (Array.isArray(payload.studentIds) && payload.studentIds.length === 0) {
      throw new ApiError({
        status: 400,
        code: "STUDENT_IDS_REQUIRED",
        message: "studentIds must not be empty",
      });
    }

    if (payload.status === StudentStatus.GRADUATED) {
      throw new ApiError({
        status: 400,
        code: "INVALID_STUDENT_STATUS",
        message: "Use bulk-graduate to set students to GRADUATED",
      });
    }

    const parsed = parseOrThrow(bulkStatusSchema, payload);

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.student.updateMany({
        where: {
          id: { in: parsed.studentIds },
          deletedAt: null,
        },
        data: {
          status: parsed.status,
          graduationYear: null,
          graduationDate: null,
        },
      });

      await logStudentBulkAction(tx, req, "Bulk update student status", {
        studentCount: updated.count,
        status: parsed.status,
      });

      return { updated: updated.count };
    });

    return ok(res, result);
  },

  async bulkSoftDeleteStudents(req: Request, res: Response) {
    const payload = req.body ?? {};

    if (Array.isArray(payload.studentIds) && payload.studentIds.length === 0) {
      throw new ApiError({
        status: 400,
        code: "STUDENT_IDS_REQUIRED",
        message: "studentIds must not be empty",
      });
    }

    const parsed = parseOrThrow(bulkSoftDeleteSchema, payload);

    const result = await prisma.$transaction(async (tx) => {
      const deactivated = await tx.student.updateMany({
        where: {
          id: { in: parsed.studentIds },
          deletedAt: null,
        },
        data: {
          status: StudentStatus.INACTIVE,
          graduationYear: null,
          graduationDate: null,
        },
      });

      await logStudentBulkAction(tx, req, "Bulk deactivate students", {
        studentCount: deactivated.count,
        deactivatedAt: new Date().toISOString(),
      });

      return { deactivated: deactivated.count };
    });

    return ok(res, result);
  },

  async bulkAssignFaculty(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }
    const actorId = req.user.id;
    const bulkSchema = z.object({
      userId: z.string().trim().min(1, "userId is required"),
      offeringIds: z.array(z.string().trim().min(1)).min(1, "offeringIds must not be empty"),
    });
    const { userId, offeringIds } = parseOrThrow(bulkSchema, req.body);

    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) {
      throw new ApiError({ status: 404, code: "USER_NOT_FOUND", message: "User not found" });
    }

    await prisma.$transaction(async (tx) => {
      for (const offeringId of offeringIds) {
        const existing = await tx.facultyAssignment.findFirst({
          where: { courseOfferingId: offeringId, userId },
        });
        if (!existing) {
          await tx.facultyAssignment.create({
            data: { courseOfferingId: offeringId, userId },
          });
        }
      }
      await tx.activityLog.create({
        data: {
          userId: actorId,
          action: `Bulk-assigned faculty to ${offeringIds.length} offering(s)`,
          entityType: "offering",
          metadata: { userId, offeringIds } as Prisma.InputJsonValue,
        },
      });
    });

    return ok(res, { assigned: offeringIds.length });
  },
};
