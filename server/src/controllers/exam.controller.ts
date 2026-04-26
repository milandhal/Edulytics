import { Request, Response } from "express";
import { prisma } from "../utils/prisma.js";
import * as fs from "fs";
import { ExamComponent } from "@prisma/client";
import { ApiError } from "../middleware/errorHandler.js";
import { ok } from "../utils/response.js";

// ── helpers ────────────────────────────────────────────────────────────────

const COMP_MAP: Record<string, ExamComponent> = {
  mid: "MID_SEM",
  end: "END_SEM",
  quiz: "QUIZ",
  asn: "ASSIGNMENT",
  att: "ATTENDANCE",
};

function compEnum(s: string): ExamComponent | null {
  return COMP_MAP[s] ?? null;
}

const DEFAULT_CO_DEFINITIONS = [
  {
    coNumber: 1,
    label: "CO1",
    description: "Demonstrate foundational understanding of the subject concepts",
  },
  {
    coNumber: 2,
    label: "CO2",
    description: "Apply analytical and problem-solving techniques to course topics",
  },
  {
    coNumber: 3,
    label: "CO3",
    description: "Implement solutions using appropriate methods and tools",
  },
  {
    coNumber: 4,
    label: "CO4",
    description: "Evaluate outcomes using suitable reasoning, interpretation, or metrics",
  },
  {
    coNumber: 5,
    label: "CO5",
    description: "Integrate and extend course knowledge in practical or advanced scenarios",
  },
] as const;

async function ensureDefaultCoDefinitions(courseOfferingId: string) {
  const existing = await prisma.coDefinition.findMany({
    where: { courseOfferingId },
    orderBy: { coNumber: "asc" },
  });

  if (existing.length > 0) {
    return existing;
  }

  await prisma.coDefinition.createMany({
    data: DEFAULT_CO_DEFINITIONS.map((co) => ({
      courseOfferingId,
      coNumber: co.coNumber,
      label: co.label,
      description: co.description,
    })),
  });

  return prisma.coDefinition.findMany({
    where: { courseOfferingId },
    orderBy: { coNumber: "asc" },
  });
}
// ── GET /offerings/:id/setup/:comp ─────────────────────────────────────────

export async function getSetup(req: Request, res: Response) {
  const { id, comp } = req.params;

  const component = compEnum(comp);
  if (!component) {
    throw new ApiError({ status: 400, code: "INVALID_COMPONENT", message: "Invalid exam component" });
  }

  const offering = await prisma.courseOffering.findUnique({
    where: { id },
    include: {
      subject: { select: { code: true, name: true, type: true } },
      branch: { select: { code: true, name: true } },
      academicYear: { select: { label: true } },
    },
  });
  if (!offering) {
    throw new ApiError({ status: 404, code: "OFFERING_NOT_FOUND", message: "Offering not found" });
  }

  // Lab / Activity subjects have no question setup
  if (offering.subject.type === "LAB" || offering.subject.type === "ACTIVITY") {
    return ok(res, {
      requiresSetup: false,
      type: offering.subject.type,
      message: "Lab subjects use direct marks entry",
      cos: [],
      questions: [],
      offering: {
        courseCode: offering.subject.code,
        courseName: offering.subject.name,
        branch: offering.branch.code,
        branchName: offering.branch.name,
        sem: offering.semesterNumber,
        academicYear: offering.academicYear.label,
        subjectType: offering.subject.type,
      },
    });
  }

  const cos = await ensureDefaultCoDefinitions(id);

  // Find or create ExamSetup
  let setup = await prisma.examSetup.findUnique({
    where: { courseOfferingId_component: { courseOfferingId: id, component } },
    include: {
      questions: {
        include: { coDefinition: { select: { id: true, label: true } } },
        orderBy: { questionOrder: "asc" },
      },
    },
  });

  if (!setup) {
    setup = await prisma.examSetup.create({
      data: { courseOfferingId: id, component },
      include: {
        questions: {
          include: { coDefinition: { select: { id: true, label: true } } },
          orderBy: { questionOrder: "asc" },
        },
      },
    });
  }

  const hasMarksEntered = await prisma.studentMark.count({
    where: {
      examQuestion: {
        examSetupId: setup.id,
      },
      marksObtained: { not: null },
    },
  });

  return ok(res, {
    requiresSetup: true,
    isStructureLocked: setup.isStructureLocked,
    hasMarksEntered: hasMarksEntered > 0,
    cos: cos.map((c) => ({ id: c.id, label: c.label, desc: c.description ?? "" })),
    questions: setup.questions.map((q) => ({
      id: q.id,
      label: q.label,
      maxMarks: Number(q.maxMarks),
      coId: q.coDefinitionId,
      section: q.section,
      groupNumber: q.groupNumber,
    })),
    offering: {
      courseCode: offering.subject.code,
      courseName: offering.subject.name,
      branch: offering.branch.code,
      branchName: offering.branch.name,
      sem: offering.semesterNumber,
      academicYear: offering.academicYear.label,
      subjectType: offering.subject.type,
    },
  });
}
// ── POST /offerings/:id/setup/:comp ───────────────────────────────────────

