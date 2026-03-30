/**
 * IOF DevTools - Mock server commands
 *
 * Commands:
 *   iof mock start [--stateful] [--seed] [--port <n>]
 *   iof mock seed [--file <path>] [--clear]
 *   iof mock stop
 *   iof mock status
 */

import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MockState {
  contracts: Record<string, unknown>[];
  customers: Record<string, unknown>[];
  cards: Record<string, unknown>[];
}

const DEFAULT_PORT = 8080;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

// ── Seed data ────────────────────────────────────────────────────────────────

function buildSeedData(): MockState {
  const now = new Date().toISOString();
  return {
    contracts: [
      {
        id: "CNT-000001",
        type: "MURABAHA",
        status: "ACTIVE",
        customer_id: "CUST-0001",
        asset_description: "Toyota Camry 2024",
        cost_price: 50000,
        profit_amount: 5000,
        created_at: now,
        shariah_status: "COMPLIANT",
      },
      {
        id: "CNT-000002",
        type: "IJARAH",
        status: "DRAFT",
        customer_id: "CUST-0002",
        asset_description: "Commercial Office Space",
        cost_price: 200000,
        profit_amount: 20000,
        created_at: now,
        shariah_status: "COMPLIANT",
      },
    ],
    customers: [
      {
        id: "CUST-0001",
        name: "Ahmad Al-Rashid",
        email: "ahmad@example.com",
        kyc_status: "VERIFIED",
        created_at: now,
      },
      {
        id: "CUST-0002",
        name: "Fatima Hassan",
        email: "fatima@example.com",
        kyc_status: "VERIFIED",
        created_at: now,
      },
    ],
    cards: [
      {
        id: "CARD-0001",
        customer_id: "CUST-0001",
        type: "DEBIT_HALAL",
        status: "ACTIVE",
        created_at: now,
      },
    ],
  };
}

// ── Mock HTTP server ──────────────────────────────────────────────────────────

function buildMockServer(state: MockState, stateful: boolean): http.Server {
  let store: MockState = stateful ? structuredClone(state) : state;

  return http.createServer((req, res) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Mock-Server", "iof-devtools");

    let body = "";
    req.on("data", (chunk: Buffer) => {
      // Limit body to 1 MB to prevent unbounded reads
      if (body.length < 1_048_576) {
        body += chunk.toString();
      }
    });

    req.on("end", () => {
      const response = routeRequest(method, url, body, store, stateful);
      if (stateful && response.updatedStore) {
        store = response.updatedStore;
      }
      res.statusCode = response.status;
      res.end(JSON.stringify(response.body, null, 2));
    });
  });
}

interface RouteResponse {
  status: number;
  body: unknown;
  updatedStore?: MockState;
}

