import { z } from "zod";
import { PACKAGE_REGISTRIES, PACKAGE_LANGUAGES, PACKAGE_STATUSES } from "@/types";

// Empty string from an optional URL input should pass validation as "not provided",
// not fail the .url() check.
const optionalUrl = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.url("Must be a valid URL").optional(),
);

export const packageSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().optional(),
  registry: z.enum(PACKAGE_REGISTRIES),
  registryUrl: optionalUrl,
  githubUrl: optionalUrl,
  language: z.enum(PACKAGE_LANGUAGES),
  currentVersion: z.string().trim().optional(),
  tags: z.array(z.string()).default([]),
  status: z.enum(PACKAGE_STATUSES),
  projectId: z.string().trim().optional(),
});

export type PackageInput = z.infer<typeof packageSchema>;
