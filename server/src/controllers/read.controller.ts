import type { Request, Response } from "express";
import { ExamComponent, Prisma, StudentStatus } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { ok } from "../utils/response.js";
import { ApiError } from "../middleware/errorHandler.js";

function displayFacultyName(user: { name: string | null | undefined; email: string }) {
  if (user.name && user.name.trim()) {
    return user.name.trim();
  }

  const localPart = user.email.split("@")[0] ?? "user";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value == null) {
    return 0;
  }

  return Number(value);
}

function parsePositiveInt(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildStudentStatusFilter(value: unknown): Prisma.StudentWhereInput {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";

  if (!normalized || normalized === "ACTIVE") {
    return { status: StudentStatus.ACTIVE };
  }

  if (normalized === "ALL") {
    return {};
  }

  if (Object.values(StudentStatus).includes(normalized as StudentStatus)) {
    return { status: normalized as StudentStatus };
  }

  return { status: StudentStatus.ACTIVE };
}

function normalizeProgramCode(name: string, type: "UG" | "PG") {
  const normalized = name.replace(/[^A-Za-z]/g, "").toUpperCase();

  if (normalized === "BTECH") return "BTECH";
  if (normalized === "BARCH") return "BARCH";
  if (normalized === "MCA") return "MCA";
  if (normalized === "MTECH") return "MTECH";
  if (normalized === "MSC" || normalized === "MSCINT") return "MSC";
  if (normalized === "MBA") return "MBA";

  return normalized || type;
}

const offeringSummarySelect = Prisma.validator<Prisma.CourseOfferingSelect>()({
  id: true,
  semesterNumber: true,
  isSetupLocked: true,
  isMarksLocked: true,
  academicYear: {
    select: {
      label: true,
    },
  },
  subject: {
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      credits: true,
      lectureHours: true,
      tutorialHours: true,
      practicalHours: true,
    },
  },
  branch: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  facultyAssignments: {
    orderBy: { createdAt: "asc" },
    select: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          department: true,
        },
      },
    },
  },
  examSetups: {
    select: {
      component: true,
      questions: {
        select: {
          _count: {
            select: {
              studentMarks: {
                where: {
                  marksObtained: { not: null },
                },
              },
            },
          },
        },
      },
    },
  },
  attendanceEntries: {
    select: {
      id: true,
    },
  },
  _count: {
    select: {
      studentEnrollments: true,
    },
  },
});

type OfferingSummaryRecord = Prisma.CourseOfferingGetPayload<{
  select: typeof offeringSummarySelect;
}>;

type OfferingStudentCountLookup = Map<string, number>;

function offeringStudentCountKey(branchId: string, semesterNumber: number) {
  return `${branchId}:${semesterNumber}`;
}

async function getOfferingStudentCountLookup(
  offerings: Array<{ branch: { id: string }; semesterNumber: number }>,
) {
  if (offerings.length === 0) {
    return new Map() as OfferingStudentCountLookup;
  }

  const uniquePairs = Array.from(
    new Map(
      offerings.map((offering) => [
        offeringStudentCountKey(offering.branch.id, offering.semesterNumber),
        {
          branchId: offering.branch.id,
          currentSemester: offering.semesterNumber,
        },
      ]),
    ).values(),
  );

  const counts = await prisma.student.groupBy({
    by: ["branchId", "currentSemester"],
    where: {
      deletedAt: null,
      status: StudentStatus.ACTIVE,
      OR: uniquePairs.map((pair) => ({
        branchId: pair.branchId,
        currentSemester: pair.currentSemester,
      })),
    },
    _count: {
      _all: true,
    },
  });

  return counts.reduce<OfferingStudentCountLookup>((acc, item) => {
    acc.set(
      offeringStudentCountKey(item.branchId, item.currentSemester),
      item._count._all,
    );
    return acc;
  }, new Map());
}

function toPercent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round((numerator / denominator) * 100)));
}