export async function saveSetup(req: Request, res: Response) {
  const { id, comp } = req.params;
  const { questions } = req.body as {
    questions: Array<{
      label: string;
      maxMarks: number;
      coId: string;
      section?: string | null;
      groupNumber?: number | null;
    }>;
  };

  const component = compEnum(comp);
  if (!component) {
    throw new ApiError({ status: 400, code: "INVALID_COMPONENT", message: "Invalid exam component" });
  }
  if (!Array.isArray(questions)) {
    throw new ApiError({ status: 400, code: "INVALID_SETUP_PAYLOAD", message: "Questions payload is required" });
  }

  const offering = await prisma.courseOffering.findUnique({
    where: { id },
    include: { subject: { select: { type: true } } },
  });
  if (!offering) {
    throw new ApiError({ status: 404, code: "OFFERING_NOT_FOUND", message: "Offering not found" });
  }
  if (offering.subject.type === "LAB" || offering.subject.type === "ACTIVITY") {
    throw new ApiError({ status: 400, code: "LAB_NO_SETUP_REQUIRED", message: "This subject does not require CO setup" });
  }

  let setup = await prisma.examSetup.findUnique({
    where: { courseOfferingId_component: { courseOfferingId: id, component } },
  });

  if (!setup) {
    setup = await prisma.examSetup.create({ data: { courseOfferingId: id, component } });
  }

  // Replace all questions in a transaction
  try {
    await prisma.$transaction(async (tx) => {
      const coIds = Array.from(new Set(questions.map((q) => q.coId).filter(Boolean)));
      const validCos = await tx.coDefinition.findMany({
        where: {
          courseOfferingId: id,
          id: { in: coIds },
        },
        select: { id: true },
      });
      const validCoIds = new Set(validCos.map((co) => co.id));

      for (const question of questions) {
        if (!question.label?.trim()) {
          throw new ApiError({ status: 400, code: "INVALID_QUESTION_LABEL", message: "Question label cannot be empty" });
        }
        if (typeof question.maxMarks !== "number" || Number.isNaN(question.maxMarks) || question.maxMarks <= 0) {
          throw new ApiError({ status: 400, code: "INVALID_MAX_MARKS", message: "Question marks must be greater than 0" });
        }
        if (!question.coId || !validCoIds.has(question.coId)) {
          throw new ApiError({ status: 400, code: "INVALID_CO_REFERENCE", message: "Each question must map to a CO from this offering" });
        }
      }

      const incomingLabels = questions.map((q) => q.label.trim());

      // Delete questions that are no longer in the setup
      const questionsToDelete = await tx.examQuestion.findMany({
        where: {
          examSetupId: setup!.id,
          label: { notIn: incomingLabels },
        },
        select: { id: true },
      });

      if (questionsToDelete.length > 0) {
        const idsToDelete = questionsToDelete.map((q) => q.id);
        await tx.studentMark.deleteMany({
          where: { examQuestionId: { in: idsToDelete } },
        });
        await tx.examQuestion.deleteMany({
          where: { id: { in: idsToDelete } },
        });
      }

      // Upsert questions
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        await tx.examQuestion.upsert({
          where: {
            examSetupId_label: {
              examSetupId: setup!.id,
              label: q.label.trim(),
            },
          },
          update: {
            coDefinitionId: q.coId,
            maxMarks: q.maxMarks,
            section: (q.section === "A" ? "A" : q.section === "B" ? "B" : null) as any,
            groupNumber: q.groupNumber ?? null,
            questionOrder: i,
          },
          create: {
            examSetupId: setup!.id,
            coDefinitionId: q.coId,
            label: q.label.trim(),
            maxMarks: q.maxMarks,
            section: (q.section === "A" ? "A" : q.section === "B" ? "B" : null) as any,
            groupNumber: q.groupNumber ?? null,
            questionOrder: i,
          },
        });
      }
    });
    return ok(res, { success: true });
  } catch (err: any) {
    fs.writeFileSync('C:\\Users\\Rahul\\Desktop\\Backend\\SPARS\\v1\\spars\\server\\debug-error.log', (err.stack || String(err)) + '\nPAYLOAD:\n' + JSON.stringify(questions, null, 2));
    throw err;
  }
}

