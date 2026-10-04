/**
 * Loads `.env.local` from the repo root (falling back to `.env`) so every
 * script sees the same configuration as the Next.js app.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export function loadEnv(): void {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(REPO_ROOT, file);
    if (existsSync(path)) {
      config({ path, quiet: true });
      return;
    }
  }
}

/** Read a required variable, failing with a pointer to `.env.example`. */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is not set. Add it to .env.local (see .env.example).`);
  }
  return value;
}
