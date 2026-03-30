/**
 * IOF DevTools - Contract management commands
 *
 * Commands:
 *   iof contracts create <type> [--file] [--customer] [--asset] [--cost] [--profit]
 *   iof contracts list [--status] [--type] [--format]
 *   iof contracts get <id> [--schedule] [--lineage]
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

interface Contract {
  id: string;
  type: string;
  status: string;
  customer_id: string;
  asset_description?: string;
  cost_price?: number;
  profit_amount?: number;
  created_at: string;
  shariah_status?: string;
}

interface ContractListResponse {
  contracts: Contract[];
  total: number;
  page: number;
}

interface PaymentScheduleEntry {
  installment_number: number;
  due_date: string;
  principal: number;
  profit: number;
  total: number;
  status: string;
}

interface ContractDetailResponse extends Contract {
  schedule?: PaymentScheduleEntry[];
  lineage?: { event: string; timestamp: string; actor: string }[];
}

const VALID_CONTRACT_TYPES: ReadonlySet<string> = new Set([
  "murabaha",
  "musharakah",
  "mudharabah",
  "ijarah",
  "wakala",
  "sukuk",
  "takaful",
  "istisna",
  "salam",
]);

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "DRAFT",
  "PENDING",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "DEFAULTED",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertContractType(type: string): void {
  if (!VALID_CONTRACT_TYPES.has(type.toLowerCase())) {
    console.error(
      chalk.red(
        `Unknown contract type "${type}". Valid: ${[...VALID_CONTRACT_TYPES].join(", ")}`,
      ),
    );
    process.exit(1);
  }
}

function buildCreatePayload(
  type: string,
  opts: {
    customer?: string;
    asset?: string;
    cost?: string;
    profit?: string;
  },
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type: type.toUpperCase(),
  };

  if (opts.customer) {
    payload["customer_id"] = opts.customer;
  }
  if (opts.asset) {
    payload["asset_description"] = opts.asset;
  }
  if (opts.cost) {
    const cost = parseFloat(opts.cost);
    if (isNaN(cost) || cost <= 0) {
      console.error(chalk.red("--cost must be a positive number"));
      process.exit(1);
    }
    payload["cost_price"] = cost;
  }
  if (opts.profit) {
    const profit = parseFloat(opts.profit);
    if (isNaN(profit) || profit < 0) {
      console.error(chalk.red("--profit must be a non-negative number"));
      process.exit(1);
    }
    payload["profit_amount"] = profit;
  }

  return payload;
}

// ── Command registration ──────────────────────────────────────────────────────

export function registerContractCommands(program: Command): void {
  const contractsCmd = program
    .command("contracts")
    .description("Manage Islamic finance contracts");

  // iof contracts create <type>
  contractsCmd
    .command("create <type>")
    .description("Create a new contract from template")
    .option("--file <path>", "Load contract data from a JSON file")
    .option("--customer <id>", "Customer ID")
    .option("--asset <description>", "Asset description")
    .option("--cost <amount>", "Asset cost price")
    .option("--profit <amount>", "Profit amount")
    .option(
      "--format <format>",
      "Output format: table|json|yaml|csv|pretty",
      "json",
    )
    .action(
      async (
        type: string,
        opts: {
          file?: string;
          customer?: string;
          asset?: string;
          cost?: string;
          profit?: string;
          format: string;
        },
      ) => {
        assertContractType(type);

        const config = loadConfig();
        requireAuth(config);

        assertValidFormat(opts.format);
        const format: OutputFormat = opts.format as OutputFormat;

        let payload: Record<string, unknown>;

        if (opts.file) {
          const resolved = path.resolve(opts.file);
          if (!fs.existsSync(resolved)) {
            console.error(chalk.red(`File not found: ${resolved}`));
            process.exit(1);
          }
          payload = JSON.parse(fs.readFileSync(resolved, "utf-8")) as Record<
            string,
            unknown
          >;
          payload["type"] = type.toUpperCase();
        } else {
          payload = buildCreatePayload(type, opts);
        }

        if (!payload["customer_id"] && !opts.file) {
          // Interactive prompt for missing required fields
          const { default: inquirer } = await import("inquirer");
          const answers = await inquirer.prompt<{
            customer_id: string;
            cost_price: string;
            profit_amount: string;
          }>([
            {
              type: "input",
              name: "customer_id",
              message: "Customer ID:",
              validate: (v: string) => (v.length > 0 ? true : "Required"),
            },
            {
              type: "input",
              name: "cost_price",
              message: "Cost price:",
              validate: (v: string) =>
                !isNaN(parseFloat(v)) ? true : "Must be a number",
            },
            {
              type: "input",
              name: "profit_amount",
              message: "Profit amount:",
              validate: (v: string) =>
                !isNaN(parseFloat(v)) ? true : "Must be a number",
            },
          ]);
          payload["customer_id"] = answers.customer_id;
          payload["cost_price"] = parseFloat(answers.cost_price);
          payload["profit_amount"] = parseFloat(answers.profit_amount);
        }

        const spinner = ora(`Creating ${type} contract...`).start();

        try {
          const response = await callApi<Contract>(
            config,
            "POST",
            `/api/v1/contracts/${type.toLowerCase()}`,
            payload,
          );
          spinner.succeed(`Contract created: ${chalk.bold(response.data.id)}`);
          printOutput(response.data, format);
        } catch (err) {
          spinner.fail("Failed to create contract.");
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

  // iof contracts list
  contractsCmd
    .command("list")
    .description("List contracts")
    .option("--status <status>", "Filter by contract status")
    .option("--type <type>", "Filter by contract type")
    .option("--page <n>", "Page number", "1")
    .option("--limit <n>", "Results per page (max 100)", "20")
    .option(
      "--format <format>",
      "Output format: table|json|yaml|csv|pretty",
      "table",
    )
    .action(
      async (opts: {
        status?: string;
        type?: string;
        page: string;
        limit: string;
        format: string;
      }) => {
        const config = loadConfig();
        requireAuth(config);

        if (opts.status && !VALID_STATUSES.has(opts.status.toUpperCase())) {
          console.error(
            chalk.red(
              `Invalid status "${opts.status}". Valid: ${[...VALID_STATUSES].join(", ")}`,
            ),
          );
          process.exit(1);
        }

        const page = parseInt(opts.page, 10);
        const limit = Math.min(parseInt(opts.limit, 10), 100);

        if (isNaN(page) || page < 1) {
          console.error(chalk.red("--page must be a positive integer"));
          process.exit(1);
        }
        if (isNaN(limit) || limit < 1) {
          console.error(chalk.red("--limit must be between 1 and 100"));
          process.exit(1);
        }

        assertValidFormat(opts.format);
        const format: OutputFormat = opts.format as OutputFormat;

        const params = new URLSearchParams({
          page: String(page),
          limit: String(limit),
        });
        if (opts.status) {
          params.set("status", opts.status.toUpperCase());
        }
        if (opts.type) {
          params.set("type", opts.type.toUpperCase());
        }

        const spinner = ora("Fetching contracts...").start();

        try {
          const response = await callApi<ContractListResponse>(
            config,
            "GET",
            `/api/v1/contracts?${params.toString()}`,
          );
          spinner.stop();
          console.log(
            chalk.dim(
              `Total: ${response.data.total} contract(s), page ${response.data.page}`,
            ),
          );
          printOutput(response.data.contracts, format);
        } catch (err) {
          spinner.fail("Failed to list contracts.");
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

  // iof contracts get <id>
  contractsCmd
    .command("get <id>")
    .description("Get contract details")
    .option("--schedule", "Include payment schedule", false)
    .option("--lineage", "Include contract event lineage", false)
    .option(
      "--format <format>",
      "Output format: table|json|yaml|csv|pretty",
      "table",
    )
    .action(
      async (
        id: string,
        opts: { schedule: boolean; lineage: boolean; format: string },
      ) => {
        const config = loadConfig();
        requireAuth(config);

        if (!id || id.length === 0) {
          console.error(chalk.red("Contract ID is required"));
          process.exit(1);
        }

        assertValidFormat(opts.format);
        const format: OutputFormat = opts.format as OutputFormat;

        const params = new URLSearchParams();
        if (opts.schedule) {
          params.set("include", "schedule");
        }
        if (opts.lineage) {
          params.set("include", opts.schedule ? "schedule,lineage" : "lineage");
        }

        const spinner = ora(`Fetching contract ${id}...`).start();

        try {
          const queryString = params.toString() ? `?${params.toString()}` : "";
          const response = await callApi<ContractDetailResponse>(
            config,
            "GET",
            `/api/v1/contracts/${id}${queryString}`,
          );
          spinner.stop();

          const contract = response.data;
          printOutput(contract, format);

          if (
            opts.schedule &&
            contract.schedule &&
            contract.schedule.length > 0
          ) {
            console.log(chalk.bold("\nPayment Schedule:"));
            printOutput(contract.schedule, format);
          }

          if (opts.lineage && contract.lineage && contract.lineage.length > 0) {
            console.log(chalk.bold("\nContract Lineage:"));
            printOutput(contract.lineage, format);
          }
        } catch (err) {
          spinner.fail(`Failed to fetch contract ${id}.`);
          const e = err as { code?: string; message?: string; status?: number };
          if ((e.status ?? 0) === 404) {
            console.error(chalk.red(`Contract "${id}" not found.`));
          } else {
            console.error(
              chalk.red(
                `${e.code ?? "ERROR"} (${e.status ?? 0}): ${e.message ?? String(err)}`,
              ),
            );
          }
          process.exit(1);
        }
      },
    );
}
