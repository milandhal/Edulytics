import { StudentStatus, type Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export async function resolvePreferredAcademicYearId(tx: Tx, preferredAcademicYearId?: string | null) {
  if (preferredAcademicYearId) {
    return preferredAcademicYearId;
  }

  const academicYear = await tx.academicYear.findFirst({
    where: { deletedAt: null },
    orderBy: [{ isCurrent: "desc" }, { startYear: "desc" }, { createdAt: "desc" }],
    select: { id: true },
  });

  return academicYear?.id ?? null;
}

export async function autoEnrollStudentInMatchingOfferings(
  tx: Tx,
  opts: {
    studentId: string;
    branchId: string;
    semesterNumber: number;
    academicYearId: string;
  },
) {
  const offerings = await tx.courseOffering.findMany({
    where: {
      deletedAt: null,
      branchId: opts.branchId,
      semesterNumber: opts.semesterNumber,
      academicYearId: opts.academicYearId,
    },
    select: { id: true },
  });

  if (offerings.length === 0) {
    return 0;
  }

  const result = await tx.studentEnrollment.createMany({
    data: offerings.map((offering) => ({
      studentId: opts.studentId,
      courseOfferingId: offering.id,
    })),
    skipDuplicates: true,
  });

  return result.count;
}

export async function autoEnrollStudentsForOffering(
  tx: Tx,
  opts: {
    courseOfferingId: string;
    branchId: string;
    semesterNumber: number;
  },
) {
  const students = await tx.student.findMany({
    where: {
      deletedAt: null,
      status: StudentStatus.ACTIVE,
      branchId: opts.branchId,
      currentSemester: opts.semesterNumber,
    },
    select: { id: true },
  });

  if (students.length === 0) {
    return 0;
  }

  const result = await tx.studentEnrollment.createMany({
    data: students.map((student) => ({
      studentId: student.id,
      courseOfferingId: opts.courseOfferingId,
    })),
    skipDuplicates: true,
  });

  return result.count;
}
