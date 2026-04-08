import { Router } from "express";
import { ReadController } from "../controllers/read.controller.js";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";

export const attainmentRouter = Router();

attainmentRouter.use(authenticate);

attainmentRouter.get(
  "/offering/:offeringId",
  asyncHandler(ReadController.getOfferingAttainment),
);
attainmentRouter.get(
  "/branch/:branchId/semester/:semNo",
  asyncHandler(ReadController.getBranchAttainment),
);
