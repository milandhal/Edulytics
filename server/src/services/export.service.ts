import { Request, Response } from "express";
import * as XLSX from "xlsx";
import { prisma } from "../utils/prisma.js";
import { ExamComponent } from "@prisma/client";

const COMP_MAP: Record<string, ExamComponent> = {
  mid: "MID_SEM",
  end: "END_SEM",
  quiz: "QUIZ",
  asn: "ASSIGNMENT",
  att: "ATTENDANCE",
};

const COMP_LABEL: Record<string, string> = {
  MID_SEM: "MID SEMESTER",
  END_SEM: "END SEM",
  QUIZ: "QUIZ TEST",
  ASSIGNMENT: "ASSIGNMENT",
  ATTENDANCE: "ATTENDANCE",
};

type OfferingData = {
  id: string;
  semesterNumber: number;
  subject: { code: string; name: string };
  branch: { code: string };
  academicYear: { label: string } | null;
};

type Threshold = { level: number; studentPercentageThreshold: number };

function buildAttendanceCoDistribution(score: number, labels: string[]) {
  const distribution: Record<string, number> = Object.fromEntries(labels.map((label) => [label, 0]));
  if (labels.length === 0) return distribution;

  const normalizedScore = Math.max(0, score);
  const wholeMarks = Math.floor(normalizedScore);
  const remainder = Number((normalizedScore - wholeMarks).toFixed(2));
  const baseShare = Math.floor(wholeMarks / labels.length);
  const extraWholeMarks = wholeMarks % labels.length;

  for (const label of labels) {
    distribution[label] = baseShare;
  }

  for (const label of labels.slice(0, extraWholeMarks)) {
    distribution[label] += 1;
  }

  if (remainder > 0) {
    distribution[labels[extraWholeMarks % labels.length]] += remainder;
  }

  return distribution;
}

function questionLabelOrder(label: string) {
  const grouped = label.match(/^(\d+)\(([a-z])\)$/i);
  if (grouped) {
    return `${grouped[1].padStart(3, "0")}-${grouped[2].toLowerCase()}`;
  }

  const numeric = Number(label);
  if (Number.isFinite(numeric)) {
    return `${String(numeric).padStart(3, "0")}-z`;
  }

  return label.toLowerCase();
}

function boldCellRefs(columnCount: number, rowNumber: number) {
  const refs: string[] = [];
  for (let index = 0; index < columnCount; index += 1) {
    refs.push(`${XLSX.utils.encode_col(index)}${rowNumber}`);
  }
  return refs;
}

function applyBold(ws: XLSX.WorkSheet, refs: string[]) {
  for (const ref of refs) {
    const cell = ws[ref];
    if (!cell) continue;
    cell.s = {
      ...(cell.s ?? {}),
      font: {
        ...(cell.s?.font ?? {}),
        bold: true,
      },
    };
  }
}

function buildRange(startCol: number, startRow: number, endCol: number, endRow: number) {
  return {
    s: { c: startCol, r: startRow },
    e: { c: endCol, r: endRow },
  };
}

function levelFromPercentage(percentage: number, thresholds: Threshold[]) {
  const level3 = thresholds.find((item) => item.level === 3)?.studentPercentageThreshold ?? 70;
  const level2 = thresholds.find((item) => item.level === 2)?.studentPercentageThreshold ?? 65;
  const level1 = thresholds.find((item) => item.level === 1)?.studentPercentageThreshold ?? 60;
  return percentage >= level3 ? 3 : percentage >= level2 ? 2 : percentage >= level1 ? 1 : 0;
}

function buildHeaderRows(offering: OfferingData, showCompulsoryNote: boolean) {
  return [
    ["OUTR", "", "", "", "Attainment Level", "Description"],
    [offering.branch.code, "", "", "", 1, "60% Students Scored more than 50%"],
    [`${offering.subject.code}: ${offering.subject.name}`, "", "", "", 2, "65% Students Scored more than 50%"],
    [`Sem-${offering.semesterNumber}, ${offering.branch.code}`, "", "", "", 3, "70% Students Scored more than 50%"],
    ["", "", "", "", "", showCompulsoryNote ? "all questions are compulsory" : ""],
  ];
}

function componentMarksLabel(component: ExamComponent, totalMax: number) {
  return "QNo";
}

