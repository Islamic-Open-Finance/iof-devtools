/**
 * IOF DevTools - Environment management commands
 *
 * Commands:
 *   iof env list
 *   iof env use <name>
 *   iof env current
 *   iof env add <name> --url <url> --api-key <key>
 *   iof env remove <name>
 */

import type { Command } from "commander";
import chalk from "chalk";
import { loadConfig, saveConfig } from "../config.js";

// ── Types ─────────────────────────────────────────────────────────────────────

const BUILT_IN_ENVS: ReadonlySet<string> = new Set(["production", "sandbox"]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function assertValidUrl(url: string): void {
  try {
    new URL(url);
  } catch {
    console.error(chalk.red(`Invalid URL: "${url}"`));
    process.exit(1);
  }
}

function assertEnvName(name: string): void {
  if (name.length === 0 || name.length > 64) {
    console.error(
      chalk.red("Environment name must be between 1 and 64 characters"),
    );
    process.exit(1);
  }
  if (!/^[a-z0-9_-]+$/.test(name)) {
    console.error(
      chalk.red(
        "Environment name must only contain lowercase letters, numbers, hyphens, and underscores",
      ),
    );
    process.exit(1);
  }
}

// ── Command registration ──────────────────────────────────────────────────────

export function registerEnvCommands(program: Command): void {
  const envCmd = program
    .command("env")
    .description("Manage environments (production, sandbox, custom)");

  // iof env list
  envCmd
    .command("list")
    .description("List all configured environments")
    .action(() => {
      const config = loadConfig();
      const envNames = Object.keys(config.environments);
      const maxEnvs = Math.min(envNames.length, 100);

      if (maxEnvs === 0) {
        console.log(chalk.dim("No environments configured."));
        return;
      }

      console.log(chalk.bold("Configured environments:\n"));

      for (let i = 0; i < maxEnvs; i++) {
        const name = envNames[i];
        if (!name) {
          continue;
        }
        const env = config.environments[name];
        const isCurrent = name === config.environment;
        const marker = isCurrent ? chalk.green("* ") : "  ";
        const nameLabel = isCurrent ? chalk.bold.green(name) : chalk.bold(name);
        const keyMasked =
          env && env.api_key
            ? env.api_key.slice(0, 8) + "..." + env.api_key.slice(-4)
            : chalk.dim("(no key)");
        const url = env ? env.url : chalk.dim("(no url)");
        console.log(`${marker}${nameLabel}`);
        console.log(`    URL:     ${url}`);
        console.log(`    API Key: ${keyMasked}`);
      }
    });

  // iof env use <name>
  envCmd
    .command("use <name>")
    .description("Switch to an environment")
    .action((name: string) => {
      assertEnvName(name);
      const config = loadConfig();

      if (!config.environments[name]) {
        console.error(
          chalk.red(
            `Environment "${name}" not found. Run "iof env list" to see available environments.`,
          ),
        );
        process.exit(1);
      }

      config.environment = name;
      saveConfig(config);
      console.log(
        `${chalk.green("✓")} Switched to environment: ${chalk.bold(name)}`,
      );
      console.log(`  URL: ${config.environments[name]?.url ?? ""}`);
    });

  // iof env current
  envCmd
    .command("current")
    .description("Show the active environment")
    .action(() => {
      const config = loadConfig();
      const name = config.environment;
      const env = config.environments[name];

      console.log(`${chalk.bold("Active environment:")} ${chalk.green(name)}`);
      if (env) {
        console.log(`URL: ${env.url}`);
        const keyDisplay = env.api_key
          ? env.api_key.slice(0, 8) + "..."
          : chalk.dim("(not set)");
        console.log(`API Key: ${keyDisplay}`);
      } else {
        console.log(
          chalk.yellow("Environment config not found — using defaults."),
        );
      }
    });

  // iof env add <name>
  envCmd
    .command("add <name>")
    .description("Add a custom environment")
    .requiredOption("--url <url>", "API base URL")
    .option("--api-key <key>", "API key for this environment", "")
    .action((name: string, opts: { url: string; apiKey: string }) => {
      assertEnvName(name);
      assertValidUrl(opts.url);

      const config = loadConfig();

      if (config.environments[name]) {
        console.error(
          chalk.red(
            `Environment "${name}" already exists. Use "iof env remove ${name}" first.`,
          ),
        );
        process.exit(1);
      }

      config.environments[name] = {
        url: opts.url,
        api_key: opts.apiKey ?? "",
      };
      saveConfig(config);

      console.log(
        `${chalk.green("✓")} Environment "${chalk.bold(name)}" added.`,
      );
      console.log(`  URL: ${opts.url}`);
      console.log(`Run ${chalk.bold(`iof env use ${name}`)} to switch to it.`);
    });

  // iof env remove <name>
  envCmd
    .command("remove <name>")
    .description("Remove a custom environment")
    .action((name: string) => {
      assertEnvName(name);

      if (BUILT_IN_ENVS.has(name)) {
        console.error(
          chalk.red(`Cannot remove built-in environment "${name}".`),
        );
        process.exit(1);
      }

      const config = loadConfig();

      if (!config.environments[name]) {
        console.error(chalk.red(`Environment "${name}" not found.`));
        process.exit(1);
      }

      if (config.environment === name) {
        console.error(
          chalk.red(
            `Cannot remove the active environment. Switch first with "iof env use sandbox".`,
          ),
        );
        process.exit(1);
      }

      delete config.environments[name];
      saveConfig(config);

      console.log(
        `${chalk.green("✓")} Environment "${chalk.bold(name)}" removed.`,
      );
    });
}
