import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  ACCESS_TOKEN_TTL: z.string().default("8h"),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  COOKIE_SECURE: z.coerce.boolean().default(false),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  CLIENT_ORIGIN: z.string().min(1),
});

export const env = EnvSchema.parse(process.env);