async function buildAttendanceSheet(offering: OfferingData, thresholds: Threshold[]) {
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { courseOfferingId: offering.id },
    include: { student: { select: { id: true, registrationNumber: true, name: true } } },
    orderBy: { student: { registrationNumber: "asc" } },
  });
  const students = enrollments.map((entry) => entry.student);

  const coDefinitions = await prisma.coDefinition.findMany({
    where: { courseOfferingId: offering.id },
    orderBy: { coNumber: "asc" },
  });
  const coLabels = coDefinitions.map((co) => co.label);

  const attendanceEntries = await prisma.attendanceEntry.findMany({
    where: { courseOfferingId: offering.id },
  });
  const attMap: Record<string, number> = {};
  for (const entry of attendanceEntries) {
    attMap[entry.studentId] = Number(entry.score);
  }

  const aoa: any[][] = [...buildHeaderRows(offering, false)];
  aoa.push(["Sl No", "Name", "RegNo", "SubjectCode", "Marks(5)", ...coLabels, "Total"]);
  aoa.push(["", "", "", "", "Mark(5)", ...coLabels.map((label) => buildAttendanceCoDistribution(5, coLabels)[label] ?? 0), 5]);

  const totalsByStudent: Record<string, Record<string, number>> = {};
  students.forEach((student, index) => {
    const score = attMap[student.id] ?? 0;
    const distribution = buildAttendanceCoDistribution(score, coLabels);
    totalsByStudent[student.id] = distribution;
    aoa.push([
      index + 1,
      student.name,
      student.registrationNumber,
      offering.subject.code,
      score,
      ...coLabels.map((label) => distribution[label] ?? 0),
      score,
    ]);
  });

  const maxDistribution = buildAttendanceCoDistribution(5, coLabels);
  const countRow: any[] = ["No of Students Scored more than 50% in relevant CO", "", "", "", ""];
  const pctRow: any[] = ["Percentage of Students Scored more than 50% in relevant CO", "", "", "", ""];
  const levelRow: any[] = ["Level achieved", "", "", "", ""];
  for (const coLabel of coLabels) {
    const threshold = (maxDistribution[coLabel] ?? 0) * 0.5;
    const above = students.filter((student) => (totalsByStudent[student.id]?.[coLabel] ?? 0) > threshold).length;
    const pct = students.length > 0 ? (above / students.length) * 100 : 0;
    countRow.push(above);
    pctRow.push(Number(pct.toFixed(2)));
    levelRow.push(levelFromPercentage(pct, thresholds));
  }
  countRow.push("");
  pctRow.push("");
  levelRow.push("");
  aoa.push(countRow, pctRow, levelRow);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!merges"] = [
    buildRange(0, 0, 1, 0),
    buildRange(0, 1, 1, 1),
    buildRange(0, 2, 1, 2),
    buildRange(0, 3, 1, 3),
    buildRange(0, 5, 0, 7),
    buildRange(1, 5, 1, 7),
    buildRange(2, 5, 2, 7),
    buildRange(3, 5, 3, 7),
    buildRange(4, 5, 4, 7),
    buildRange(5, 5, 4 + coLabels.length, 5),
  ];
  ws["!cols"] = [
    { wch: 8 },
    { wch: 26 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    ...coLabels.map(() => ({ wch: 9 })),
    { wch: 8 },
  ];
  applyBold(ws, [
    ...boldCellRefs(6, 1),
    ...boldCellRefs(6 + coLabels.length + 1, 6),
    ...boldCellRefs(6 + coLabels.length + 1, 7),
    ...boldCellRefs(6 + coLabels.length + 1, aoa.length - 1),
    ...boldCellRefs(6 + coLabels.length + 1, aoa.length),
    ...boldCellRefs(6 + coLabels.length + 1, aoa.length + 1),
  ]);
  return ws;
}