function buildMarksProgress(offering: OfferingSummaryRecord) {
  const enrolledStudents = offering._count.studentEnrollments;
  const progress = {
    mid: 0,
    quiz: 0,
    asn: 0,
    att: 0,
    end: 0,
  };

  for (const setup of offering.examSetups) {
    const questionCount = setup.questions.length;
    const filledMarks = setup.questions.reduce(
      (sum, question) => sum + question._count.studentMarks,
      0,
    );
    const expectedMarks = enrolledStudents * questionCount;
    const percentage = toPercent(filledMarks, expectedMarks);

    if (setup.component === ExamComponent.MID_SEM) {
      progress.mid = percentage;
    } else if (setup.component === ExamComponent.QUIZ) {
      progress.quiz = percentage;
    } else if (setup.component === ExamComponent.ASSIGNMENT) {
      progress.asn = percentage;
    } else if (setup.component === ExamComponent.END_SEM) {
      progress.end = percentage;
    }
  }

  progress.att = toPercent(offering.attendanceEntries.length, enrolledStudents);

  return progress;
}

function countPendingComponents(progress: ReturnType<typeof buildMarksProgress>) {
  return Object.values(progress).filter((value) => value < 100).length;
}

function buildSetupProgress(offering: OfferingSummaryRecord) {
  const progress = {
    mid: false,
    quiz: false,
    asn: false,
    att: true,
    end: false,
  };

  for (const setup of offering.examSetups) {
    if (setup.component === ExamComponent.MID_SEM) {
      progress.mid = true;
    } else if (setup.component === ExamComponent.QUIZ) {
      progress.quiz = true;
    } else if (setup.component === ExamComponent.ASSIGNMENT) {
      progress.asn = true;
    } else if (setup.component === ExamComponent.END_SEM) {
      progress.end = true;
    }
  }

  return progress;
}

async function buildOfferingWhere(
  query: Request["query"],
): Promise<Prisma.CourseOfferingWhereInput | null> {
  const { programCode, branchCode, semester, academicYear } = query;

  let programId: string | undefined;
  if (typeof programCode === "string" && programCode) {
    const requestedCode = programCode.toUpperCase();
    const programs = await prisma.program.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, type: true },
    });
    const resolvedProgram = programs.find(
      (item) => normalizeProgramCode(item.name, item.type) === requestedCode,
    );

    if (!resolvedProgram) {
      return null;
    }

    programId = resolvedProgram.id;
  }

  let resolvedBranchId: string | undefined;
  if (typeof branchCode === "string" && branchCode) {
    const branch = await prisma.branch.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        code: branchCode.toUpperCase(),
        ...(programId ? { programId } : {}),
      },
      select: { id: true },
    });

    if (!branch) {
      return null;
    }

    resolvedBranchId = branch.id;
  }

  const parsedSemester =
    typeof semester === "string" && semester ? Number(semester) : undefined;

  return {
    deletedAt: null,
    ...(programId ? { branch: { programId } } : {}),
    ...(resolvedBranchId ? { branchId: resolvedBranchId } : {}),
    ...(Number.isFinite(parsedSemester) ? { semesterNumber: parsedSemester } : {}),
    ...(typeof academicYear === "string" && academicYear
      ? { academicYear: { label: academicYear } }
      : {}),
  };
}

function emptyOfferingsResponse(res: Response, query: Request["query"]) {
  const currentPage = parsePositiveInt(query.page, 1);
  const size = parsePositiveInt(query.pageSize, 20);

  return ok(res, {
    data: [],
    total: 0,
    page: currentPage,
    pageSize: size,
  });
}

async function listOfferingsByWhere(
  res: Response,
  query: Request["query"],
  where: Prisma.CourseOfferingWhereInput,
) {
  const currentPage = parsePositiveInt(query.page, 1);
  const size = parsePositiveInt(query.pageSize, 20);

  const [total, offerings] = await Promise.all([
    prisma.courseOffering.count({ where }),
    prisma.courseOffering.findMany({
      where,
      select: offeringSummarySelect,
      orderBy: [{ semesterNumber: "asc" }, { createdAt: "desc" }],
      skip: (currentPage - 1) * size,
      take: size,
    }),
  ]);

  const studentCountLookup = await getOfferingStudentCountLookup(offerings);

  return ok(res, {
    data: offerings.map((offering) => serializeOfferingSummary(offering, studentCountLookup)),
    total,
    page: currentPage,
    pageSize: size,
  });
}

