import { Router } from "express";
import { ReadController } from "../controllers/read.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const reportsRouter = Router();

reportsRouter.use(authenticate);

reportsRouter.get("/student/:studentId", asyncHandler(ReadController.getStudentReport));
reportsRouter.get(
  "/semester/:branchId/:semNo",
  asyncHandler(ReadController.getSemesterRanking),
);
reportsRouter.get("/branch/:branchId", asyncHandler(ReadController.getBranchReport));
