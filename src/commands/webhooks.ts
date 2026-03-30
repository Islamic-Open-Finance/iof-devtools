/**
 * IOF DevTools - Webhook testing commands
 *
 * Commands:
 *   iof webhooks listen [--port <n>] [--events <list>] [--save <file>]
 *   iof webhooks test <url> [--event <name>] [--data <file>]
 */

import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { loadConfig, requireAuth } from "../config.js";
import { callApi } from "../http.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WebhookEvent {
  id: string;
  type: string;
  created_at: string;
  data: Record<string, unknown>;
  livemode: boolean;
}

const VALID_EVENT_TYPES: ReadonlySet<string> = new Set([
  "contract.created",
  "contract.activated",
  "contract.completed",
  "contract.cancelled",
  "payment.received",
  "payment.failed",
  "kyc.approved",
  "kyc.rejected",
  "shariah.approved",
  "shariah.rejected",
]);

const DEFAULT_LISTEN_PORT = 3000;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildTestPayload(
  eventType: string,
  customData?: Record<string, unknown>,
): WebhookEvent {
  const id = `evt_test_${Date.now()}`;
  const now = new Date().toISOString();

  const defaultData: Record<string, Record<string, unknown>> = {
    "contract.created": {
      contract: {
        id: "CNT-000001",
        type: "MURABAHA",
        status: "DRAFT",
        customer_id: "CUST-0001",
        created_at: now,
      },
    },
    "contract.activated": {
      contract: { id: "CNT-000001", status: "ACTIVE", activated_at: now },
    },
    "contract.completed": {
      contract: { id: "CNT-000001", status: "COMPLETED", completed_at: now },
    },
    "contract.cancelled": {
      contract: {
        id: "CNT-000001",
        status: "CANCELLED",
        reason: "Customer request",
      },
    },
    "payment.received": {
      payment: {
        id: "PAY-000001",
        contract_id: "CNT-000001",
        amount: 5500,
        currency: "USD",
        received_at: now,
      },
    },
    "payment.failed": {
      payment: {
        id: "PAY-000001",
        failure_reason: "Insufficient funds",
        failed_at: now,
      },
    },
    "kyc.approved": {
      customer: { id: "CUST-0001", kyc_status: "VERIFIED", approved_at: now },
    },
    "kyc.rejected": {
      customer: {
        id: "CUST-0001",
        kyc_status: "REJECTED",
        reason: "Document mismatch",
        rejected_at: now,
      },
    },
    "shariah.approved": {
      contract: {
        id: "CNT-000001",
        shariah_status: "COMPLIANT",
        board_reference: "SB-2025-001",
      },
    },
    "shariah.rejected": {
      contract: {
        id: "CNT-000001",
        shariah_status: "NON_COMPLIANT",
        violations: ["RIBA_DETECTED"],
      },
    },
  };

  return {
    id,
    type: eventType,
    created_at: now,
    data: customData ??
      defaultData[eventType] ?? { raw: `test event for ${eventType}` },
    livemode: false,
  };
}

async function deliverWebhook(
  targetUrl: string,
  payload: WebhookEvent,
  debug: boolean,
): Promise<{ status: number; body: string; duration_ms: number }> {
  const body = JSON.stringify(payload);
  const start = Date.now();

  const url = new URL(targetUrl);
  const isHttps = url.protocol === "https:";
  const lib = isHttps ? https : http;
  const port = url.port ? parseInt(url.port, 10) : isHttps ? 443 : 80;

  if (debug) {
    process.stderr.write(`[debug] Delivering to ${targetUrl}\n`);
    process.stderr.write(`[debug] Payload: ${body.slice(0, 200)}...\n`);
  }

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          "X-IOF-Event": payload.type,
          "X-IOF-Webhook-ID": payload.id,
          "User-Agent": "iof-devtools-webhook/1.0.0",
        },
      },
      (res) => {
        let responseBody = "";
        res.on("data", (chunk: Buffer) => {
          if (responseBody.length < 4096) {
            responseBody += chunk.toString();
          }
        });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            body: responseBody,
            duration_ms: Date.now() - start,
          });
        });
      },
    );

    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Request timed out after 15s"));
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ── Command registration ──────────────────────────────────────────────────────

