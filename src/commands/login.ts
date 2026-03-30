/**
 * IOF DevTools - Login / auth commands
 *
 * Commands:
 *   iof login [--api-key <key>] [--oauth]
 *   iof logout
 *   iof whoami
 */

import type { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import {
  loadConfig,
  saveConfig,
  requireAuth,
  getActiveEnvironment,
} from "../config.js";
import { callApi } from "../http.js";

interface WhoamiResponse {
  id: string;
  name: string;
  email: string;
  organization: string;
  role: string;
  environment: string;
  created_at: string;
}

export function registerLoginCommands(program: Command): void {
  program
    .command("login")
    .description("Login to IOF Platform")
    .option("--api-key <key>", "Authenticate with an API key directly")
    .option("--oauth", "Authenticate via OAuth browser flow")
    .action(async (opts: { apiKey?: string; oauth?: boolean }) => {
      const config = loadConfig();

      if (opts.apiKey) {
        await loginWithApiKey(opts.apiKey);
        return;
      }

      if (opts.oauth) {
        console.log(
          chalk.yellow(
            "OAuth browser flow is not yet supported in this environment.",
          ),
        );
        console.log(
          `Please visit ${chalk.cyan("https://app.islamicopenfinance.com/api-keys")} to generate an API key, then run:`,
        );
        console.log(chalk.bold("  iof login --api-key <your-key>"));
        return;
      }

      // Interactive prompt via inquirer
      const { default: inquirer } = await import("inquirer");
      const answers = await inquirer.prompt<{ apiKey: string }>([
        {
          type: "password",
          name: "apiKey",
          message: "Enter your IOF API key:",
          validate: (v: string) =>
            v.length > 0 ? true : "API key cannot be empty",
        },
      ]);

      await loginWithApiKey(answers.apiKey);

      async function loginWithApiKey(key: string): Promise<void> {
        const spinner = ora("Verifying API key...").start();

        try {
          // Temporarily inject the key so callApi can use it
          config.api_key = key;
          const env = getActiveEnvironment(config);
          env.api_key = key;

          const response = await callApi<WhoamiResponse>(
            config,
            "GET",
            "/api/v1/auth/me",
          );

          // Persist to config
          config.api_key = key;
          const activeEnv = config.environments[config.environment];
          if (activeEnv) {
            activeEnv.api_key = key;
          }
          saveConfig(config);

          spinner.succeed(
            `Logged in as ${chalk.bold(response.data.email)} (${chalk.cyan(response.data.organization)})`,
          );
        } catch {
          spinner.fail(
            "Authentication failed. Check your API key and try again.",
          );
          process.exit(1);
        }
      }
    });

  program
    .command("logout")
    .description("Logout from current session")
    .action(() => {
      const config = loadConfig();
      config.api_key = "";
      const activeEnv = config.environments[config.environment];
      if (activeEnv) {
        activeEnv.api_key = "";
      }
      saveConfig(config);
      console.log(chalk.green("✓") + " Logged out successfully.");
    });

  program
    .command("whoami")
    .description("Show current user and organization")
    .action(async () => {
      const config = loadConfig();
      requireAuth(config);

      const spinner = ora("Fetching user info...").start();

      try {
        const response = await callApi<WhoamiResponse>(
          config,
          "GET",
          "/api/v1/auth/me",
        );
        spinner.stop();

        const u = response.data;
        console.log(`${chalk.bold("User:")}         ${u.email}`);
        console.log(`${chalk.bold("Name:")}         ${u.name}`);
        console.log(`${chalk.bold("Organization:")} ${u.organization}`);
        console.log(`${chalk.bold("Role:")}         ${u.role}`);
        console.log(`${chalk.bold("Environment:")}  ${config.environment}`);
      } catch (err) {
        spinner.fail("Failed to fetch user info.");
        const apiErr = err as { message?: string };
        console.error(chalk.red(apiErr.message ?? String(err)));
        process.exit(1);
      }
    });
}
