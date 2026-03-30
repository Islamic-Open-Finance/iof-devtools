/**
 * IOF DevTools - Configuration management
 *
 * Reads/writes ~/.iof/config.json as the single source of truth for
 * credentials, active environment, and per-environment settings.
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface EnvironmentConfig {
  url: string;
  api_key: string;
}

export interface IofConfig {
  environment: string;
  api_key: string;
  environments: Record<string, EnvironmentConfig>;
  defaults: {
    format: string;
    timeout: number;
    retry: number;
  };
}

const CONFIG_DIR = path.join(os.homedir(), ".iof");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: IofConfig = {
  environment: "sandbox",
  api_key: "",
  environments: {
    production: {
      url: "https://api.islamicopenfinance.com",
      api_key: "",
    },
    sandbox: {
      url: "https://api.sandbox.islamicopenfinance.com",
      api_key: "",
    },
  },
  defaults: {
    format: "table",
    timeout: 30000,
    retry: 3,
  },
};

export function loadConfig(): IofConfig {
  // Environment variables take precedence over file config
  if (!fs.existsSync(CONFIG_PATH)) {
    return applyEnvOverrides(structuredClone(DEFAULT_CONFIG));
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as IofConfig;
    return applyEnvOverrides(parsed);
  } catch {
    return applyEnvOverrides(structuredClone(DEFAULT_CONFIG));
  }
}

function applyEnvOverrides(config: IofConfig): IofConfig {
  if (process.env["IOF_API_KEY"]) {
    config.api_key = process.env["IOF_API_KEY"];
  }
  if (process.env["IOF_ENVIRONMENT"]) {
    config.environment = process.env["IOF_ENVIRONMENT"];
  }
  if (process.env["IOF_TIMEOUT"]) {
    const t = parseInt(process.env["IOF_TIMEOUT"], 10);
    if (!isNaN(t) && t > 0) {
      config.defaults.timeout = t;
    }
  }
  return config;
}

export function saveConfig(config: IofConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function getActiveEnvironment(config: IofConfig): EnvironmentConfig {
  const env = config.environments[config.environment];
  if (!env) {
    // Fall back to sandbox URL with whatever api_key we have
    return {
      url: "https://api.sandbox.islamicopenfinance.com",
      api_key: config.api_key,
    };
  }
  // Per-environment api_key wins; fall back to top-level api_key
  return {
    url: env.url,
    api_key: env.api_key || config.api_key,
  };
}

export function requireAuth(config: IofConfig): string {
  const env = getActiveEnvironment(config);
  if (!env.api_key) {
    console.error("Not authenticated. Run: iof login --api-key <your-key>");
    process.exit(1);
  }
  return env.api_key;
}

export function configGet(config: IofConfig, key: string): string | undefined {
  const flat: Record<string, string> = {
    environment: config.environment,
    api_key: config.api_key,
    format: config.defaults.format,
    timeout: String(config.defaults.timeout),
    retry: String(config.defaults.retry),
  };
  return flat[key];
}

export function configSet(config: IofConfig, key: string, value: string): void {
  switch (key) {
    case "environment":
      config.environment = value;
      break;
    case "api_key":
      config.api_key = value;
      break;
    case "format":
      config.defaults.format = value;
      break;
    case "timeout": {
      const t = parseInt(value, 10);
      if (isNaN(t) || t <= 0) {
        throw new Error(`Invalid timeout value: ${value}`);
      }
      config.defaults.timeout = t;
      break;
    }
    case "retry": {
      const r = parseInt(value, 10);
      if (isNaN(r) || r < 0) {
        throw new Error(`Invalid retry value: ${value}`);
      }
      config.defaults.retry = r;
      break;
    }
    default:
      throw new Error(`Unknown config key: ${key}`);
  }
}
