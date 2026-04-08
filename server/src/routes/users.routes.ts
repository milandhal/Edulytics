import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireRole } from "../middleware/requireRole.js";
import { requireNotSuperAdmin } from "../middleware/requireNotSuperAdmin.js";
import { upload } from "../middleware/upload.js";
import { UsersController } from "../controllers/users.controller.js";

export const usersRouter = Router();

usersRouter.get(
  "/",
  authenticate,
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(UsersController.list),
);

usersRouter.post(
  "/",
  authenticate,
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(UsersController.create),
);

usersRouter.post(
  "/bulk-upload",
  authenticate,
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  upload.single("file"),
  asyncHandler(UsersController.bulkUpload),
);

usersRouter.patch(
  "/:id/password",
  authenticate,
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(requireNotSuperAdmin),
  asyncHandler(UsersController.changePassword),
);

usersRouter.patch(
  "/:id",
  authenticate,
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(requireNotSuperAdmin),
  asyncHandler(UsersController.update),
);

usersRouter.delete(
  "/:id",
  authenticate,
  requireRole(["ADMIN", "SUPER_ADMIN"]),
  asyncHandler(requireNotSuperAdmin),
  asyncHandler(UsersController.delete),
);
