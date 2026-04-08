import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import { env } from "./utils/env.js";
import { routes } from "./routes/index.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";

function parseAllowedOrigins() {
  return env.CLIENT_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isAllowedDevOrigin(origin: string) {
  if (env.NODE_ENV === "production") {
    return false;
  }

  return /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

export function createApp() {
  const app = express();
  const allowedOrigins = parseAllowedOrigins();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          return callback(null, true);
        }

        if (allowedOrigins.includes(origin) || isAllowedDevOrigin(origin)) {
          return callback(null, true);
        }

        return callback(new Error(`CORS blocked for origin: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/v1", routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

