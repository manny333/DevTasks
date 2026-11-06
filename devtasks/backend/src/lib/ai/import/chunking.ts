import { ImportLimitError, type ImportLimits } from './limits';

export interface MarkdownChunk {
  index: number;
  text: string;
  headingTrail: string[];
  estimatedTasks: number;
}

export interface ImportPlan {
  chunks: MarkdownChunk[];
  totalChars: number;
  estimatedTasks: number;
  estimatedTokens: number;
  requiresConfirmation: boolean;
  warnings: string[];
}

interface Block {
  text: string;
  headingTrail: string[];
}

function countTasks(text: string): number {
  let inFence = false;
  let count = 0;
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (/^\s*(?:[-*+]|\d+[.)])\s+\S/.test(line)) count++;
  }
  return count;
}

/** Rough task estimate used before spending any AI tokens. */
export function estimateTasks(markdown: string): number {
  return Math.max(1, countTasks(markdown));
}

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  const trail: string[] = [];
  let buffer: string[] = [];
  let inFence = false;

  const flush = (): void => {
    const text = buffer.join('\n').trim();
    if (text.length > 0) blocks.push({ text, headingTrail: [...trail] });
    buffer = [];
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;

    const heading = !inFence ? line.match(/^(#{1,6})\s+(.+?)\s*$/) : null;
    if (heading) {
      flush();
      const level = heading[1].length;
      trail.splice(level - 1);
      trail[level - 1] = heading[2];
      buffer.push(line);
      continue;
    }

    buffer.push(line);
  }

  flush();
  return blocks;
}

/** Splits an oversized block at line boundaries, keeping every piece <= maxChars. */
function splitBlock(block: Block, maxChars: number): Block[] {
  if (block.text.length <= maxChars) return [block];

  const lines = block.text.split('\n');
  const pieces: string[] = [];
  let current: string[] = [];

  const flush = (): void => {
    const text = current.join('\n').trim();
    if (text.length > 0) pieces.push(text);
    current = [];
  };

  for (const line of lines) {
    if (current.length > 0 && current.join('\n').length + line.length + 1 > maxChars) {
      flush();
    }
    if (line.length > maxChars) {
      flush();
      for (let offset = 0; offset < line.length; offset += maxChars) {
        pieces.push(line.slice(offset, offset + maxChars));
      }
      continue;
    }
    current.push(line);
  }
  flush();

  return pieces.map((text) => ({ text, headingTrail: block.headingTrail }));
}

function buildChunks(markdown: string, maxChars: number): MarkdownChunk[] {
  if (markdown.length <= maxChars) {
    return [{ index: 0, text: markdown, headingTrail: [], estimatedTasks: estimateTasks(markdown) }];
  }

  const blocks = parseBlocks(markdown);
  const pieces = blocks.flatMap((block) => splitBlock(block, maxChars));
  const chunks: Array<{ text: string; headingTrail: string[] }> = [];
  let current = '';
  let currentTrail: string[] = [];

  const flush = (): void => {
    const text = current.trim();
    if (text.length > 0) chunks.push({ text, headingTrail: [...currentTrail] });
    current = '';
    currentTrail = [];
  };

  for (const piece of pieces) {
    const separator = current.length > 0 ? '\n\n' : '';
    if (current.length > 0 && current.length + separator.length + piece.text.length > maxChars) {
      flush();
    }
    if (current.length === 0) currentTrail = piece.headingTrail;
    current += `${separator}${piece.text}`;
  }
  flush();

  return chunks.map((chunk, index) => ({
    index,
    text: chunk.text,
    headingTrail: chunk.headingTrail,
    estimatedTasks: estimateTasks(chunk.text),
  }));
}

/** Splits a chunk in half for a truncation retry. */
export function splitChunkInHalf(text: string): [string, string] | null {
  if (text.length < 500) return null;
  const middle = Math.floor(text.length / 2);
  const before = text.lastIndexOf('\n\n', middle);
  const after = text.indexOf('\n\n', middle);
  let cut = before > 200 ? before : after;
  if (cut < 200) cut = middle;
  const left = text.slice(0, cut).trim();
  const right = text.slice(cut).trim();
  if (left.length < 50 || right.length < 50) return null;
  return [left, right];
}

/**
 * Builds a deterministic, token-free plan. It rejects documents that cannot be
 * processed within the configured limits before any provider call is made.
 */
export function planImport(markdown: string, limits: ImportLimits): ImportPlan {
  const source = markdown.trim();
  if (source.length === 0) {
    throw new ImportLimitError(400, 'IMPORT_EMPTY', 'Markdown is required.');
  }
  if (source.length > limits.maxChars) {
    throw new ImportLimitError(
      413,
      'IMPORT_TOO_LARGE',
      `The document has ${source.length.toLocaleString()} characters; the limit is ${limits.maxChars.toLocaleString()}. Split it or raise AI_IMPORT_MAX_CHARS.`
    );
  }

  const chunks = buildChunks(source, limits.chunkChars);
  if (chunks.length > limits.maxChunks) {
    throw new ImportLimitError(
      413,
      'IMPORT_TOO_MANY_CHUNKS',
      `The document needs ${chunks.length} blocks; the limit is ${limits.maxChunks}. Split it or raise AI_IMPORT_MAX_CHUNKS.`
    );
  }

  const estimatedTasks = chunks.reduce((sum, chunk) => sum + chunk.estimatedTasks, 0);
  if (estimatedTasks > limits.maxTasks) {
    throw new ImportLimitError(
      413,
      'IMPORT_TOO_MANY_TASKS',
      `The document contains roughly ${estimatedTasks} tasks; the limit is ${limits.maxTasks}. Reduce the scope or raise AI_IMPORT_MAX_TASKS.`
    );
  }

  const estimatedTokens = chunks.reduce(
    (sum, chunk) => sum + Math.ceil(chunk.text.length / 4) + 400 + chunk.estimatedTasks * 120,
    0
  );

  const warnings: string[] = [];
  if (chunks.length > 1) warnings.push(`The document will be processed in ${chunks.length} blocks.`);
  if (estimatedTasks > limits.maxTasksPerChunk) {
    warnings.push(`About ${estimatedTasks} tasks will be generated; review the preview before importing.`);
  }

  return {
    chunks,
    totalChars: source.length,
    estimatedTasks,
    estimatedTokens,
    requiresConfirmation: chunks.length > 1 || estimatedTasks > 25,
    warnings,
  };
}
