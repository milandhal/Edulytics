import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { validate } from "../middleware/validate.js";
import { AuthController } from "../controllers/auth.controller.js";
import { AuthSchemas } from "../controllers/auth.schemas.js";

export const authRouter = Router();

authRouter.post("/login", validate(AuthSchemas.login), asyncHandler(AuthController.login));
authRouter.post("/refresh", asyncHandler(AuthController.refresh));
authRouter.post("/logout", asyncHandler(AuthController.logout));
authRouter.get("/me", authenticate, asyncHandler(AuthController.me));
authRouter.patch("/change-password", authenticate, validate(AuthSchemas.changePassword), asyncHandler(AuthController.changePassword));