// ── POST /offerings/:id/setup/:comp/unlock ─────────────────────────────────

export async function unlockSetup(req: Request, res: Response) {
  const { id, comp } = req.params;
  const component = compEnum(comp);
  if (!component) return res.status(400).json({ error: "INVALID_COMPONENT" });

  const setup = await prisma.examSetup.findUnique({
    where: { courseOfferingId_component: { courseOfferingId: id, component } },
  });
  if (!setup) return res.status(404).json({ error: "SETUP_NOT_FOUND" });

  await prisma.examSetup.update({ where: { id: setup.id }, data: { isStructureLocked: false } });
  return res.json({ success: true });
}

// ── GET /offerings/:id/enrolled ────────────────────────────────────────────

export async function getEnrolledStudents(req: Request, res: Response) {
  const { id } = req.params;
  const offering = await prisma.courseOffering.findUnique({
    where: { id },
    select: { branchId: true, semesterNumber: true },
  });
  if (!offering) {
    throw new ApiError({ status: 404, code: "OFFERING_NOT_FOUND", message: "Offering not found" });
  }

  const students = await prisma.student.findMany({
    where: {
      deletedAt: null,
      branchId: offering.branchId,
      currentSemester: offering.semesterNumber,
      status: "ACTIVE",
    },
    select: { id: true, registrationNumber: true, name: true },
    orderBy: { registrationNumber: "asc" },
  });

  return ok(res, { students });
}

// ── GET /offerings/:id/marks/:comp ─────────────────────────────────────────

