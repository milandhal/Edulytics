import { Router } from "express";
import { ReadController } from "../controllers/read.controller.js";
import { WriteController } from "../controllers/write.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { upload } from "../middleware/upload.js";
import { requireRole } from "../middleware/requireRole.js";

export const academicRouter = Router();

academicRouter.use(authenticate);

academicRouter.get("/offerings", asyncHandler(ReadController.listOfferings));
academicRouter.get(
  "/offerings/my",
  requireRole(["FACULTY"]),
  asyncHandler(ReadController.listMyOfferings),
);
academicRouter.get(
  "/offerings/grid",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(ReadController.getOfferingsGrid),
);
academicRouter.post(
  "/offerings",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.createOffering),
);
academicRouter.post(
  "/offerings/bulk-assign-faculty",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.bulkAssignFaculty),
);
academicRouter.post(
  "/offerings/:id/assign-faculty",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.assignOfferingFaculty),
);
academicRouter.delete(
  "/offerings/:id/assign-faculty",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.unassignOfferingFaculty),
);
academicRouter.patch(
  "/offerings/:id/lock",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.setOfferingMarksLock),
);
academicRouter.delete(
  "/offerings/:id",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.deleteOffering),
);
academicRouter.get("/offerings/:id", asyncHandler(ReadController.getOffering));

academicRouter.get(
  "/programs",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(ReadController.listPrograms),
);
academicRouter.post(
  "/programs",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.createProgram),
);
academicRouter.put(
  "/programs/:id",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.updateProgram),
);
academicRouter.patch(
  "/programs/:id",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.patchProgram),
);
academicRouter.delete(
  "/programs/:id",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.deleteProgram),
);
academicRouter.get(
  "/branches",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(ReadController.listBranches),
);
academicRouter.get(
  "/academic-years",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(ReadController.listAcademicYears),
);
academicRouter.patch(
  "/academic-years/:id/active",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.setActiveAcademicYear),
);
academicRouter.post(
  "/branches",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.createBranch),
);
academicRouter.get(
  "/branches/:id/stats",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(ReadController.getBranchStats),
);
academicRouter.patch(
  "/branches/:id",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.patchBranch),
);
academicRouter.put(
  "/branches/:id",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.updateBranch),
);
academicRouter.delete(
  "/branches/:id",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.deleteBranch),
);
academicRouter.get(
  "/subjects",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(ReadController.listSubjects),
);
academicRouter.post(
  "/subjects",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.createSubject),
);
academicRouter.put(
  "/subjects/:id",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.updateSubject),
);
academicRouter.patch(
  "/subjects/:id",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.updateSubject),
);
academicRouter.delete(
  "/subjects/:id",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.deleteSubject),
);
academicRouter.post(
  "/subjects/bulk-upload",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  upload.single("file"),
  asyncHandler(WriteController.bulkUploadSubjects),
);
academicRouter.get(
  "/uploads/history",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(ReadController.listUploadHistory),
);
academicRouter.get(
  "/settings/grades",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(ReadController.getGrades),
);
academicRouter.put(
  "/settings/grades",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.saveGrades),
);
academicRouter.get(
  "/settings/attainment",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(ReadController.getAttainmentSettings),
);
academicRouter.put(
  "/settings/attainment",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.saveAttainmentSettings),
);