function serializeOfferingSummary(
  offering: OfferingSummaryRecord,
  studentCountLookup?: OfferingStudentCountLookup,
) {
  const studentCount = studentCountLookup?.get(
    offeringStudentCountKey(offering.branch.id, offering.semesterNumber),
  ) ?? offering._count.studentEnrollments;

  return {
    id: offering.id,
    semesterNumber: offering.semesterNumber,
    academicYear: {
      label: offering.academicYear.label,
    },
    subject: {
      id: offering.subject.id,
      code: offering.subject.code,
      name: offering.subject.name,
      type: offering.subject.type,
      credits: toNumber(offering.subject.credits),
      lectureHours: offering.subject.lectureHours,
      tutorialHours: offering.subject.tutorialHours,
      practicalHours: offering.subject.practicalHours,
    },
    branch: offering.branch,
    facultyAssignments: offering.facultyAssignments.map((assignment) => ({
      user: {
        id: assignment.user.id,
        name: displayFacultyName(assignment.user),
        email: assignment.user.email,
        department: assignment.user.department ?? "",
      },
    })),
    _count: offering._count,
    studentCount,
    marksProgress: buildMarksProgress(offering),
    setupProgress: buildSetupProgress(offering),
    isStructureLocked: offering.isSetupLocked,
    isMarksLocked: offering.isMarksLocked,
  };
}