export async function getMarks(req: Request, res: Response) {
  const { id, comp } = req.params;
  const component = compEnum(comp);
  if (!component) {
    throw new ApiError({ status: 400, code: "INVALID_COMPONENT", message: "Invalid exam component" });
  }

  const offering = await prisma.courseOffering.findUnique({
    where: { id },
    select: { branchId: true, semesterNumber: true },
  });
  if (!offering) {
    throw new ApiError({ status: 404, code: "OFFERING_NOT_FOUND", message: "Offering not found" });
  }

  const students = await prisma.student.findMany({
    where: {
      deletedAt: null,
      branchId: offering.branchId,
      currentSemester: offering.semesterNumber,
      status: "ACTIVE",
    },
    select: { id: true },
    orderBy: { registrationNumber: "asc" },
  });
  const studentIds = students.map((student) => student.id);

  // Attendance special case
  if (component === "ATTENDANCE") {
    const entries = await prisma.attendanceEntry.findMany({
      where: { courseOfferingId: id, studentId: { in: studentIds } },
    });
    const marks: Record<string, { score: number }> = {};
    for (const e of entries) {
      marks[e.studentId] = { score: Number(e.score) };
    }
    return ok(res, { marks });
  }

  const setup = await prisma.examSetup.findUnique({
    where: { courseOfferingId_component: { courseOfferingId: id, component } },
    include: { questions: { select: { id: true } } },
  });

  if (!setup || setup.questions.length === 0) return ok(res, { marks: {} });

  const questionIds = setup.questions.map((q) => q.id);

  const allMarks = await prisma.studentMark.findMany({
    where: { examQuestionId: { in: questionIds }, studentId: { in: studentIds } },
  });

  // Build matrix: { [studentId]: { [questionId]: number | null } }
  const matrix: Record<string, Record<string, number | null>> = {};
  for (const sid of studentIds) {
    matrix[sid] = {};
    for (const qid of questionIds) matrix[sid][qid] = null;
  }
  for (const m of allMarks) {
    matrix[m.studentId][m.examQuestionId] = m.marksObtained !== null ? Number(m.marksObtained) : null;
  }

  return ok(res, { marks: matrix });
}

// ── GET /offerings/:id/marks/:comp/student/:sid ────────────────────────────

export async function getStudentMarks(req: Request, res: Response) {
  const { id, comp, sid } = req.params;
  const component = compEnum(comp);
  if (!component) {
    throw new ApiError({ status: 400, code: "INVALID_COMPONENT", message: "Invalid exam component" });
  }

  if (component === "ATTENDANCE") {
    const entry = await prisma.attendanceEntry.findUnique({
      where: { studentId_courseOfferingId: { studentId: sid, courseOfferingId: id } },
    });
    return ok(res, { marks: { score: entry ? Number(entry.score) : null } });
  }

  const setup = await prisma.examSetup.findUnique({
    where: { courseOfferingId_component: { courseOfferingId: id, component } },
    include: { questions: { select: { id: true } } },
  });

  if (!setup) return ok(res, { marks: {} });

  const marksRows = await prisma.studentMark.findMany({
    where: { studentId: sid, examQuestionId: { in: setup.questions.map((q) => q.id) } },
  });

  const marks: Record<string, number | null> = {};
  for (const q of setup.questions) marks[q.id] = null;
  for (const m of marksRows) {
    marks[m.examQuestionId] = m.marksObtained !== null ? Number(m.marksObtained) : null;
  }

  return ok(res, { marks });
}

// ── PUT /offerings/:id/marks/:comp/student/:sid ────────────────────────────

