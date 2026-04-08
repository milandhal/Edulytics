import { Router } from "express";
import {
  addCO,
  getEnrolledStudents,
  getMarks,
  getSetup,
  getStudentMarks,
  removeCO,
  resetCOs,
  saveQuestionMarks,
  saveSetup,
  saveStudentMarks,
  unlockSetup,
  updateCO,
} from "../controllers/exam.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireMarksUnlocked } from "../middleware/requireMarksUnlocked.js";
import { requireOfferingAssignment } from "../middleware/requireOfferingAssignment.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireStructureUnlocked } from "../middleware/requireStructureUnlocked.js";
import { exportComponent, exportOffering } from "../services/export.service.js";

export const examRouter = Router();
examRouter.use(authenticate);
examRouter.use("/offerings/:id", asyncHandler(requireOfferingAssignment));

examRouter.get("/offerings/:id/setup/:comp", asyncHandler(getSetup));
examRouter.post(
  "/offerings/:id/setup/:comp",
  asyncHandler(requireStructureUnlocked),
  asyncHandler(saveSetup),
);
examRouter.post(
  "/offerings/:id/setup/:comp/unlock",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(unlockSetup),
);

examRouter.post(
  "/offerings/:id/cos",
  asyncHandler(requireStructureUnlocked),
  asyncHandler(addCO),
);
examRouter.patch(
  "/offerings/:id/cos/:coId",
  asyncHandler(requireStructureUnlocked),
  asyncHandler(updateCO),
);
examRouter.delete(
  "/offerings/:id/cos/:coId",
  asyncHandler(requireStructureUnlocked),
  asyncHandler(removeCO),
);
examRouter.post(
  "/offerings/:id/cos/reset",
  asyncHandler(requireStructureUnlocked),
  asyncHandler(resetCOs),
);

examRouter.get("/offerings/:id/enrolled", asyncHandler(getEnrolledStudents));

examRouter.get("/offerings/:id/marks/:comp", asyncHandler(getMarks));
examRouter.get("/offerings/:id/marks/:comp/student/:sid", asyncHandler(getStudentMarks));
examRouter.put(
  "/offerings/:id/marks/:comp/student/:sid",
  asyncHandler(requireMarksUnlocked),
  asyncHandler(saveStudentMarks),
);
examRouter.put(
  "/offerings/:id/marks/:comp/question/:qid",
  asyncHandler(requireMarksUnlocked),
  asyncHandler(saveQuestionMarks),
);

examRouter.get("/offerings/:id/export", asyncHandler(exportOffering));
examRouter.get("/offerings/:id/export/:comp", asyncHandler(exportComponent));