export function registerWebhookCommands(program: Command): void {
  const webhooksCmd = program
    .command("webhooks")
    .description("Listen for and test webhook events");

  // iof webhooks listen
  webhooksCmd
    .command("listen")
    .description("Start a local webhook listener")
    .option("--port <n>", "Port to listen on", String(DEFAULT_LISTEN_PORT))
    .option(
      "--events <events>",
      "Comma-separated list of event types to show (all if omitted)",
    )
    .option("--save <file>", "Append received events to a JSONL file")
    .action((opts: { port: string; events?: string; save?: string }) => {
      const port = parseInt(opts.port, 10);
      if (isNaN(port) || port < MIN_PORT || port > MAX_PORT) {
        console.error(
          chalk.red(`--port must be between ${MIN_PORT} and ${MAX_PORT}`),
        );
        process.exit(1);
      }

      const eventFilter: string[] | null = opts.events
        ? opts.events.split(",").map((e) => e.trim().toLowerCase())
        : null;

      if (eventFilter) {
        for (const evt of eventFilter) {
          if (!VALID_EVENT_TYPES.has(evt)) {
            console.error(
              chalk.red(
                `Unknown event type "${evt}". Valid: ${[...VALID_EVENT_TYPES].join(", ")}`,
              ),
            );
            process.exit(1);
          }
        }
      }

      let eventsReceived = 0;

      const server = http.createServer((req, res) => {
        let body = "";
        req.on("data", (chunk: Buffer) => {
          if (body.length < 1_048_576) {
            body += chunk.toString();
          }
        });
        req.on("end", () => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ received: true }));

          let event: WebhookEvent;
          try {
            event = JSON.parse(body) as WebhookEvent;
          } catch {
            console.log(
              chalk.dim(
                `[${new Date().toISOString()}] Received non-JSON payload`,
              ),
            );
            return;
          }

          const eventType = event.type ?? "unknown";

          if (eventFilter && !eventFilter.includes(eventType.toLowerCase())) {
            return;
          }

          eventsReceived++;
          const ts = new Date().toISOString();
          console.log(
            `\n${chalk.dim(ts)} ${chalk.bold.cyan(`#${eventsReceived}`)} ${chalk.green(eventType)}`,
          );
          console.log(chalk.dim(`ID: ${event.id}`));
          console.log(JSON.stringify(event.data, null, 2));

          if (opts.save) {
            const savePath = path.resolve(opts.save);
            fs.appendFileSync(savePath, JSON.stringify(event) + "\n", "utf-8");
          }
        });
      });

      server.listen(port, () => {
        console.log(
          `${chalk.green("✓")} Webhook listener running at ${chalk.cyan(`http://localhost:${port}`)}`,
        );
        if (eventFilter) {
          console.log(`  Filtering events: ${eventFilter.join(", ")}`);
        } else {
          console.log(`  Showing all event types`);
        }
        if (opts.save) {
          console.log(`  Saving to: ${path.resolve(opts.save)}`);
        }
        console.log(
          chalk.dim("\nWaiting for events... Press Ctrl+C to stop.\n"),
        );
      });

      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          console.error(chalk.red(`Port ${port} is already in use.`));
        } else {
          console.error(chalk.red(`Server error: ${err.message}`));
        }
        process.exit(1);
      });

      process.on("SIGINT", () => {
        console.log(
          chalk.dim(`\nStopping. ${eventsReceived} event(s) received.`),
        );
        server.close(() => process.exit(0));
      });
    });

  // iof webhooks test <url>
  webhooksCmd
    .command("test <url>")
    .description("Send a test webhook event to a URL")
    .option("--event <type>", "Event type to send", "contract.created")
    .option("--data <file>", "JSON file with custom event data")
    .action(
      async (targetUrl: string, opts: { event: string; data?: string }) => {
        const eventType = opts.event.toLowerCase();
        if (!VALID_EVENT_TYPES.has(eventType)) {
          console.error(
            chalk.red(
              `Unknown event type "${opts.event}". Valid: ${[...VALID_EVENT_TYPES].join(", ")}`,
            ),
          );
          process.exit(1);
        }

        let customData: Record<string, unknown> | undefined;
        if (opts.data) {
          const resolved = path.resolve(opts.data);
          if (!fs.existsSync(resolved)) {
            console.error(chalk.red(`Data file not found: ${resolved}`));
            process.exit(1);
          }
          customData = JSON.parse(fs.readFileSync(resolved, "utf-8")) as Record<
            string,
            unknown
          >;
        }

        const payload = buildTestPayload(eventType, customData);
        const debug = false;

        const spinner = ora(
          `Delivering ${chalk.bold(eventType)} to ${targetUrl}...`,
        ).start();

        try {
          const result = await deliverWebhook(targetUrl, payload, debug);

          if (result.status >= 200 && result.status < 300) {
            spinner.succeed(
              `Delivered ${chalk.bold(eventType)} → ${chalk.green(String(result.status))} (${result.duration_ms}ms)`,
            );
            if (result.body) {
              console.log(chalk.dim("Response: " + result.body.slice(0, 200)));
            }
          } else {
            spinner.fail(
              `Delivery failed: HTTP ${result.status} (${result.duration_ms}ms)`,
            );
            if (result.body) {
              console.error(chalk.red(result.body.slice(0, 200)));
            }
            process.exit(1);
          }
        } catch (err) {
          spinner.fail("Delivery failed.");
          const e = err as Error;
          console.error(chalk.red(e.message));
          process.exit(1);
        }
      },
    );

  // iof webhooks list (registered webhooks from IOF API)
  webhooksCmd
    .command("list")
    .description("List registered webhooks")
    .option("--format <format>", "Output format: table|json|yaml", "table")
    .action(async (opts: { format: string }) => {
      const config = loadConfig();
      requireAuth(config);

      const { printOutput, assertValidFormat } = await import("../output.js");
      assertValidFormat(opts.format);

      const spinner = ora("Fetching webhooks...").start();
      try {
        const response = await callApi<{ webhooks: Record<string, unknown>[] }>(
          config,
          "GET",
          "/api/v1/webhooks",
        );
        spinner.stop();
        printOutput(
          response.data.webhooks,
          opts.format as "table" | "json" | "yaml" | "csv" | "pretty",
        );
      } catch (err) {
        spinner.fail("Failed to list webhooks.");
        const e = err as { code?: string; message?: string; status?: number };
        console.error(
          chalk.red(
            `${e.code ?? "ERROR"} (${e.status ?? 0}): ${e.message ?? String(err)}`,
          ),
        );
        process.exit(1);
      }
    });
}