function routeRequest(
  method: string,
  url: string,
  rawBody: string,
  store: MockState,
  stateful: boolean,
): RouteResponse {
  const urlObj = new URL(url, "http://localhost");
  const pathname = urlObj.pathname;

  // Health check
  if (pathname === "/health" || pathname === "/api/v1/health") {
    return { status: 200, body: { status: "ok", mock: true } };
  }

  // Auth whoami
  if (pathname === "/api/v1/auth/me") {
    return {
      status: 200,
      body: {
        id: "usr_mock_001",
        name: "Mock User",
        email: "mock@islamicopenfinance.com",
        organization: "Mock Org",
        role: "developer",
        environment: "mock",
        created_at: new Date().toISOString(),
      },
    };
  }

  // Contracts list
  if (pathname === "/api/v1/contracts" && method === "GET") {
    return {
      status: 200,
      body: {
        contracts: store.contracts,
        total: store.contracts.length,
        page: 1,
      },
    };
  }

  // Contract create (any type)
  if (
    pathname.startsWith("/api/v1/contracts/") &&
    method === "POST" &&
    !pathname.match(/\/api\/v1\/contracts\/CNT-/)
  ) {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return {
        status: 400,
        body: {
          error: {
            code: "INVALID_JSON",
            message: "Request body is not valid JSON",
          },
        },
      };
    }

    // Shariah check: reject ALCOHOL asset category
    if (String(parsed["asset_category"] ?? "").toUpperCase() === "ALCOHOL") {
      return {
        status: 422,
        body: {
          error: {
            code: "SHARIAH_BREACH",
            message: "Asset category ALCOHOL is prohibited under Shariah law",
            details: { field: "asset_category", rule: "HALAL_ASSET_REQUIRED" },
          },
        },
      };
    }

    const id = `CNT-${String(store.contracts.length + 1).padStart(6, "0")}`;
    const newContract = {
      id,
      status: "DRAFT",
      created_at: new Date().toISOString(),
      ...parsed,
    };

    if (stateful) {
      const updatedStore = {
        ...store,
        contracts: [...store.contracts, newContract],
      };
      return { status: 201, body: newContract, updatedStore };
    }
    return { status: 201, body: newContract };
  }

  // Contract get by ID
  const contractMatch = pathname.match(/^\/api\/v1\/contracts\/([^/]+)$/);
  if (contractMatch && method === "GET") {
    const contractId = contractMatch[1];
    const contract = store.contracts.find(
      (c) => (c as { id: string }).id === contractId,
    );
    if (!contract) {
      return {
        status: 404,
        body: {
          error: {
            code: "CONTRACT_NOT_FOUND",
            message: `Contract ${contractId} not found`,
          },
        },
      };
    }
    return { status: 200, body: contract };
  }

  // Customers list
  if (pathname === "/api/v1/customers" && method === "GET") {
    return {
      status: 200,
      body: { customers: store.customers, total: store.customers.length },
    };
  }

  // Shariah validate
  if (pathname === "/api/v1/shariah/validate" && method === "POST") {
    return {
      status: 200,
      body: {
        valid: true,
        contract_type: "MURABAHA",
        shariah_standard: "AAOIFI SS-8",
        violations: [],
        warnings: [],
        board_approval_required: false,
        checked_at: new Date().toISOString(),
      },
    };
  }

  // Shariah rules
  if (pathname === "/api/v1/shariah/rules" && method === "GET") {
    return {
      status: 200,
      body: {
        rules: [
          {
            id: "MUR_ASSET_HALAL",
            name: "Asset must be Halal",
            category: "ASSETS",
            description:
              "The asset being financed must be permissible under Islamic law",
            contract_types: ["MURABAHA", "IJARAH"],
            aaoifi_standard: "SS-8 Section 4.1",
            severity: "CRITICAL",
          },
          {
            id: "MUR_NO_RIBA",
            name: "No interest (Riba) permitted",
            category: "PAYMENTS",
            description:
              "Profit must be based on legitimate trade margin, not interest",
            contract_types: ["MURABAHA"],
            aaoifi_standard: "SS-8 Section 3.2",
            severity: "CRITICAL",
          },
        ],
        total: 2,
      },
    };
  }

  // Logs
  if (pathname === "/api/v1/logs" && method === "GET") {
    return {
      status: 200,
      body: {
        logs: [
          {
            service: "mock-server",
            severity: "info",
            message: "Mock server running — no real logs available",
            timestamp: new Date().toISOString(),
          },
        ],
      },
    };
  }

  // 404 fallback
  return {
    status: 404,
    body: {
      error: {
        code: "NOT_FOUND",
        message: `Mock route not found: ${method} ${pathname}`,
        mock: true,
      },
    },
  };
}

// ── Command registration ──────────────────────────────────────────────────────

