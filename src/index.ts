/**
 * IOF DevTools - Main CLI entry point
 *
 * Bootstraps the Commander program, registers all sub-command groups,
 * and attaches global flags (--debug, --verbose, --format).
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { exec } from "child_process";
import { Command } from "commander";
import chalk from "chalk";
import { registerLoginCommands } from "./commands/login.js";
import { registerApiCommands } from "./commands/api.js";
import { registerContractCommands } from "./commands/contracts.js";
import { registerShariahCommands } from "./commands/shariah.js";
import { registerEnvCommands } from "./commands/env.js";
import { registerMockCommands } from "./commands/mock.js";
import { registerWebhookCommands } from "./commands/webhooks.js";
import { registerSdkCommands } from "./commands/sdk.js";
import ora from "ora";
import {
  loadConfig,
  configGet,
  configSet,
  saveConfig,
  requireAuth,
} from "./config.js";
import { callApi } from "./http.js";

const pkg = { name: "@iof/devtools", version: "1.0.0" };

const program = new Command();

program
  .name("iof")
  .description("Islamic Open Finance™ DevTools CLI")
  .version(pkg.version, "-v, --version", "Print version number")
  .option("--debug", "Enable debug output", false)
  .option("--verbose", "Enable verbose output", false)
  .option(
    "--format <format>",
    "Output format: table|json|yaml|csv|pretty",
    "table",
  );

// ── Auth commands: login, logout, whoami ────────────────────────────────────
registerLoginCommands(program);

// ── API call / test commands ─────────────────────────────────────────────────
registerApiCommands(program);

// ── Contract management commands ─────────────────────────────────────────────
registerContractCommands(program);

// ── Shariah compliance commands ───────────────────────────────────────────────
registerShariahCommands(program);

// ── Environment management commands ──────────────────────────────────────────
registerEnvCommands(program);

// ── Mock server commands ──────────────────────────────────────────────────────
registerMockCommands(program);

// ── Webhook commands ───────────────────────────────────────────────────────────
registerWebhookCommands(program);

// ── SDK generation commands ────────────────────────────────────────────────────
registerSdkCommands(program);

// ── config sub-command ─────────────────────────────────────────────────────────
const configCmd = program
  .command("config")
  .description("Manage CLI configuration");

configCmd
  .command("list")
  .description("Show all configuration values")
  .action(() => {
    const config = loadConfig();
    console.log(JSON.stringify(config, null, 2));
  });

configCmd
  .command("get <key>")
  .description("Get a configuration value")
  .action((key: string) => {
    const config = loadConfig();
    const value = configGet(config, key);
    if (value === undefined) {
      console.error(chalk.red(`Unknown config key: ${key}`));
      process.exit(1);
    }
    console.log(value);
  });

configCmd
  .command("set <key> <value>")
  .description("Set a configuration value")
  .action((key: string, value: string) => {
    const config = loadConfig();
    try {
      configSet(config, key, value);
      saveConfig(config);
      console.log(`${chalk.green("✓")} ${key} = ${value}`);
    } catch (err) {
      const e = err as Error;
      console.error(chalk.red(e.message));
      process.exit(1);
    }
  });

configCmd
  .command("reset")
  .description("Reset configuration to defaults")
  .action(() => {
    const configPath = path.join(os.homedir(), ".iof", "config.json");
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
    console.log(`${chalk.green("✓")} Configuration reset to defaults.`);
  });

// ── portal sub-command ─────────────────────────────────────────────────────────
const portalCmd = program
  .command("portal")
  .description("Open the IOF developer portal in a browser");

portalCmd.action(() => {
  openUrl("https://app.islamicopenfinance.com");
});

portalCmd
  .command("keys")
  .description("Open API keys page")
  .action(() => {
    openUrl("https://app.islamicopenfinance.com/api-keys");
  });

portalCmd
  .command("docs")
  .description("Open documentation")
  .action(() => {
    openUrl("https://docs.islamicopenfinance.com");
  });

function openUrl(url: string): void {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd);
  console.log(`${chalk.blue("ℹ")} Opening ${chalk.cyan(url)}`);
}

// ── logs sub-command ───────────────────────────────────────────────────────────
program
  .command("logs")
  .description("View platform logs")
  .option("--follow", "Follow log output (tail -f style)", false)
  .option("--service <service>", "Filter by service name")
  .option(
    "--level <level>",
    "Filter by log level (debug|info|warn|error|fatal)",
  )
  .option("--grep <pattern>", "Filter log lines by pattern")
  .option("--format <format>", "Output format: table|json", "table")
  .action(
    async (opts: {
      follow: boolean;
      service?: string;
      level?: string;
      grep?: string;
      format: string;
    }) => {
      const config = loadConfig();
      requireAuth(config);

      const params = new URLSearchParams();
      if (opts.service) {
        params.set("service", opts.service);
      }
      if (opts.level) {
        params.set("level", opts.level);
      }

      const spinner = ora("Fetching logs...").start();

      try {
        const resp = await callApi<{ logs: Record<string, unknown>[] }>(
          config,
          "GET",
          `/api/v1/logs?${params.toString()}`,
        );
        spinner.stop();

        let entries = resp.data.logs;

        if (opts.grep) {
          const pattern = opts.grep.toLowerCase();
          entries = entries.filter((e) =>
            JSON.stringify(e).toLowerCase().includes(pattern),
          );
        }

        if (opts.format === "json") {
          console.log(JSON.stringify(entries, null, 2));
        } else {
          for (const entry of entries) {
            const ts = String(entry["timestamp"] ?? "");
            const svc = String(entry["service"] ?? "");
            const lvl = String(entry["severity"] ?? entry["level"] ?? "info");
            const msg = String(entry["message"] ?? "");
            const levelColor =
              lvl === "error" || lvl === "fatal"
                ? chalk.red
                : lvl === "warn"
                  ? chalk.yellow
                  : lvl === "debug"
                    ? chalk.dim
                    : chalk.white;
            console.log(
              `${chalk.dim(ts)} ${chalk.cyan(svc)} ${levelColor(lvl.toUpperCase())} ${msg}`,
            );
          }
        }

        if (opts.follow) {
          console.log(
            chalk.dim(
              "--- streaming not yet supported in sandbox mode; polling every 5s ---",
            ),
          );
          const poll = setInterval(async () => {
            try {
              const r2 = await callApi<{ logs: Record<string, unknown>[] }>(
                config,
                "GET",
                `/api/v1/logs?${params.toString()}&since=now`,
              );
              for (const entry of r2.data.logs) {
                const msg = String(entry["message"] ?? "");
                console.log(msg);
              }
            } catch {
              // swallow polling errors
            }
          }, 5000);

          process.on("SIGINT", () => {
            clearInterval(poll);
            process.exit(0);
          });
        }
      } catch (err) {
        spinner.fail("Failed to fetch logs.");
        const e = err as { message?: string };
        console.error(chalk.red(e.message ?? String(err)));
        process.exit(1);
      }
    },
  );

// ── generate sub-command ───────────────────────────────────────────────────────
program
  .command("generate <type>")
  .description("Generate mock data (contracts|customers|cards|all)")
  .option("--count <n>", "Number of records to generate", "10")
  .option("--output <path>", "Output file or directory path")
  .action(async (type: string, opts: { count: string; output?: string }) => {
    const count = parseInt(opts.count, 10);
    if (isNaN(count) || count <= 0 || count > 10000) {
      console.error(chalk.red("--count must be between 1 and 10000"));
      process.exit(1);
    }

    const validTypes = new Set(["contracts", "customers", "cards", "all"]);
    if (!validTypes.has(type)) {
      console.error(
        chalk.red(
          `Unknown type "${type}". Valid: ${[...validTypes].join(", ")}`,
        ),
      );
      process.exit(1);
    }

    const spinner = ora(`Generating ${count} ${type}...`).start();

    const records: Record<string, unknown>[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < count; i++) {
      if (type === "contracts" || type === "all") {
        records.push({
          id: `CNT-${String(i + 1).padStart(6, "0")}`,
          type: "MURABAHA",
          status: "DRAFT",
          customer_id: `CUST-${String(i + 1).padStart(4, "0")}`,
          cost_price: 10000 + i * 500,
          profit_amount: 1000 + i * 50,
          created_at: now,
        });
      }
    }

    if (type === "customers" || type === "all") {
      for (let i = 0; i < count; i++) {
        records.push({
          id: `CUST-${String(i + 1).padStart(4, "0")}`,
          name: `Customer ${i + 1}`,
          email: `customer${i + 1}@example.com`,
          created_at: now,
        });
      }
    }

    if (type === "cards" || type === "all") {
      for (let i = 0; i < count; i++) {
        records.push({
          id: `CARD-${String(i + 1).padStart(4, "0")}`,
          customer_id: `CUST-${String(i + 1).padStart(4, "0")}`,
          status: "ACTIVE",
          created_at: now,
        });
      }
    }

    const json = JSON.stringify(records, null, 2);

    if (opts.output) {
      const outPath = path.resolve(opts.output);
      const dir = path.dirname(outPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(outPath, json, "utf-8");
      spinner.succeed(`Generated ${records.length} records → ${outPath}`);
    } else {
      spinner.stop();
      console.log(json);
    }
  });

// ── init sub-command ───────────────────────────────────────────────────────────
program
  .command("init")
  .description("Initialize a new IOF integration project")
  .option("--template <name>", "Project template to use")
  .option(
    "--lang <language>",
    "Programming language (typescript|python|java|go)",
  )
  .option("--framework <name>", "Framework to scaffold")
  .action(
    async (opts: { template?: string; lang?: string; framework?: string }) => {
      const { default: inquirer } = await import("inquirer");

      const TEMPLATES: Record<string, string> = {
        "typescript-express": "TypeScript + Express",
        "typescript-fastify": "TypeScript + Fastify",
        "python-fastapi": "Python + FastAPI",
        "java-spring": "Java + Spring Boot",
        "go-gin": "Go + Gin",
      };

      let template = opts.template;

      if (!template) {
        const answers = await inquirer.prompt<{ template: string }>([
          {
            type: "list",
            name: "template",
            message: "Choose a project template:",
            choices: Object.entries(TEMPLATES).map(([k, v]) => ({
              name: v,
              value: k,
            })),
          },
        ]);
        template = answers.template;
      }

      if (!TEMPLATES[template]) {
        console.error(
          chalk.red(
            `Unknown template "${template}". Valid: ${Object.keys(TEMPLATES).join(", ")}`,
          ),
        );
        process.exit(1);
      }

      console.log(
        `${chalk.green("✓")} Scaffolding ${chalk.bold(TEMPLATES[template])} project...`,
      );
      console.log(
        chalk.dim(
          "Template scaffolding requires network access to the IOF template registry.",
        ),
      );
      console.log(
        `Visit ${chalk.cyan("https://docs.islamicopenfinance.com/quickstart")} for manual setup instructions.`,
      );
    },
  );

// ── plugins sub-command ─────────────────────────────────────────────────────────
const pluginsCmd = program.command("plugins").description("Manage CLI plugins");

pluginsCmd
  .command("list")
  .description("List installed plugins")
  .action(() => {
    console.log(chalk.dim("No plugins installed."));
    console.log(
      `Install a plugin with: ${chalk.bold("iof plugins install <plugin>")}`,
    );
  });

pluginsCmd
  .command("install <plugin>")
  .description("Install a plugin")
  .action((plugin: string) => {
    console.log(`${chalk.blue("ℹ")} Installing ${chalk.bold(plugin)}...`);
    console.log(
      chalk.dim("Plugin registry not yet available in this version."),
    );
  });

pluginsCmd
  .command("remove <plugin>")
  .description("Remove a plugin")
  .action((plugin: string) => {
    console.log(chalk.red(`Plugin ${plugin} is not installed.`));
  });

pluginsCmd
  .command("create <name>")
  .description("Scaffold a new plugin")
  .action((name: string) => {
    console.log(
      `${chalk.green("✓")} Scaffolding plugin ${chalk.bold(name)}...`,
    );
    console.log(
      `See ${chalk.cyan("https://docs.islamicopenfinance.com/devtools/plugins")} for the plugin API.`,
    );
  });

// ── Error handling ──────────────────────────────────────────────────────────────
program.configureOutput({
  outputError: (str, write) => write(chalk.red(str)),
});

program.parseAsync(process.argv).catch((err: unknown) => {
  const e = err as Error;
  console.error(chalk.red("Fatal error: " + (e.message ?? String(err))));
  process.exit(1);
});
