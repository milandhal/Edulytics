import { z } from "zod";

export const AuthSchemas = {
  login: z.object({
    body: z.object({
      email: z.string().email(),
      password: z.string().min(8),
    }),
  }),
  changePassword: z.object({
    body: z.object({
      currentPassword: z.string(),
      newPassword: z.string().min(8, "Password must be at least 8 characters"),
    }).refine((data) => data.newPassword !== data.currentPassword, {
      message: "New password must be different",
      path: ["newPassword"],
    }),
  }),
};