export async function saveStudentMarks(req: Request, res: Response) {
  const { id, comp, sid } = req.params;
  const component = compEnum(comp);
  if (!component) {
    throw new ApiError({ status: 400, code: "INVALID_COMPONENT", message: "Invalid exam component" });
  }

  // Check if offering is marks-locked
  const offering = await prisma.courseOffering.findUnique({
    where: { id },
    select: { isMarksLocked: true },
  });
  if (!offering) {
    throw new ApiError({ status: 404, code: "OFFERING_NOT_FOUND", message: "Offering not found" });
  }
  if (offering.isMarksLocked) {
    throw new ApiError({ status: 403, code: "MARKS_LOCKED", message: "Marks entry is locked for this offering" });
  }

  // ATTENDANCE special case
  if (component === "ATTENDANCE") {
    const { attendanceScore } = req.body as { attendanceScore: number };
    if (typeof attendanceScore !== "number") {
      throw new ApiError({ status: 400, code: "INVALID_ATTENDANCE_SCORE", message: "Attendance score must be a number" });
    }
    await prisma.attendanceEntry.upsert({
      where: { studentId_courseOfferingId: { studentId: sid, courseOfferingId: id } },
      update: { score: attendanceScore },
      create: { studentId: sid, courseOfferingId: id, score: attendanceScore },
    });
    return ok(res, { success: true });
  }

  const { marks } = req.body as { marks: Record<string, number | null> };
  if (!marks || typeof marks !== "object") {
    throw new ApiError({ status: 400, code: "INVALID_MARKS_PAYLOAD", message: "Marks payload is required" });
  }

  const setup = await prisma.examSetup.findUnique({
    where: { courseOfferingId_component: { courseOfferingId: id, component } },
  });
  if (!setup) {
    throw new ApiError({ status: 404, code: "SETUP_NOT_FOUND", message: "CO setup not found for this component" });
  }

  // Upsert each mark
  await prisma.$transaction(
    Object.entries(marks).map(([questionId, value]) =>
      prisma.studentMark.upsert({
        where: { studentId_examQuestionId: { studentId: sid, examQuestionId: questionId } },
        update: { marksObtained: value },
        create: { studentId: sid, examQuestionId: questionId, marksObtained: value },
      }),
    ),
  );

  // Auto-lock feature removed by user request
  return ok(res, { success: true });
}

// ── PUT /offerings/:id/marks/:comp/question/:qid ───────────────────────────
export async function saveQuestionMarks(req: Request, res: Response) {
  const { id, comp, qid } = req.params;
  const component = compEnum(comp);
  if (!component) {
    throw new ApiError({ status: 400, code: "INVALID_COMPONENT", message: "Invalid exam component" });
  }

  const offering = await prisma.courseOffering.findUnique({
    where: { id },
    select: { isMarksLocked: true },
  });
  if (!offering) {
    throw new ApiError({ status: 404, code: "OFFERING_NOT_FOUND", message: "Offering not found" });
  }
  if (offering.isMarksLocked) {
    throw new ApiError({ status: 403, code: "MARKS_LOCKED", message: "Marks entry is locked for this offering" });
  }

  const { marks } = req.body as { marks: Record<string, number | null> };

  const setup = await prisma.examSetup.findUnique({
    where: { courseOfferingId_component: { courseOfferingId: id, component } },
  });
  if (!setup) {
    throw new ApiError({ status: 404, code: "SETUP_NOT_FOUND", message: "CO setup not found for this component" });
  }

  await prisma.$transaction(
    Object.entries(marks).map(([sid, value]) =>
      prisma.studentMark.upsert({
        where: { studentId_examQuestionId: { studentId: sid, examQuestionId: qid } },
        update: { marksObtained: value },
        create: { studentId: sid, examQuestionId: qid, marksObtained: value },
      }),
    ),
  );

  if (!setup.isStructureLocked) {
    const anyMark = await prisma.studentMark.findFirst({
      where: { examQuestion: { examSetupId: setup.id } },
    });
    if (anyMark) {
      await prisma.examSetup.update({ where: { id: setup.id }, data: { isStructureLocked: true } });
    }
  }

  return ok(res, { success: true });
}

export async function addCO(req: Request, res: Response) {
  const { id } = req.params;
  const { desc } = req.body;

  const existing = await prisma.coDefinition.findMany({
    where: { courseOfferingId: id },
    orderBy: { coNumber: "asc" },
  });

  // Find next available coNumber (handles gaps from deletions)
  const usedNumbers = new Set(existing.map((c) => c.coNumber));
  let n = 1;
  while (usedNumbers.has(n)) n++;

  const co = await prisma.coDefinition.create({
    data: {
      courseOfferingId: id,
      coNumber: n,
      label: `CO${n}`,
      description: desc || `Description for CO${n}`,
    },
  });

  return ok(res, { id: co.id, label: co.label, desc: co.description ?? "" });
}

