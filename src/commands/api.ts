/**
 * IOF DevTools - API call and test commands
 *
 * Commands:
 *   iof api call <METHOD> <path> [--data <json>] [--file <path>] [--header <k:v>]
 *   iof api test [<file>] [--coverage]
 */

import * as fs from "fs";
import * as path from "path";
import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import yaml from "js-yaml";
import { loadConfig, requireAuth } from "../config.js";
import { callApi } from "../http.js";
import {
  printOutput,
  assertValidFormat,
  type OutputFormat,
} from "../output.js";

// ── Types ─────────────────────────────────────────────────────────────────────

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

const VALID_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
]);

interface TestCase {
  name: string;
  request: {
    method: string;
    path: string;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  };
  expect: {
    status: number;
    body?: Record<string, unknown>;
  };
}

interface TestSuite {
  name: string;
  tests: TestCase[];
}

interface TestResult {
  name: string;
  passed: boolean;
  status_got: number;
  status_expected: number;
  failure_reason?: string;
  duration_ms: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseMethod(raw: string): HttpMethod {
  const upper = raw.toUpperCase();
  if (!VALID_METHODS.has(upper)) {
    console.error(
      chalk.red(
        `Invalid HTTP method "${raw}". Valid: ${[...VALID_METHODS].join(", ")}`,
      ),
    );
    process.exit(1);
  }
  return upper as HttpMethod;
}

function parseBody(dataStr?: string, filePath?: string): unknown | undefined {
  if (filePath) {
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
      console.error(chalk.red(`File not found: ${resolved}`));
      process.exit(1);
    }
    const raw = fs.readFileSync(resolved, "utf-8");
    return JSON.parse(raw);
  }
  if (dataStr) {
    return JSON.parse(dataStr);
  }
  return undefined;
}