export function registerMockCommands(program: Command): void {
  const mockCmd = program
    .command("mock")
    .description("Start and manage the local mock server");

  // iof mock start
  mockCmd
    .command("start")
    .description("Start the local mock server")
    .option(
      "--stateful",
      "Enable stateful mode (mutations persist in memory)",
      false,
    )
    .option("--seed", "Pre-load seed data on start", false)
    .option("--port <n>", "Port to listen on", String(DEFAULT_PORT))
    .action((opts: { stateful: boolean; seed: boolean; port: string }) => {
      const port = parseInt(opts.port, 10);

      if (isNaN(port) || port < MIN_PORT || port > MAX_PORT) {
        console.error(
          chalk.red(`--port must be between ${MIN_PORT} and ${MAX_PORT}`),
        );
        process.exit(1);
      }

      const state = opts.seed
        ? buildSeedData()
        : { contracts: [], customers: [], cards: [] };

      const server = buildMockServer(state, opts.stateful);

      server.listen(port, () => {
        console.log(
          `${chalk.green("✓")} IOF mock server running at ${chalk.cyan(`http://localhost:${port}`)}`,
        );
        console.log(
          `  Mode:      ${opts.stateful ? chalk.yellow("stateful") : "stateless"}`,
        );
        console.log(
          `  Seed data: ${opts.seed ? chalk.green("loaded") : chalk.dim("none")}`,
        );
        console.log(chalk.dim("\nPress Ctrl+C to stop.\n"));

        if (opts.seed) {
          console.log(
            `  ${chalk.bold(String(state.contracts.length))} contracts, ${chalk.bold(String(state.customers.length))} customers, ${chalk.bold(String(state.cards.length))} cards loaded`,
          );
        }

        console.log(chalk.dim("Available endpoints:"));
        console.log(chalk.dim(`  GET  /health`));
        console.log(chalk.dim(`  GET  /api/v1/auth/me`));
        console.log(chalk.dim(`  GET  /api/v1/contracts`));
        console.log(chalk.dim(`  POST /api/v1/contracts/:type`));
        console.log(chalk.dim(`  GET  /api/v1/contracts/:id`));
        console.log(chalk.dim(`  POST /api/v1/shariah/validate`));
        console.log(chalk.dim(`  GET  /api/v1/shariah/rules`));
        console.log(chalk.dim(`  GET  /api/v1/logs`));
      });

      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.error(
            chalk.red(
              `Port ${port} is already in use. Try --port <other-port>.`,
            ),
          );
        } else {
          console.error(chalk.red(`Server error: ${err.message}`));
        }
        process.exit(1);
      });

      process.on("SIGINT", () => {
        console.log(chalk.dim("\nStopping mock server..."));
        server.close(() => {
          console.log(chalk.green("✓") + " Mock server stopped.");
          process.exit(0);
        });
      });
    });

  // iof mock seed
  mockCmd
    .command("seed")
    .description("Load seed data into a running mock server")
    .option("--file <path>", "Custom seed data JSON file")
    .option("--clear", "Clear all data", false)
    .option("--port <n>", "Mock server port", String(DEFAULT_PORT))
    .action(async (opts: { file?: string; clear: boolean; port: string }) => {
      const port = parseInt(opts.port, 10);
      if (isNaN(port) || port < MIN_PORT || port > MAX_PORT) {
        console.error(
          chalk.red(`--port must be between ${MIN_PORT} and ${MAX_PORT}`),
        );
        process.exit(1);
      }

      const spinner = ora("Sending seed data to mock server...").start();

      try {
        let seedData: unknown;

        if (opts.clear) {
          seedData = { action: "clear" };
        } else if (opts.file) {
          const resolved = path.resolve(opts.file);
          if (!fs.existsSync(resolved)) {
            spinner.fail(`File not found: ${resolved}`);
            process.exit(1);
          }
          seedData = JSON.parse(fs.readFileSync(resolved, "utf-8"));
        } else {
          seedData = buildSeedData();
        }

        const payload = JSON.stringify(seedData);

        await new Promise<void>((resolve, reject) => {
          const req = http.request(
            {
              hostname: "localhost",
              port,
              path: "/api/v1/mock/seed",
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              },
            },
            (res) => {
              res.resume();
              if (res.statusCode === 200 || res.statusCode === 204) {
                resolve();
              } else {
                reject(new Error(`Unexpected status ${res.statusCode}`));
              }
            },
          );
          req.on("error", reject);
          req.write(payload);
          req.end();
        });

        spinner.succeed(
          opts.clear ? "Mock server data cleared." : "Seed data loaded.",
        );
      } catch (err) {
        const e = err as Error;
        spinner.fail(`Failed: ${e.message}`);
        console.error(
          chalk.yellow(
            'Make sure the mock server is running with "iof mock start --stateful"',
          ),
        );
        process.exit(1);
      }
    });

  // iof mock status
  mockCmd
    .command("status")
    .description("Check if the mock server is running")
    .option("--port <n>", "Mock server port to check", String(DEFAULT_PORT))
    .action(async (opts: { port: string }) => {
      const port = parseInt(opts.port, 10);
      if (isNaN(port) || port < MIN_PORT || port > MAX_PORT) {
        console.error(
          chalk.red(`--port must be between ${MIN_PORT} and ${MAX_PORT}`),
        );
        process.exit(1);
      }

      const spinner = ora(`Checking mock server on port ${port}...`).start();

      try {
        await new Promise<void>((resolve, reject) => {
          const req = http.request(
            { hostname: "localhost", port, path: "/health", method: "GET" },
            (res) => {
              res.resume();
              if (res.statusCode === 200) {
                resolve();
              } else {
                reject(new Error(`Status ${res.statusCode}`));
              }
            },
          );
          req.setTimeout(3000, () => {
            req.destroy();
            reject(new Error("timeout"));
          });
          req.on("error", reject);
          req.end();
        });

        spinner.succeed(
          `Mock server is ${chalk.green("running")} at http://localhost:${port}`,
        );
      } catch {
        spinner.fail(
          `Mock server is ${chalk.red("not running")} on port ${port}`,
        );
        console.log(`Start it with: ${chalk.bold("iof mock start")}`);
        process.exit(1);
      }
    });
}
