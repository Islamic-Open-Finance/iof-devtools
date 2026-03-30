/**
 * IOF DevTools - Shariah compliance validation commands
 *
 * Commands:
 *   iof shariah validate <file> [--rules <type>] [--verbose]
 *   iof shariah rules [--category <cat>] [--rule <id>]
 */

import * as fs from "fs";
import * as path from "path";
import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadConfig, requireAuth } from "../config.js";
import { callApi } from "../http.js";
import {
  printOutput,
  assertValidFormat,
  type OutputFormat,
} from "../output.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShariahViolation {
  rule_id: string;
  rule_name: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  description: string;
  field?: string;
  suggested_fix?: string;
}

interface ShariahValidationResponse {
  valid: boolean;
  contract_type: string;
  shariah_standard: string;
  violations: ShariahViolation[];
  warnings: ShariahViolation[];
  board_approval_required: boolean;
  fatwa_reference?: string;
  checked_at: string;
}

interface ShariahRule {
  id: string;
  name: string;
  category: string;
  description: string;
  contract_types: string[];
  aaoifi_standard?: string;
  severity: string;
}

interface ShariahRulesResponse {
  rules: ShariahRule[];
  total: number;
}

const VALID_RULE_CATEGORIES: ReadonlySet<string> = new Set([
  "CONTRACTS",
  "ASSETS",
  "PAYMENTS",
  "PARTIES",
  "GOVERNANCE",
  "PROHIBITED",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function severityColor(severity: string): string {
  switch (severity) {
    case "CRITICAL":
      return chalk.red.bold(severity);
    case "HIGH":
      return chalk.red(severity);
    case "MEDIUM":
      return chalk.yellow(severity);
    case "LOW":
      return chalk.dim(severity);
    default:
      return severity;
  }
}

function printViolations(violations: ShariahViolation[], label: string): void {
  if (violations.length === 0) {
    return;
  }
  console.log(chalk.bold(`\n${label}:`));
  const max = Math.min(violations.length, 50);
  for (let i = 0; i < max; i++) {
    const v = violations[i];
    if (!v) {
      continue;
    }
    console.log(`  ${severityColor(v.severity)} [${v.rule_id}] ${v.rule_name}`);
    console.log(`    ${chalk.dim(v.description)}`);
    if (v.field) {
      console.log(`    Field: ${chalk.cyan(v.field)}`);
    }
    if (v.suggested_fix) {
      console.log(`    Fix: ${chalk.green(v.suggested_fix)}`);
    }
  }
}

function readContractFile(filePath: string): unknown {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(chalk.red(`File not found: ${resolved}`));
    process.exit(1);
  }
  const ext = path.extname(resolved).toLowerCase();
  const raw = fs.readFileSync(resolved, "utf-8");

  if (ext === ".json") {
    return JSON.parse(raw);
  }
  // Treat anything else as JSON; caller can extend for YAML
  try {
    return JSON.parse(raw);
  } catch {
    console.error(chalk.red(`Cannot parse file as JSON: ${resolved}`));
    process.exit(1);
  }
}

// ── Command registration ──────────────────────────────────────────────────────

export function registerShariahCommands(program: Command): void {
  const shariahCmd = program
    .command("shariah")
    .description("Shariah compliance validation and rule inspection");

  // iof shariah validate <file>
  shariahCmd
    .command("validate <file>")
    .description("Validate a contract or data file for Shariah compliance")
    .option(
      "--rules <type>",
      "Apply rules for a specific contract type (e.g. murabaha)",
    )
    .option("--verbose", "Show full rule details", false)
    .option(
      "--format <format>",
      "Output format: table|json|yaml|csv|pretty",
      "table",
    )
    .action(
      async (
        file: string,
        opts: { rules?: string; verbose: boolean; format: string },
      ) => {
        const config = loadConfig();
        requireAuth(config);

        assertValidFormat(opts.format);
        const format: OutputFormat = opts.format as OutputFormat;

        const contractData = readContractFile(file);

        const payload: Record<string, unknown> = {
          contract: contractData,
        };
        if (opts.rules) {
          payload["contract_type"] = opts.rules.toUpperCase();
        }

        const spinner = ora("Validating Shariah compliance...").start();

        try {
          const response = await callApi<ShariahValidationResponse>(
            config,
            "POST",
            "/api/v1/shariah/validate",
            payload,
          );
          spinner.stop();

          const result = response.data;

          if (result.valid) {
            console.log(
              `${chalk.green("✓")} ${chalk.bold("Shariah Compliant")}`,
            );
          } else {
            console.log(
              `${chalk.red("✗")} ${chalk.bold("Shariah Non-Compliant")}`,
            );
          }

          console.log(`  Contract type:      ${result.contract_type}`);
          console.log(`  Shariah standard:   ${result.shariah_standard}`);
          if (result.fatwa_reference) {
            console.log(`  Fatwa reference:    ${result.fatwa_reference}`);
          }
          console.log(
            `  Board approval:     ${result.board_approval_required ? chalk.yellow("Required") : chalk.green("Not required")}`,
          );
          console.log(`  Checked at:         ${chalk.dim(result.checked_at)}`);

          printViolations(result.violations, "Violations");
          printViolations(result.warnings, "Warnings");

          if (opts.verbose && format === "table") {
            console.log(chalk.bold("\nFull validation result:"));
            printOutput(result, "json");
          } else if (format !== "table") {
            printOutput(result, format);
          }

          if (!result.valid) {
            process.exit(1);
          }
        } catch (err) {
          spinner.fail("Shariah validation failed.");
          const e = err as { code?: string; message?: string; status?: number };
          console.error(
            chalk.red(
              `${e.code ?? "ERROR"} (${e.status ?? 0}): ${e.message ?? String(err)}`,
            ),
          );
          process.exit(1);
        }
      },
    );

  // iof shariah rules
  shariahCmd
    .command("rules")
    .description("List Shariah rules in the compliance engine")
    .option("--category <category>", "Filter by category")
    .option("--rule <id>", "Show details for a specific rule ID")
    .option(
      "--format <format>",
      "Output format: table|json|yaml|csv|pretty",
      "table",
    )
    .action(
      async (opts: { category?: string; rule?: string; format: string }) => {
        const config = loadConfig();
        requireAuth(config);

        if (
          opts.category &&
          !VALID_RULE_CATEGORIES.has(opts.category.toUpperCase())
        ) {
          console.error(
            chalk.red(
              `Invalid category "${opts.category}". Valid: ${[...VALID_RULE_CATEGORIES].join(", ")}`,
            ),
          );
          process.exit(1);
        }

        assertValidFormat(opts.format);
        const format: OutputFormat = opts.format as OutputFormat;

        const params = new URLSearchParams();
        if (opts.category) {
          params.set("category", opts.category.toUpperCase());
        }
        if (opts.rule) {
          params.set("rule_id", opts.rule);
        }

        const spinner = ora("Fetching Shariah rules...").start();

        try {
          const queryString = params.toString() ? `?${params.toString()}` : "";
          const response = await callApi<ShariahRulesResponse>(
            config,
            "GET",
            `/api/v1/shariah/rules${queryString}`,
          );
          spinner.stop();

          const { rules, total } = response.data;
          console.log(chalk.dim(`Total: ${total} rule(s)`));

          if (opts.rule && rules.length === 1) {
            // Show full detail for single rule
            const rule = rules[0];
            if (rule) {
              console.log(chalk.bold(`\n[${rule.id}] ${rule.name}`));
              console.log(`  Category:          ${rule.category}`);
              console.log(`  Description:       ${rule.description}`);
              console.log(
                `  Contract types:    ${rule.contract_types.join(", ")}`,
              );
              if (rule.aaoifi_standard) {
                console.log(`  AAOIFI Standard:   ${rule.aaoifi_standard}`);
              }
              console.log(
                `  Severity:          ${severityColor(rule.severity)}`,
              );
            }
          } else {
            printOutput(rules, format);
          }
        } catch (err) {
          spinner.fail("Failed to fetch Shariah rules.");
          const e = err as { code?: string; message?: string; status?: number };
          console.error(
            chalk.red(
              `${e.code ?? "ERROR"} (${e.status ?? 0}): ${e.message ?? String(err)}`,
            ),
          );
          process.exit(1);
        }
      },
    );
}
