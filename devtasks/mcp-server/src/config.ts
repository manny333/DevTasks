import { z } from 'zod';

const booleanFromEnv = z
  .union([z.boolean(), z.enum(['1', '0', 'true', 'false', 'yes', 'no'])])
  .transform((value) => value === true || value === '1' || value === 'true' || value === 'yes')
  .default(true);

const apiUrlSchema = z
  .string()
  .min(1, 'KANVY_API_URL is required')
  .transform((value, ctx) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('unsupported protocol');
      }
      return value.replace(/\/+$/, '');
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'KANVY_API_URL must be a valid http(s) URL, e.g. http://localhost:5001/api',
      });
      return z.NEVER;
    }
  });

export const configSchema = z
  .object({
    apiUrl: apiUrlSchema,
    token: z.string().min(1, 'KANVY_TOKEN is required'),
    allowWrites: booleanFromEnv,
    transport: z.enum(['stdio', 'http']).default('stdio'),
    httpHost: z.string().min(1).default('127.0.0.1'),
    httpPort: z.coerce.number().int().min(1).max(65535).default(3333),
    httpToken: z.string().min(1).optional(),
    requestTimeoutMs: z.coerce.number().int().min(1000).max(120000).default(15000),
  })
  .superRefine((config, ctx) => {
    if (config.transport !== 'http') return;
    const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(config.httpHost);
    if (!loopback && !config.httpToken) {
      ctx.addIssue({
        code: 'custom',
        path: ['httpToken'],
        message: 'MCP_HTTP_TOKEN is required when MCP_HTTP_HOST is not loopback',
      });
    }
  });

export type Config = z.infer<typeof configSchema>;

const FIELD_TO_ENV: Record<string, string> = {
  apiUrl: 'KANVY_API_URL',
  token: 'KANVY_TOKEN',
  allowWrites: 'KANVY_ALLOW_WRITES',
  transport: 'MCP_TRANSPORT',
  httpHost: 'MCP_HTTP_HOST',
  httpPort: 'MCP_HTTP_PORT',
  httpToken: 'MCP_HTTP_TOKEN',
  requestTimeoutMs: 'KANVY_TIMEOUT_MS',
};

/** Builds the runtime config from environment variables. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (!env.KANVY_TOKEN) {
    throw new Error('Invalid Kanvy MCP configuration: KANVY_TOKEN is required');
  }

  const parsed = configSchema.safeParse({
    apiUrl: env.KANVY_API_URL ?? 'http://localhost:5001/api',
    token: env.KANVY_TOKEN,
    allowWrites: env.KANVY_ALLOW_WRITES,
    transport: env.MCP_TRANSPORT,
    httpHost: env.MCP_HTTP_HOST,
    httpPort: env.MCP_HTTP_PORT,
    httpToken: env.MCP_HTTP_TOKEN,
    requestTimeoutMs: env.KANVY_TIMEOUT_MS,
  });

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => {
        const field = String(issue.path[0] ?? 'config');
        return `${FIELD_TO_ENV[field] ?? field}: ${issue.message}`;
      })
      .join('; ');
    throw new Error(`Invalid Kanvy MCP configuration: ${message}`);
  }

  return parsed.data;
}
