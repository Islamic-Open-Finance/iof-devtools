/**
 * IOF DevTools - Authenticated HTTP client
 *
 * Thin wrapper around axios that:
 *  - Injects the active environment base URL and API key header
 *  - Enforces the configured timeout
 *  - Retries transient failures (5xx, ECONNRESET) up to config.defaults.retry times
 *  - Returns typed ApiResponse<T> or throws IofApiError on non-2xx
 */

import axios, {
  AxiosInstance,
  AxiosResponse,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";
import type { IofConfig } from "./config.js";
import { getActiveEnvironment } from "./config.js";

export interface ApiResponse<T = unknown> {
  data: T;
  status: number;
  headers: Record<string, string>;
  requestId: string;
}

export interface IofApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
  status: number;
}

export function buildClient(config: IofConfig): AxiosInstance {
  const env = getActiveEnvironment(config);

  const client = axios.create({
    baseURL: env.url,
    timeout: config.defaults.timeout,
    headers: {
      Authorization: `Bearer ${env.api_key}`,
      "Content-Type": "application/json",
      "User-Agent": `iof-devtools/1.0.0 node/${process.version}`,
    },
  });

  // Request interceptor: attach X-IOF-Environment header
  client.interceptors.request.use((req: InternalAxiosRequestConfig) => {
    req.headers["X-IOF-Environment"] = config.environment;
    return req;
  });

  return client;
}

export async function callApi<T = unknown>(
  config: IofConfig,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  urlPath: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
  debug = false,
): Promise<ApiResponse<T>> {
  const client = buildClient(config);
  const maxRetries = config.defaults.retry;

  assert(maxRetries >= 0, `retry must be non-negative, got ${maxRetries}`);
  assert(maxRetries <= 10, `retry must be <= 10, got ${maxRetries}`);
  assert(urlPath.length > 0, "urlPath must not be empty");
  assert(urlPath.startsWith("/"), `urlPath must start with /, got ${urlPath}`);

  let lastError: IofApiError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    assert(attempt >= 0, "attempt must be non-negative");
    assert(attempt <= maxRetries, "attempt must not exceed maxRetries");

    try {
      if (debug && attempt > 0) {
        process.stderr.write(
          `[debug] retry attempt ${attempt}/${maxRetries}\n`,
        );
      }

      const response: AxiosResponse<T> = await client.request<T>({
        method,
        url: urlPath,
        data: body,
        headers: extraHeaders ?? {},
      });

      if (debug) {
        process.stderr.write(
          `[debug] ${method} ${urlPath} → ${response.status}\n`,
        );
      }

      return {
        data: response.data,
        status: response.status,
        headers: response.headers as Record<string, string>,
        requestId: (response.headers["x-request-id"] as string) ?? "",
      };
    } catch (err) {
      const axiosErr = err as AxiosError<{ error?: IofApiError }>;

      if (axiosErr.response) {
        const status = axiosErr.response.status;
        const body = axiosErr.response.data;
        lastError = {
          code: body?.error?.code ?? "API_ERROR",
          message: body?.error?.message ?? axiosErr.message,
          details: body?.error?.details,
          requestId:
            (axiosErr.response.headers["x-request-id"] as string) ?? "",
          status,
        };

        // Do not retry client errors (4xx)
        if (status >= 400 && status < 500) {
          break;
        }
      } else {
        lastError = {
          code: "NETWORK_ERROR",
          message: axiosErr.message,
          requestId: "",
          status: 0,
        };
      }

      if (attempt < maxRetries) {
        const delayMs = Math.min(200 * Math.pow(2, attempt), 5000);
        await sleep(delayMs);
      }
    }
  }

  throw (
    lastError ?? {
      code: "UNKNOWN_ERROR",
      message: "Unknown error",
      requestId: "",
      status: 0,
    }
  );
}

function sleep(ms: number): Promise<void> {
  assert(ms >= 0, "sleep ms must be non-negative");
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}
