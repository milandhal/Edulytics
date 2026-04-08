import { Router } from "express";
import { ReadController } from "../controllers/read.controller.js";
import { WriteController } from "../controllers/write.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { upload } from "../middleware/upload.js";
import { requireRole } from "../middleware/requireRole.js";

export const studentsRouter = Router();

studentsRouter.use(authenticate);

studentsRouter.get("/", asyncHandler(ReadController.listStudents));
studentsRouter.get("/:id", asyncHandler(ReadController.getStudentDetail));
studentsRouter.post(
  "/",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.createStudent),
);
studentsRouter.post(
  "/bulk-upload",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  upload.single("file"),
  asyncHandler(WriteController.bulkUploadStudents),
);
studentsRouter.post(
  "/bulk-promote",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.bulkPromoteStudents),
);
studentsRouter.post(
  "/bulk-graduate",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.bulkGraduateStudents),
);
studentsRouter.post(
  "/bulk-status",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.bulkUpdateStudentStatus),
);
studentsRouter.delete(
  "/bulk",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(WriteController.bulkSoftDeleteStudents),
);
