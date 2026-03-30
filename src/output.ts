/**
 * IOF DevTools - Output formatting utilities
 *
 * Supports: table | json | yaml | csv | pretty
 * All public functions accept an arbitrary object/array and a format string.
 */

import chalk from "chalk";
import yaml from "js-yaml";

export type OutputFormat = "table" | "json" | "yaml" | "csv" | "pretty";

const VALID_FORMATS: ReadonlySet<string> = new Set([
  "table",
  "json",
  "yaml",
  "csv",
  "pretty",
]);

export function assertValidFormat(
  format: string,
): asserts format is OutputFormat {
  if (!VALID_FORMATS.has(format)) {
    throw new Error(
      `Invalid output format "${format}". Valid formats: ${[...VALID_FORMATS].join(", ")}`,
    );
  }
}

export function printOutput(data: unknown, format: OutputFormat): void {
  switch (format) {
    case "json":
      console.log(JSON.stringify(data, null, 2));
      break;
    case "yaml":
      console.log(yaml.dump(data, { indent: 2 }));
      break;
    case "csv":
      printCsv(data);
      break;
    case "pretty":
      printPretty(data);
      break;
    case "table":
    default:
      printTable(data);
      break;
  }
}

function printTable(data: unknown): void {
  if (Array.isArray(data) && data.length > 0) {
    const rows = data as Record<string, unknown>[];
    const keys = Object.keys(rows[0] ?? {});

    if (keys.length === 0) {
      console.log(chalk.dim("(empty)"));
      return;
    }

    // Compute column widths — each bounded to [key.length, 60]
    const widths: number[] = keys.map((k) => {
      let max = k.length;
      for (const row of rows) {
        const val = String(row[k] ?? "");
        if (val.length > max) {
          max = val.length;
        }
      }
      return Math.min(max, 60);
    });

    // Header
    const header = keys
      .map((k, i) => chalk.bold.cyan(k.padEnd(widths[i] ?? 0)))
      .join("  ");
    console.log(header);
    console.log(
      // eslint-disable-next-line no-control-regex
      chalk.dim("-".repeat(header.replace(/\x1b\[[0-9;]*m/g, "").length)),
    );

    // Rows
    for (const row of rows) {
      const line = keys
        .map((k, i) => {
          const val = String(row[k] ?? "");
          return val.slice(0, 60).padEnd(widths[i] ?? 0);
        })
        .join("  ");
      console.log(line);
    }
  } else if (data !== null && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      console.log(`${chalk.bold.cyan(k)}: ${formatValue(v)}`);
    }
  } else {
    console.log(String(data));
  }
}

function printCsv(data: unknown): void {
  if (!Array.isArray(data) || data.length === 0) {
    console.log(JSON.stringify(data));
    return;
  }
  const rows = data as Record<string, unknown>[];
  const keys = Object.keys(rows[0] ?? {});

  console.log(keys.map(csvEscape).join(","));
  for (const row of rows) {
    console.log(keys.map((k) => csvEscape(String(row[k] ?? ""))).join(","));
  }
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function printPretty(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) {
    return chalk.dim("null");
  }
  if (typeof v === "boolean") {
    return v ? chalk.green("true") : chalk.red("false");
  }
  if (typeof v === "number") {
    return chalk.yellow(String(v));
  }
  if (typeof v === "object") {
    return chalk.dim(JSON.stringify(v));
  }
  return String(v);
}

export function printSuccess(message: string): void {
  console.log(`${chalk.green("✓")} ${message}`);
}

export function printError(message: string): void {
  console.error(`${chalk.red("✗")} ${message}`);
}

export function printWarning(message: string): void {
  console.warn(`${chalk.yellow("⚠")} ${message}`);
}

export function printInfo(message: string): void {
  console.log(`${chalk.blue("ℹ")} ${message}`);
}