async function buildRegularSheet(offering: OfferingData, component: ExamComponent, thresholds: Threshold[]) {
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { courseOfferingId: offering.id },
    include: { student: { select: { id: true, registrationNumber: true, name: true } } },
    orderBy: { student: { registrationNumber: "asc" } },
  });
  const students = enrollments.map((entry) => entry.student);

  const coDefinitions = await prisma.coDefinition.findMany({
    where: { courseOfferingId: offering.id },
    orderBy: { coNumber: "asc" },
  });

  const setup = await prisma.examSetup.findUnique({
    where: { courseOfferingId_component: { courseOfferingId: offering.id, component } },
    include: {
      questions: {
        include: { coDefinition: { select: { id: true, label: true } } },
        orderBy: { questionOrder: "asc" },
      },
    },
  });

  const questions = [...(setup?.questions ?? [])].sort((left, right) =>
    questionLabelOrder(left.label).localeCompare(questionLabelOrder(right.label), undefined, { numeric: true }),
  );
  const qIds = questions.map((question) => question.id);
  const coLabels = coDefinitions.map((co) => co.label);

  const marksRows = await prisma.studentMark.findMany({
    where: { examQuestionId: { in: qIds }, studentId: { in: students.map((student) => student.id) } },
  });

  const marksMatrix: Record<string, Record<string, number | null>> = {};
  for (const student of students) {
    marksMatrix[student.id] = {};
    for (const question of questions) {
      marksMatrix[student.id][question.id] = null;
    }
  }
  for (const mark of marksRows) {
    marksMatrix[mark.studentId][mark.examQuestionId] = mark.marksObtained !== null ? Number(mark.marksObtained) : null;
  }

  const coMaxMap: Record<string, number> = {};
  for (const co of coDefinitions) {
    coMaxMap[co.label] = 0;
  }
  for (const question of questions) {
    coMaxMap[question.coDefinition.label] = (coMaxMap[question.coDefinition.label] ?? 0) + Number(question.maxMarks);
  }
  const totalMax = questions.reduce((sum, question) => sum + Number(question.maxMarks), 0);
  const isMidSheet = component === "MID_SEM";

  const aoa: any[][] = [...buildHeaderRows(offering, true)];
  aoa.push([
    "Sl No",
    "Name",
    "RegNo",
    "SubjectCode",
    componentMarksLabel(component, totalMax),
    ...questions.map((question) => question.label),
    "Mark Analysis",
    ...coLabels,
    "Total",
  ]);
  aoa.push(["", "", "", "", isMidSheet ? "CO" : "", ...questions.map((question) => question.coDefinition.label), "", ...coLabels, ""]);
  aoa.push(["", "", "", "", isMidSheet ? `Mark(${totalMax})` : "", ...questions.map((question) => Number(question.maxMarks)), "", ...coLabels.map((co) => coMaxMap[co] ?? 0), totalMax]);

  const coTotalsPerStudent: Record<string, Record<string, number>> = {};
  for (const [index, student] of students.entries()) {
    const marks = marksMatrix[student.id];
    const coTotals: Record<string, number> = Object.fromEntries(coLabels.map((label) => [label, 0]));
    for (const question of questions) {
      const value = marks[question.id];
      if (value !== null && value !== undefined) {
        coTotals[question.coDefinition.label] += value;
      }
    }
    coTotalsPerStudent[student.id] = coTotals;
    const rowTotal = Object.values(coTotals).reduce((sum, value) => sum + value, 0);
    aoa.push([
      index + 1,
      student.name,
      student.registrationNumber,
      offering.subject.code,
      rowTotal,
      ...questions.map((question) => {
        const value = marks[question.id];
        return value === null || value === undefined ? undefined : value;
      }),
      "",
      ...coLabels.map((coLabel) => coTotals[coLabel] ?? 0),
      rowTotal,
    ]);
  }

  const countRow: any[] = ["No of Students Scored more than 50% in relevant CO", "", "", "", ""];
  const pctRow: any[] = ["Percentage of Students Scored more than 50% in relevant CO", "", "", "", ""];
  const levelRow: any[] = ["Level achieved", "", "", "", ""];
  for (let index = 0; index < questions.length + 1; index += 1) {
    countRow.push("");
    pctRow.push("");
    levelRow.push("");
  }

  for (const coLabel of coLabels) {
    const threshold = (coMaxMap[coLabel] ?? 0) * 0.5;
    const above = students.filter((student) => (coTotalsPerStudent[student.id]?.[coLabel] ?? 0) > threshold).length;
    const pct = students.length > 0 ? (above / students.length) * 100 : 0;
    countRow.push(above);
    pctRow.push(Number(pct.toFixed(2)));
    levelRow.push(levelFromPercentage(pct, thresholds));
  }
  const overallAbove = students.filter((student) => {
    const coTotals = coTotalsPerStudent[student.id] ?? {};
    const total = Object.values(coTotals).reduce((sum, value) => sum + value, 0);
    return total > totalMax * 0.5;
  }).length;
  const overallPct = students.length > 0 ? (overallAbove / students.length) * 100 : 0;
  countRow.push(overallAbove);
  pctRow.push(Number(overallPct.toFixed(2)));
  levelRow.push(levelFromPercentage(overallPct, thresholds));
  aoa.push(countRow, pctRow, levelRow);

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const merges = [
    buildRange(0, 0, 1, 0),
    buildRange(0, 1, 1, 1),
    buildRange(0, 2, 1, 2),
    buildRange(0, 3, 1, 3),
    buildRange(5, 0, 9, 0),
    buildRange(5, 4, 9, 4),
    buildRange(10, 4, 6 + questions.length + coLabels.length, 4),
    buildRange(0, 5, 0, 7),
    buildRange(1, 5, 1, 7),
    buildRange(2, 5, 2, 7),
    buildRange(3, 5, 3, 7),
    buildRange(5 + questions.length, 5, 5 + questions.length + coLabels.length, 5),
  ];
  if (!isMidSheet) {
    merges.splice(11, 0, buildRange(4, 5, 4, 7));
  }
  ws["!merges"] = merges;
  ws["!cols"] = [
    { wch: 8 },
    { wch: 26 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    ...questions.map(() => ({ wch: 7 })),
    { wch: 14 },
    ...coLabels.map(() => ({ wch: 9 })),
    { wch: 8 },
  ];

  const totalColumns = 7 + questions.length + coLabels.length;
  applyBold(ws, [
    ...boldCellRefs(6, 1),
    ...boldCellRefs(totalColumns, 6),
    ...boldCellRefs(totalColumns, 7),
    ...boldCellRefs(totalColumns, 8),
    ...boldCellRefs(totalColumns, aoa.length - 1),
    ...boldCellRefs(totalColumns, aoa.length),
    ...boldCellRefs(totalColumns, aoa.length + 1),
  ]);
  return ws;
}

