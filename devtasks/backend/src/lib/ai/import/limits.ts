export interface ImportLimits {
  /** Maximum document size accepted for one import. */
  maxChars: number;
  /** Maximum number of AI blocks for one import. */
  maxChunks: number;
  /** Maximum number of tasks in the merged preview. */
  maxTasks: number;
  /** Target size of one markdown block. */
  chunkChars: number;
  /** Output token budget for one AI call. */
  maxOutputTokens: number;
  /** Section/task limits requested from the model per block. */
  maxTasksPerChunk: number;
  maxSectionsPerChunk: number;
}

export class ImportLimitError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ImportLimitError';
  }
}

function intFromEnv(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = Number(env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.trunc(raw), min), max);
}

export function getImportLimits(env: NodeJS.ProcessEnv = process.env): ImportLimits {
  return {
    maxChars: intFromEnv(env, 'AI_IMPORT_MAX_CHARS', 120_000, 6_000, 500_000),
    maxChunks: intFromEnv(env, 'AI_IMPORT_MAX_CHUNKS', 12, 1, 30),
    maxTasks: intFromEnv(env, 'AI_IMPORT_MAX_TASKS', 150, 1, 500),
    chunkChars: intFromEnv(env, 'AI_IMPORT_CHUNK_CHARS', 6_000, 2_000, 12_000),
    maxOutputTokens: intFromEnv(env, 'AI_IMPORT_MAX_TOKENS', 7_168, 1_024, 8_192),
    maxTasksPerChunk: intFromEnv(env, 'AI_IMPORT_TASKS_PER_CHUNK', 25, 5, 50),
    maxSectionsPerChunk: intFromEnv(env, 'AI_IMPORT_SECTIONS_PER_CHUNK', 6, 1, 12),
  };
}