export const ReadController = {
  async adminDashboard(_req: Request, res: Response) {
    const [
      totalStudents,
      facultyCount,
      activeOfferings,
      programsCount,
      branches,
      recentLogs,
    ] = await Promise.all([
      prisma.student.count({ where: { deletedAt: null } }),
      prisma.user.count({
        where: { deletedAt: null, isActive: true, role: "FACULTY" },
      }),
      prisma.courseOffering.count({ where: { deletedAt: null } }),
      prisma.program.count({ where: { deletedAt: null, isActive: true } }),
      prisma.branch.findMany({
        where: { deletedAt: null, isActive: true, program: { type: 'UG' } },
        include: {
          students: {
            where: { deletedAt: null },
            select: { id: true },
          },
        },
        orderBy: { code: "asc" },
        take: 8,
      }),
      prisma.activityLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        include: {
          user: {
            select: { name: true, email: true },
          },
        },
      }),
    ]);

    const branchPerformance = branches.map((branch) => ({
      id: branch.id,
      code: branch.code,
      name: branch.name,
      students: branch.students.length,
      cgpa: 0,
      pass: 0,
      backlogs: 0,
      trend: "stable" as const,
    }));

    const recentActivity = recentLogs.map((log) => ({
      icon: "history",
      color: "#586064",
      text: `${displayFacultyName(log.user)} - ${log.action}`,
      time: log.createdAt.toLocaleString("en-IN"),
    }));

    return ok(res, {
      totalStudents,
      facultyCount,
      activeOfferings,
      programsCount,
      pendingMarks: activeOfferings,
      branchPerformance,
      gradeDistribution: [],
      recentActivity,
      marksProgress: [
        { label: "Mid Sem", filled: 0, total: activeOfferings, col: "#005bc1" },
        { label: "Quiz", filled: 0, total: activeOfferings, col: "#0096c7" },
        { label: "Assignment", filled: 0, total: activeOfferings, col: "#0077b6" },
        { label: "Attendance", filled: 0, total: activeOfferings, col: "#16a34a" },
        { label: "End Sem", filled: 0, total: activeOfferings, col: "#d97706" },
      ],
      passRates: [],
    });
  },

  async teacherDashboard(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }

    const [assignments, recentLogs] = await Promise.all([
      prisma.facultyAssignment.findMany({
        where: { userId: req.user.id },
        select: {
          courseOffering: {
            select: {
              ...offeringSummarySelect,
              coDefinitions: {
                orderBy: { coNumber: "asc" },
                select: { label: true },
              },
            },
          },
        },
      }),
      prisma.activityLog.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    let pendingComponents = 0;
    const studentCountLookup = await getOfferingStudentCountLookup(
      assignments.map((assignment) => assignment.courseOffering),
    );

    const subjects = assignments.map((assignment, index) => {
      const students = studentCountLookup.get(
        offeringStudentCountKey(
          assignment.courseOffering.branch.id,
          assignment.courseOffering.semesterNumber,
        ),
      ) ?? assignment.courseOffering._count.studentEnrollments;
      const accent = ["#005bc1", "#0077b6", "#0096c7", "#00b4d8"][index % 4] ?? "#005bc1";
      const marksProgress = buildMarksProgress(assignment.courseOffering);

      pendingComponents += countPendingComponents(marksProgress);

      return {
        code: assignment.courseOffering.subject.code,
        name: assignment.courseOffering.subject.name,
        branch: assignment.courseOffering.branch.code,
        sem: assignment.courseOffering.semesterNumber,
        students,
        accent,
        components: {
          mid: { filled: 0, total: students },
          quiz: { filled: 0, total: students },
          asn: { filled: 0, total: students },
          att: { filled: 0, total: students },
          end: { filled: 0, total: students },
        },
        co: assignment.courseOffering.coDefinitions.slice(0, 5).map((co) => ({
          co: co.label,
          level: 0,
        })),
        passRate: 0,
      };
    });

    const totalStudents = Array.from(studentCountLookup.values()).reduce((sum, count) => sum + count, 0);

    return ok(res, {
      subjects,
      passRate: 0,
      passedStudents: 0,
      failedStudents: 0,
      totalStudents,
      activity: recentLogs.map((log) => ({
        icon: "history",
        col: "#586064",
        text: log.action,
        time: log.createdAt.toLocaleString("en-IN"),
      })),
      pendingComponents,
    });
  },

  async listStudents(req: Request, res: Response) {
    const {
      search,
      program,
      branch,
      semester,
      section,
      batch,
      status,
      hasBacklog,
      page,
      limit,
    } = req.query;

    const currentPage = parsePositiveInt(page, 1);
    const pageSize = parsePositiveInt(limit, 20);

    const where: Prisma.StudentWhereInput = {
      deletedAt: null,
      ...(typeof search === "string" && search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { registrationNumber: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(typeof program === "string" && program
        ? { program: { name: { equals: program, mode: "insensitive" } } }
        : {}),
      ...(typeof branch === "string" && branch
        ? { branch: { code: branch.toUpperCase() } }
        : {}),
      ...(typeof semester === "string" && semester
        ? { currentSemester: Number(semester) }
        : {}),
      ...(typeof section === "string" && section
        ? { section }
        : {}),
      ...(typeof batch === "string" && batch
        ? { admissionYear: Number(batch) }
        : {}),
      ...buildStudentStatusFilter(status),
      ...(hasBacklog === "true"
        ? { backlogs: { some: { isCleared: false } } }
        : {}),
    };

    const [total, active, inactive, backlogCount, students] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.count({ where: { ...where, status: StudentStatus.ACTIVE } }),
      prisma.student.count({ where: { ...where, status: { not: StudentStatus.ACTIVE } } }),
      prisma.student.count({ where: { ...where, backlogs: { some: { isCleared: false } } } }),
      prisma.student.findMany({
        where,
        include: {
          program: { select: { name: true } },
          branch: { select: { code: true } },
          backlogs: {
            where: { isCleared: false },
            select: { id: true },
          },
        },
        orderBy: { registrationNumber: "asc" },
        skip: (currentPage - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return ok(res, {
      data: students.map((student) => ({
        id: student.id,
        reg: student.registrationNumber,
        name: student.name,
        email: student.email,
        phone: student.phone,
        program: student.program.name,
        branch: student.branch.code,
        sem: student.currentSemester,
        section: student.section ?? "",
        batch: student.admissionYear,
        cgpa: 0,
        backlogs: student.backlogs.length,
        active: student.status === StudentStatus.ACTIVE,
        status: student.status,
        graduationYear: student.graduationYear,
        graduationDate: student.graduationDate?.toISOString() ?? null,
      })),
      meta: {
        total,
        active,
        backlogs: backlogCount,
        inactive,
      },
    });
  },

  async getStudentDetail(req: Request, res: Response) {
    const student = await prisma.student.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: {
        program: { select: { id: true, name: true, type: true } },
        branch: { select: { id: true, code: true, name: true } },
        enrollments: {
          include: {
            courseOffering: {
              include: {
                subject: { select: { id: true, code: true, name: true, type: true } },
                academicYear: { select: { label: true } },
              },
            },
          },
        },
        backlogs: {
          where: { isCleared: false },
          select: { id: true },
        },
      },
    });

    if (!student) {
      throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Student not found" });
    }

    return ok(res, {
      id: student.id,
      registrationNumber: student.registrationNumber,
      name: student.name,
      email: student.email,
      phone: student.phone,
      status: student.status,
      admissionYear: student.admissionYear,
      currentSemester: student.currentSemester,
      section: student.section,
      graduationYear: student.graduationYear,
      graduationDate: student.graduationDate?.toISOString() ?? null,
      program: {
        id: student.program.id,
        name: student.program.name,
        type: student.program.type,
      },
      branch: {
        id: student.branch.id,
        code: student.branch.code,
        name: student.branch.name,
      },
      metrics: {
        activeBacklogs: student.backlogs.length,
        enrolledSubjects: student.enrollments.length,
      },
      enrollments: student.enrollments.map((enrollment) => ({
        offeringId: enrollment.courseOfferingId,
        semesterNumber: enrollment.courseOffering.semesterNumber,
        academicYear: enrollment.courseOffering.academicYear.label,
        subject: enrollment.courseOffering.subject,
      })),
    });
  },

  async listPrograms(_req: Request, res: Response) {
    const programs = await prisma.program.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    });

    return ok(
      res,
      programs.map((program) => ({
        id: program.id,
        name: program.name,
        code: normalizeProgramCode(program.name, program.type),
        type: program.type,
        totalSemesters: program.totalSemesters,
        isActive: program.isActive,
      })),
    );
  },

  async listBranches(req: Request, res: Response) {
    const { programId, programCode } = req.query;

    let resolvedProgramId = typeof programId === "string" && programId ? programId : undefined;

    if (!resolvedProgramId && typeof programCode === "string" && programCode) {
      const programs = await prisma.program.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true, name: true, type: true },
      });

      const matchedProgram = programs.find(
        (program) => normalizeProgramCode(program.name, program.type) === programCode.toUpperCase(),
      );

      if (!matchedProgram) {
        return ok(res, []);
      }

      resolvedProgramId = matchedProgram.id;
    }

    const branches = await prisma.branch.findMany({
      where: {
        deletedAt: null,
        ...(resolvedProgramId ? { programId: resolvedProgramId } : {}),
      },
      include: {
        program: {
          select: { name: true, type: true, totalSemesters: true },
        },
      },
      orderBy: [{ code: "asc" }, { name: "asc" }],
    });

    return ok(
      res,
      branches.map((branch) => ({
        id: branch.id,
        name: branch.name,
        code: branch.code,
        programId: branch.programId,
        programCode: normalizeProgramCode(branch.program.name, branch.program.type),
        totalSemesters: branch.program.totalSemesters,
        isActive: branch.isActive,
      })),
    );
  },

  async listAcademicYears(_req: Request, res: Response) {
    const academicYears = await prisma.academicYear.findMany({
      where: { deletedAt: null },
      orderBy: [{ isCurrent: "desc" }, { startYear: "desc" }],
    });

    return ok(
      res,
      academicYears.map((academicYear) => ({
        id: academicYear.id,
        label: academicYear.label,
        startYear: academicYear.startYear,
        endYear: academicYear.endYear,
        isCurrent: academicYear.isCurrent,
      })),
    );
  },

  async getBranchStats(req: Request, res: Response) {
    const { id } = req.params;
    const branch = await prisma.branch.findUnique({ where: { id } });
    if (!branch) {
      throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Branch not found" });
    }

    const studentCount = await prisma.student.count({ where: { branchId: id, deletedAt: null } });
    const offeringCount = await prisma.courseOffering.count({ where: { branchId: id, deletedAt: null } });

    return ok(res, { studentCount, offeringCount });
  },

  async listSubjects(_req: Request, res: Response) {
    const subjects = await prisma.subject.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        credits: true,
        lectureHours: true,
        tutorialHours: true,
        practicalHours: true,
        courseOfferings: {
          where: { deletedAt: null },
          select: {
            semesterNumber: true,
            branch: {
              select: {
                code: true,
                name: true,
                program: {
                  select: {
                    name: true,
                    type: true,
                  },
                },
              },
            },
          },
          orderBy: [{ branch: { code: "asc" } }, { semesterNumber: "asc" }],
        },
      },
    });

    return ok(
      res,
      subjects.map((subject) => ({
        id: subject.id,
        code: subject.code,
        name: subject.name,
        type: subject.type,
        credits: toNumber(subject.credits),
        lectureHours: subject.lectureHours,
        tutorialHours: subject.tutorialHours,
        practicalHours: subject.practicalHours,
        usedIn: subject.courseOfferings.map((offering) => ({
          programCode: normalizeProgramCode(offering.branch.program.name, offering.branch.program.type),
          branchCode: offering.branch.code,
          branchName: offering.branch.name,
          semester: offering.semesterNumber,
        })),
      })),
    );
  },

  async listUploadHistory(req: Request, res: Response) {
    const type = typeof req.query.type === "string" ? req.query.type.toUpperCase() : undefined;

    const logs = await prisma.activityLog.findMany({
      where: {
        entityType: "upload_history",
        ...(type ? { metadata: { path: ["type"], equals: type } } : {}),
      },
      include: {
        user: {
          select: { email: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    return ok(
      res,
      logs.map((log) => {
        const metadata = (log.metadata ?? {}) as Record<string, unknown>;

        return {
          id: log.id,
          filename: String(metadata.filename ?? ""),
          rowCount: Number(metadata.rowCount ?? 0),
          successCount: Number(metadata.successCount ?? 0),
          errorCount: Number(metadata.errorCount ?? 0),
          uploadedAt: String(metadata.uploadedAt ?? log.createdAt.toISOString()),
          uploadedBy: log.user.email,
          type: String(metadata.type ?? ""),
          status: String(metadata.status ?? "DONE"),
        };
      }),
    );
  },

  async getGrades(_req: Request, res: Response) {
    const grades = await prisma.gradeConfig.findMany({
      orderBy: { gradePoint: "desc" },
      select: {
        grade: true,
        minScore: true,
        maxScore: true,
        gradePoint: true,
      },
    });

    return ok(
      res,
      grades.map((grade) => ({
        grade: grade.grade,
        minScore: grade.minScore,
        maxScore: grade.maxScore,
        points: grade.gradePoint,
      })),
    );
  },

  async getAttainmentSettings(_req: Request, res: Response) {
    const configs = await prisma.attainmentConfig.findMany({
      orderBy: { level: "asc" },
      select: {
        level: true,
        studentPercentageThreshold: true,
      },
    });

    const lookup = new Map(configs.map((config) => [config.level, config.studentPercentageThreshold]));

    return ok(res, {
      level1: lookup.get(1) ?? 0,
      level2: lookup.get(2) ?? 0,
      level3: lookup.get(3) ?? 0,
    });
  },

  async listOfferings(req: Request, res: Response) {
    const where = await buildOfferingWhere(req.query);

    if (!where) {
      return emptyOfferingsResponse(res, req.query);
    }

    return listOfferingsByWhere(res, req.query, where);
  },

  async listMyOfferings(req: Request, res: Response) {
    if (!req.user) {
      throw new ApiError({ status: 401, code: "TOKEN_MISSING", message: "Missing access token" });
    }

    const where = await buildOfferingWhere(req.query);

    if (!where) {
      return emptyOfferingsResponse(res, req.query);
    }

    return listOfferingsByWhere(res, req.query, {
      ...where,
      facultyAssignments: {
        some: {
          userId: req.user.id,
        },
      },
    });
  },

  async getOffering(req: Request, res: Response) {
    const offering = await prisma.courseOffering.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: offeringSummarySelect,
    });

    if (!offering) {
      throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Offering not found" });
    }

    return ok(res, serializeOfferingSummary(offering));
  },

  async getStudentReport(req: Request, res: Response) {
    const student = await prisma.student.findFirst({
      where: { id: req.params.studentId, deletedAt: null },
      include: {
        enrollments: {
          include: {
            courseOffering: {
              include: {
                subject: { select: { credits: true } },
              },
            },
          },
        },
        backlogs: {
          where: { isCleared: false },
          select: { id: true },
        },
      },
    });

    if (!student) {
      throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Student not found" });
    }

    const totalCredits = student.enrollments.reduce(
      (sum, enrollment) => sum + toNumber(enrollment.courseOffering.subject.credits),
      0,
    );

    return ok(res, {
      studentId: student.id,
      cgpa: null,
      totalCredits,
      completedSemesters: 0,
      backlogs: student.backlogs.length,
      semesters: [],
    });
  },

  async getSemesterRanking(req: Request, res: Response) {
    const currentAcademicYear = await prisma.academicYear.findFirst({
      where: { isCurrent: true, deletedAt: null },
      select: { label: true },
    });

    return ok(res, {
      branchId: req.params.branchId,
      semesterNumber: Number(req.params.semNo),
      academicYear: currentAcademicYear?.label ?? "N/A",
      entries: [],
    });
  },

  async getBranchReport(req: Request, res: Response) {
    return ok(res, {
      branchId: req.params.branchId,
      semesters: [],
    });
  },

  async getOfferingAttainment(req: Request, res: Response) {
    const offering = await prisma.courseOffering.findFirst({
      where: { id: req.params.offeringId, deletedAt: null },
      include: {
        subject: { select: { code: true, name: true } },
        branch: { select: { name: true } },
        academicYear: { select: { label: true } },
        studentEnrollments: { select: { id: true } },
        coDefinitions: {
          orderBy: { coNumber: "asc" },
          include: {
            examQuestions: {
              select: { maxMarks: true },
            },
          },
        },
      },
    });

    if (!offering) {
      throw new ApiError({ status: 404, code: "NOT_FOUND", message: "Offering not found" });
    }

    const cos = offering.coDefinitions.map((co) => ({
      co: co.label,
      max: co.examQuestions.reduce((sum, question) => sum + toNumber(question.maxMarks), 0),
      avg: 0,
      above: 0,
      pct: 0,
      level: 0,
      desc: co.description ?? "",
    }));

    return ok(res, {
      offering: {
        id: offering.id,
        courseCode: offering.subject.code,
        courseName: offering.subject.name,
        branch: offering.branch.name,
        semester: offering.semesterNumber,
        academicYear: offering.academicYear.label,
      },
      totalStudents: offering.studentEnrollments.length,
      overallScore: 0,
      avgAbove50Pct: 0,
      avgPct: 0,
      cos,
    });
  },

  async getBranchAttainment(req: Request, res: Response) {
    const semNo = Number(req.params.semNo);
    const offerings = await prisma.courseOffering.findMany({
      where: {
        deletedAt: null,
        semesterNumber: semNo,
        branch: { code: req.params.branchId.toUpperCase() },
      },
      include: {
        subject: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return ok(
      res,
      offerings.map((offering) => ({
        offeringId: offering.id,
        subjectCode: offering.subject.code,
        subjectName: offering.subject.name,
        branchId: req.params.branchId,
        semesterNumber: offering.semesterNumber,
        co1Level: 0,
        co2Level: 0,
        co3Level: 0,
        co4Level: 0,
        co5Level: 0,
        overallLevel: 0,
      })),
    );
  },

  async getOfferingsGrid(req: Request, res: Response) {
    const { programCode, semester, academicYear } = req.query;

    if (!programCode || !semester || !academicYear) {
      return res.status(400).json({ error: "programCode, semester, and academicYear are required" });
    }

    const semNum = Number(semester);

    // Resolve program
    const programs = await prisma.program.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true, type: true },
    });
    function normPC(n: string, t: "UG" | "PG") {
      const c = n.replace(/[^A-Za-z]/g, "").toUpperCase();
      if (c === "BTECH") return "BTECH";
      if (c === "BARCH") return "BARCH";
      if (c === "MCA") return "MCA";
      if (c === "MTECH") return "MTECH";
      if (c === "MSC" || c === "MSCINT") return "MSC";
      if (c === "MBA") return "MBA";
      return c || t;
    }
    const program = programs.find(p => normPC(p.name, p.type) === (programCode as string).toUpperCase());
    if (!program) return res.status(404).json({ error: "PROGRAM_NOT_FOUND" });

    // All offerings for this program+sem+AY
    const offerings = await prisma.courseOffering.findMany({
      where: {
        deletedAt: null,
        semesterNumber: semNum,
        branch: { programId: program.id, deletedAt: null, isActive: true },
        academicYear: { label: academicYear as string },
      },
      select: {
        id: true,
        isMarksLocked: true,
        branch: { select: { id: true, code: true, name: true } },
        subject: { select: { id: true, code: true, name: true } },
        facultyAssignments: {
          orderBy: { createdAt: "asc" },
          take: 1,
          select: {
            user: { select: { id: true, name: true, email: true } },
          },
        },
        examSetups: {
          select: {
            component: true,
            questions: {
              select: {
                _count: { select: { studentMarks: { where: { marksObtained: { not: null } } } } },
              },
            },
          },
        },
        attendanceEntries: { select: { id: true } },
        _count: { select: { studentEnrollments: true } },
      },
    });

    // Collect unique branches and subjects preserving order
    const branchMap = new Map<string, { id: string; code: string; name: string }>();
    const subjectMap = new Map<string, { id: string; code: string; name: string; branchCount: number }>();
    const subjectBranchCount = new Map<string, Set<string>>();

    for (const o of offerings) {
      branchMap.set(o.branch.id, o.branch);
      if (!subjectMap.has(o.subject.id)) subjectMap.set(o.subject.id, { ...o.subject, branchCount: 0 });
      if (!subjectBranchCount.has(o.subject.id)) subjectBranchCount.set(o.subject.id, new Set());
      subjectBranchCount.get(o.subject.id)!.add(o.branch.id);
    }

    const branches = [...branchMap.values()].sort((a, b) => a.code.localeCompare(b.code));

    function buildProgress(o: typeof offerings[0]) {
      const enrolled = o._count.studentEnrollments;
      const progress = { mid: 0, quiz: 0, asn: 0, att: 0, end: 0 };
      for (const setup of o.examSetups) {
        const qCount = setup.questions.length;
        const filled = setup.questions.reduce((s, q) => s + q._count.studentMarks, 0);
        const pct = enrolled > 0 && qCount > 0 ? Math.round((filled / (enrolled * qCount)) * 100) : 0;
        if (setup.component === "MID_SEM") progress.mid = pct;
        else if (setup.component === "QUIZ") progress.quiz = pct;
        else if (setup.component === "ASSIGNMENT") progress.asn = pct;
        else if (setup.component === "END_SEM") progress.end = pct;
      }
      progress.att = enrolled > 0 ? Math.round((o.attendanceEntries.length / enrolled) * 100) : 0;
      return progress;
    }

    const rows = [...subjectMap.keys()].map(subjectId => {
      const subject = subjectMap.get(subjectId)!;
      const branchCount = subjectBranchCount.get(subjectId)?.size ?? 0;
      const cells: Record<string, {
        offeringId: string | null;
        faculty: { id: string; name: string } | null;
        isLocked: boolean;
        progress: { mid: number; quiz: number; asn: number; att: number; end: number; };
      }> = {};
      for (const b of branches) {
        const o = offerings.find(of => of.subject.id === subjectId && of.branch.id === b.id);
        if (!o) {
          cells[b.id] = { offeringId: null, faculty: null, isLocked: false, progress: { mid: 0, quiz: 0, asn: 0, att: 0, end: 0 } };
        } else {
          const fa = o.facultyAssignments[0];
          cells[b.id] = {
            offeringId: o.id,
            faculty: fa ? { id: fa.user.id, name: displayFacultyName(fa.user) } : null,
            isLocked: o.isMarksLocked,
            progress: buildProgress(o),
          };
        }
      }
      return {
        subject: { id: subject.id, code: subject.code, name: subject.name, isShared: branchCount >= 3 },
        cells,
      };
    });

    return ok(res, { branches, rows });
  },
};
