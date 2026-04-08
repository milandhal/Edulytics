import { Router } from "express";
import { ReadController } from "../controllers/read.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireRole } from "../middleware/requireRole.js";

export const dashboardRouter = Router();

dashboardRouter.use(authenticate);

dashboardRouter.get(
  "/admin",
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(ReadController.adminDashboard),
);
dashboardRouter.get("/faculty", asyncHandler(ReadController.teacherDashboard));