async function buildComponentSheet(offeringId: string, component: ExamComponent, thresholds: Threshold[]) {
  const offering = await prisma.courseOffering.findUnique({
    where: { id: offeringId },
    include: {
      subject: { select: { code: true, name: true } },
      branch: { select: { code: true } },
      academicYear: { select: { label: true } },
    },
  });
  if (!offering) throw new Error("Offering not found");

  return component === "ATTENDANCE"
    ? buildAttendanceSheet(offering, thresholds)
    : buildRegularSheet(offering, component, thresholds);
}

export async function exportOffering(req: Request, res: Response) {
  const { id } = req.params;

  const offering = await prisma.courseOffering.findUnique({
    where: { id },
    include: {
      subject: { select: { code: true, name: true } },
      branch: { select: { code: true } },
      academicYear: { select: { label: true } },
    },
  });
  if (!offering) return res.status(404).json({ error: "OFFERING_NOT_FOUND" });

  const thresholds = await prisma.attainmentConfig.findMany({ orderBy: { level: "asc" } });
  const wb = XLSX.utils.book_new();
  const components: [string, ExamComponent][] = [
    ["MID SEMESTER", "MID_SEM"],
    ["QUIZ TEST", "QUIZ"],
    ["ASSIGNMENT", "ASSIGNMENT"],
    ["ATTENDANCE", "ATTENDANCE"],
    ["END SEM", "END_SEM"],
  ];

  for (const [sheetName, component] of components) {
    const ws = await buildComponentSheet(id, component, thresholds);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const subjectName = offering.subject.name.replace(/\s+/g, "-");
  const branchCode = offering.branch.code;
  const year = offering.academicYear?.label ?? "AY";
  const filename = `${subjectName}_${branchCode}__CO-PO Attainment_${year}.xlsx`;

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return res.send(buf);
}

export async function exportComponent(req: Request, res: Response) {
  const { id, comp } = req.params;
  const component = COMP_MAP[comp];
  if (!component) return res.status(400).json({ error: "INVALID_COMPONENT" });

  const offering = await prisma.courseOffering.findUnique({
    where: { id },
    include: {
      subject: { select: { code: true, name: true } },
      branch: { select: { code: true } },
      academicYear: { select: { label: true } },
    },
  });
  if (!offering) return res.status(404).json({ error: "OFFERING_NOT_FOUND" });

  const thresholds = await prisma.attainmentConfig.findMany({ orderBy: { level: "asc" } });
  const ws = await buildComponentSheet(id, component, thresholds);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, COMP_LABEL[component] ?? comp.toUpperCase());

  const subjectName = offering.subject.name.replace(/\s+/g, "-");
  const compLabel = (COMP_LABEL[component] ?? comp).replace(/\s+/g, "_");
  const filename = `${subjectName}_${offering.branch.code}_${compLabel}.xlsx`;

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellStyles: true });
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return res.send(buf);
}