export async function updateCO(req: Request, res: Response) {
  const { coId } = req.params;
  const { desc, label } = req.body;

  const co = await prisma.coDefinition.findUnique({ where: { id: coId } });
  if (!co) return res.status(404).json({ error: "CO_NOT_FOUND" });

  const updated = await prisma.coDefinition.update({
    where: { id: coId },
    data: {
      ...(desc !== undefined && { description: desc }),
      ...(label !== undefined && { label }),
    },
  });

  return res.json({ id: updated.id, label: updated.label, desc: updated.description ?? "" });
}

export async function removeCO(req: Request, res: Response) {
  const { coId } = req.params;
  const force = req.query.force === "true";

  const co = await prisma.coDefinition.findUnique({ where: { id: coId } });
  if (!co) return res.status(404).json({ error: "CO_NOT_FOUND" });

  const used = await prisma.examQuestion.count({ where: { coDefinitionId: coId } });

  if (used > 0 && !force) {
    return res.status(400).json({
      error: "CO_IN_USE",
      message: `CO maps to ${used} question(s). Use ?force=true to cascade-delete.`,
      questionCount: used,
    });
  }

  // Cascade: unlink questions from this CO, then delete the CO
  await prisma.$transaction(async (tx) => {
    const questionsToDelete = await tx.examQuestion.findMany({
      where: { coDefinitionId: coId },
      select: { id: true },
    });
    
    if (questionsToDelete.length > 0) {
      const idsToDelete = questionsToDelete.map((q) => q.id);
      await tx.studentMark.deleteMany({
        where: { examQuestionId: { in: idsToDelete } },
      });
      await tx.examQuestion.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }
    
    await tx.coDefinition.delete({ where: { id: coId } });
  });

  return res.json({ success: true, cascadedQuestions: used });
}

export async function resetCOs(req: Request, res: Response) {
  const { id } = req.params;

  const offering = await prisma.courseOffering.findUnique({ where: { id } });
  if (!offering) return res.status(404).json({ error: "OFFERING_NOT_FOUND" });

  await prisma.$transaction(async (tx) => {
    // Get all CO ids for this offering
    const oldCOs = await tx.coDefinition.findMany({
      where: { courseOfferingId: id },
      select: { id: true },
    });
    const coIds = oldCOs.map((c) => c.id);

    // Delete all questions referencing these COs
    if (coIds.length > 0) {
      const questionsToDelete = await tx.examQuestion.findMany({
        where: { coDefinitionId: { in: coIds } },
        select: { id: true },
      });
      
      if (questionsToDelete.length > 0) {
        const idsToDelete = questionsToDelete.map((q) => q.id);
        await tx.studentMark.deleteMany({
          where: { examQuestionId: { in: idsToDelete } },
        });
        await tx.examQuestion.deleteMany({
          where: { id: { in: idsToDelete } },
        });
      }
    }

    // Delete all old COs
    await tx.coDefinition.deleteMany({ where: { courseOfferingId: id } });

    // Recreate CO1-CO5 with clean data
    const defaultDescs = [
      "Understand fundamental concepts of the subject",
      "Analyze and evaluate key techniques and methods",
      "Design solutions to standard problems",
      "Apply theoretical knowledge to practical scenarios",
      "Synthesize and assess advanced topics",
    ];
    await tx.coDefinition.createMany({
      data: defaultDescs.map((desc, i) => ({
        courseOfferingId: id,
        coNumber: i + 1,
        label: `CO${i + 1}`,
        description: desc,
      })),
    });
  });

  // Return the fresh COs
  const fresh = await prisma.coDefinition.findMany({
    where: { courseOfferingId: id },
    orderBy: { coNumber: "asc" },
  });

  return res.json({
    success: true,
    cos: fresh.map((c) => ({ id: c.id, label: c.label, desc: c.description ?? "" })),
  });
}
