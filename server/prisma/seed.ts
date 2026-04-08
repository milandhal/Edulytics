import "dotenv/config";
import bcrypt from "bcrypt";
import { Grade, ProgramType, Role } from "@prisma/client";
import { prisma } from "../src/utils/prisma.js";

const seedAdmin = {
  name: process.env.SEED_ADMIN_NAME?.trim() || "Edulytics Admin",
  email: process.env.SEED_ADMIN_EMAIL?.trim() || "admin@example.com",
  password: process.env.SEED_ADMIN_PASSWORD?.trim() || "ChangeThisBeforeSeeding123!",
};

const gradeConfigSeeds = [
  { grade: Grade.O, qualification: "Outstanding", minScore: 91, maxScore: 100, gradePoint: 10, isAdminOnly: false },
  { grade: Grade.A, qualification: "Excellent", minScore: 81, maxScore: 90, gradePoint: 9, isAdminOnly: false },
  { grade: Grade.B, qualification: "Very Good", minScore: 71, maxScore: 80, gradePoint: 8, isAdminOnly: false },
  { grade: Grade.C, qualification: "Good", minScore: 61, maxScore: 70, gradePoint: 7, isAdminOnly: false },
  { grade: Grade.D, qualification: "Average", minScore: 51, maxScore: 60, gradePoint: 6, isAdminOnly: false },
  { grade: Grade.P, qualification: "Pass", minScore: 35, maxScore: 50, gradePoint: 5, isAdminOnly: false },
  { grade: Grade.F, qualification: "Fail", minScore: 0, maxScore: 34, gradePoint: 2, isAdminOnly: false },
  { grade: Grade.M, qualification: "Medical", minScore: null, maxScore: null, gradePoint: 0, isAdminOnly: true },
  { grade: Grade.S, qualification: "Satisfactory", minScore: null, maxScore: null, gradePoint: 0, isAdminOnly: true },
  { grade: Grade.T, qualification: "Transferred", minScore: null, maxScore: null, gradePoint: 0, isAdminOnly: true },
  { grade: Grade.R, qualification: "Re-registered", minScore: null, maxScore: null, gradePoint: 0, isAdminOnly: true },
] as const;

const attainmentConfigSeeds = [
  { level: 1, studentPercentageThreshold: 60, scorePercentageThreshold: 50 },
  { level: 2, studentPercentageThreshold: 65, scorePercentageThreshold: 50 },
  { level: 3, studentPercentageThreshold: 70, scorePercentageThreshold: 50 },
] as const;

const programSeeds = [
  { name: "B.Tech", type: ProgramType.UG, totalSemesters: 8 },
  { name: "B.Arch", type: ProgramType.UG, totalSemesters: 10 },
  { name: "MCA", type: ProgramType.PG, totalSemesters: 4 },
  { name: "M.Tech", type: ProgramType.PG, totalSemesters: 4 },
  { name: "M.Sc", type: ProgramType.PG, totalSemesters: 4 },
  { name: "MBA", type: ProgramType.PG, totalSemesters: 4 },
] as const;

async function seedAdminUser() {
  const passwordHash = await bcrypt.hash(seedAdmin.password, 12);

  await prisma.user.upsert({
    where: { email: seedAdmin.email },
    update: {
      name: seedAdmin.name,
      passwordHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
      mustChangePassword: true,
      deletedAt: null,
    },
    create: {
      name: seedAdmin.name,
      email: seedAdmin.email,
      passwordHash,
      role: Role.SUPER_ADMIN,
      isActive: true,
      mustChangePassword: true,
    },
  });
}

async function seedGradeConfigs() {
  for (const gradeConfigSeed of gradeConfigSeeds) {
    await prisma.gradeConfig.upsert({
      where: { grade: gradeConfigSeed.grade },
      update: gradeConfigSeed,
      create: gradeConfigSeed,
    });
  }
}

async function seedAttainmentConfigs() {
  for (const attainmentConfigSeed of attainmentConfigSeeds) {
    await prisma.attainmentConfig.upsert({
      where: { level: attainmentConfigSeed.level },
      update: attainmentConfigSeed,
      create: attainmentConfigSeed,
    });
  }
}

async function seedPrograms() {
  for (const programSeed of programSeeds) {
    const existing = await prisma.program.findFirst({
      where: { name: programSeed.name },
      orderBy: { createdAt: "asc" },
    });

    if (existing) {
      await prisma.program.update({
        where: { id: existing.id },
        data: {
          type: programSeed.type,
          totalSemesters: programSeed.totalSemesters,
          isActive: true,
          deletedAt: null,
        },
      });
      continue;
    }

    await prisma.program.create({
      data: {
        ...programSeed,
        isActive: true,
      },
    });
  }
}

async function main() {
  console.log("Seeding Edulytics defaults");

  await seedAdminUser();
  await seedGradeConfigs();
  await seedAttainmentConfigs();
  await seedPrograms();

  console.log(`Seed complete. Admin email: ${seedAdmin.email}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
