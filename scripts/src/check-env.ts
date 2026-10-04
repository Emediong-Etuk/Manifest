/**
 * Reports which variables from `.env.example` are set, without printing values.
 * Usage: pnpm check-env
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parseCluster } from "@manifest/sdk";

import { REPO_ROOT, loadEnv } from "./lib/env.js";

loadEnv();

const example = readFileSync(resolve(REPO_ROOT, ".env.example"), "utf8");
const names = example
  .split("\n")
  .map((line) => /^([A-Z0-9_]+)=/.exec(line)?.[1])
  .filter((name): name is string => name !== undefined);

const cluster = parseCluster(process.env.NEXT_PUBLIC_CLUSTER);
console.log(`Cluster: ${cluster}\n`);

let missing = 0;
for (const name of names) {
  const set = (process.env[name] ?? "") !== "";
  if (!set) missing += 1;
  console.log(`${set ? "set    " : "missing"}  ${name}`);
}
console.log(`\n${names.length - missing}/${names.length} variables set.`);