function parseHeaders(headerList: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const max = Math.min(headerList.length, 50);
  for (let i = 0; i < max; i++) {
    const h = headerList[i];
    if (!h) {
      continue;
    }
    const colonIndex = h.indexOf(":");
    if (colonIndex === -1) {
      console.error(
        chalk.red(`Invalid header "${h}" — expected "Key: Value" format`),
      );
      process.exit(1);
    }
    const key = h.slice(0, colonIndex).trim();
    const value = h.slice(colonIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

function deepSubset(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
): string | null {
  const keys = Object.keys(expected);
  const max = Math.min(keys.length, 100);
  for (let i = 0; i < max; i++) {
    const key = keys[i];
    if (key === undefined) {
      continue;
    }
    // Support dotted key paths like "error.code"
    if (key.includes(".")) {
      const parts = key.split(".");
      let cursor: unknown = actual;
      for (const part of parts) {
        if (cursor === null || typeof cursor !== "object") {
          return `Expected "${key}" = "${expected[key]}" but path not found`;
        }
        cursor = (cursor as Record<string, unknown>)[part];
      }
      if (String(cursor) !== String(expected[key])) {
        return `Expected "${key}" = "${expected[key]}", got "${cursor}"`;
      }
    } else {
      if (String(actual[key]) !== String(expected[key])) {
        return `Expected "${key}" = "${expected[key]}", got "${actual[key]}"`;
      }
    }
  }
  return null;
}

async function loadTestSuites(filePath?: string): Promise<TestSuite[]> {
  const suites: TestSuite[] = [];

  if (filePath) {
    const resolved = path.resolve(filePath);
    const stat = fs.statSync(resolved);
    const files = stat.isDirectory()
      ? fs
          .readdirSync(resolved)
          .filter(
            (f) =>
              f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".json"),
          )
          .map((f) => path.join(resolved, f))
      : [resolved];

    for (const f of files) {
      const raw = fs.readFileSync(f, "utf-8");
      const parsed = f.endsWith(".json")
        ? (JSON.parse(raw) as TestSuite)
        : (yaml.load(raw) as TestSuite);
      suites.push(parsed);
    }
  } else {
    // Default: look for tests/ directory
    const defaultDir = path.resolve("tests");
    if (fs.existsSync(defaultDir)) {
      const files = fs
        .readdirSync(defaultDir)
        .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
        .map((f) => path.join(defaultDir, f));
      for (const f of files) {
        const raw = fs.readFileSync(f, "utf-8");
        suites.push(yaml.load(raw) as TestSuite);
      }
    }
  }

  return suites;
}

// ── Command registration ──────────────────────────────────────────────────────

export function registerApiCommands(program: Command): void {
  const apiCmd = program
    .command("api")
    .description("Make API calls and run test suites");

  // iof api call <METHOD> <path>
  apiCmd
    .command("call <method> <urlPath>")
    .description("Make an API request")
    .option("--data <json>", "Request body as a JSON string")
    .option("--file <path>", "Read request body from a JSON file")
    .option(
      "--header <header>",
      "Add request header (can repeat)",
      collectRepeatable,
      [] as string[],
    )
    .option(
      "--format <format>",
      "Output format: table|json|yaml|csv|pretty",
      "json",
    )
    .action(
      async (
        method: string,
        urlPath: string,
        opts: {
          data?: string;
          file?: string;
          header: string[];
          format: string;
        },
      ) => {
        const config = loadConfig();
        requireAuth(config);

        const httpMethod = parseMethod(method);
        const body = parseBody(opts.data, opts.file);
        const extraHeaders = parseHeaders(opts.header);

        const debug = !!(program.opts() as { debug?: boolean }).debug;

        assertValidFormat(opts.format);
        const format: OutputFormat = opts.format as OutputFormat;

        const spinner = ora(`${httpMethod} ${urlPath}`).start();

        try {
          const response = await callApi(
            config,
            httpMethod,
            urlPath,
            body,
            extraHeaders,
            debug,
          );

          spinner.succeed(
            `${chalk.bold(httpMethod)} ${urlPath} → ${chalk.green(String(response.status))}` +
              (response.requestId ? chalk.dim(` [${response.requestId}]`) : ""),
          );

          printOutput(response.data, format);
        } catch (err) {
          spinner.fail(`${httpMethod} ${urlPath} failed`);
          const apiErr = err as {
            code?: string;
            message?: string;
            status?: number;
            requestId?: string;
          };
          console.error(
            chalk.red(
              `Error ${apiErr.status ?? 0}: ${apiErr.code ?? "UNKNOWN"} — ${apiErr.message ?? String(err)}`,
            ),
          );
          if (apiErr.requestId) {
            console.error(chalk.dim(`Request ID: ${apiErr.requestId}`));
          }
          process.exit(1);
        }
      },
    );

  // iof api test [file]
  apiCmd
    .command("test [file]")
    .description("Run an API test suite (YAML/JSON)")
    .option("--coverage", "Show endpoint coverage summary", false)
    .action(async (file: string | undefined, opts: { coverage: boolean }) => {
      const config = loadConfig();
      requireAuth(config);

      const suites = await loadTestSuites(file);

      if (suites.length === 0) {
        console.log(
          chalk.yellow(
            "No test suites found. Create tests/*.yaml to get started.",
          ),
        );
        process.exit(0);
      }

      const allResults: TestResult[] = [];
      let totalPassed = 0;
      let totalFailed = 0;

      for (const suite of suites) {
        console.log(chalk.bold(`\n${suite.name}`));
        const tests = suite.tests;
        const maxTests = Math.min(tests.length, 500);

        for (let i = 0; i < maxTests; i++) {
          const tc = tests[i];
          if (!tc) {
            continue;
          }
          const spinner = ora(`  ${tc.name}`).start();
          const start = Date.now();

          try {
            const httpMethod = parseMethod(tc.request.method);
            const response = await callApi(
              config,
              httpMethod,
              tc.request.path,
              tc.request.body,
              tc.request.headers,
            );

            const duration_ms = Date.now() - start;
            let failure_reason: string | undefined;

            if (response.status !== tc.expect.status) {
              failure_reason = `Expected status ${tc.expect.status}, got ${response.status}`;
            } else if (tc.expect.body) {
              const mismatch = deepSubset(
                response.data as Record<string, unknown>,
                tc.expect.body,
              );
              if (mismatch) {
                failure_reason = mismatch;
              }
            }

            const passed = !failure_reason;
            allResults.push({
              name: tc.name,
              passed,
              status_got: response.status,
              status_expected: tc.expect.status,
              failure_reason,
              duration_ms,
            });

            if (passed) {
              totalPassed++;
              spinner.succeed(
                `  ${tc.name} ${chalk.green("PASS")} ${chalk.dim(`(${duration_ms}ms)`)}`,
              );
            } else {
              totalFailed++;
              spinner.fail(
                `  ${tc.name} ${chalk.red("FAIL")} — ${failure_reason}`,
              );
            }
          } catch (err) {
            const duration_ms = Date.now() - start;
            const e = err as { message?: string };
            totalFailed++;
            spinner.fail(
              `  ${tc.name} ${chalk.red("ERROR")} — ${e.message ?? String(err)}`,
            );
            allResults.push({
              name: tc.name,
              passed: false,
              status_got: 0,
              status_expected: tc.expect.status,
              failure_reason: e.message ?? String(err),
              duration_ms,
            });
          }
        }
      }

      console.log("");
      console.log(
        `Tests: ${chalk.green(String(totalPassed))} passed, ${totalFailed > 0 ? chalk.red(String(totalFailed)) : chalk.dim("0")} failed, ${totalPassed + totalFailed} total`,
      );

      if (opts.coverage) {
        const endpoints = new Set(allResults.map((r) => r.name));
        console.log(
          chalk.bold(`\nCoverage: ${endpoints.size} unique test cases`),
        );
      }

      if (totalFailed > 0) {
        process.exit(1);
      }
    });
}

function collectRepeatable(value: string, previous: string[]): string[] {
  return [...previous, value];
}
