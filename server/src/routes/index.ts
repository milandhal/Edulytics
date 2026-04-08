import { Router } from "express";
import { authRouter } from "./auth.routes.js";
import { usersRouter } from "./users.routes.js";
import { dashboardRouter } from "./dashboard.routes.js";
import { studentsRouter } from "./students.routes.js";
import { academicRouter } from "./academic.routes.js";
import { reportsRouter } from "./reports.routes.js";
import { attainmentRouter } from "./attainment.routes.js";
import { examRouter } from "./exam.routes.js";

export const routes = Router();

routes.use("/auth", authRouter);
routes.use("/dashboard", dashboardRouter);
routes.use("/students", studentsRouter);
routes.use("/", academicRouter);
routes.use("/", examRouter);
routes.use("/reports", reportsRouter);
routes.use("/attainment", attainmentRouter);
routes.use("/users", usersRouter);
