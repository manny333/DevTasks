import { buildChunkUserPrompt, buildSystemPrompt } from '../prompts';
import { AIResponseError, buildPreviewFromParsed, parseAIResponse } from '../preview';
import type { AIProvider, AIImportPreview, ChatMessage, ChatOptions } from '../types';
import { splitChunkInHalf, type ImportPlan, type MarkdownChunk } from './chunking';
import { ImportLimitError, type ImportLimits } from './limits';
import { mergePreviews } from './merge';

export interface ImportContext {
  sections?: { id: string; name: string; color: string }[];
  tags?: { id: string; name: string; color: string }[];
  members?: { id: string; name: string; email: string }[];
}

export interface PipelineOptions {
  plan: ImportPlan;
  ai: AIProvider;
  limits: ImportLimits;
  model?: string;
  startDate?: string;
  projectName?: string;
  signal?: AbortSignal;
  context?: ImportContext;
  stream: boolean;
  onToken?: (token: string) => void;
  onProgress?: (progress: { chunk: number; total: number; retry?: boolean }) => void;
}

export interface PipelineResult {
  preview: AIImportPreview;
  usage: { promptTokens: number; completionTokens: number };
  chunksProcessed: number;
}

interface ChunkResult {
  previews: AIImportPreview[];
  usage: { promptTokens: number; completionTokens: number };
}

function isTruncated(reason: string | undefined): boolean {
  return Boolean(reason && ['length', 'max_tokens'].includes(reason.toLowerCase()));
}

function abortError(): Error {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
}

async function callModel(
  ai: AIProvider,
  messages: ChatMessage[],
  options: ChatOptions,
  stream: boolean,
  onToken?: (token: string) => void
): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number }; finishReason?: string }> {
  if (!stream) {
    const response = await ai.chat(messages, options);
    return { content: response.content, usage: response.usage, finishReason: response.finishReason };
  }

  let content = '';
  let usage: { promptTokens: number; completionTokens: number } | undefined;
  let finishReason: string | undefined;

  for await (const token of ai.chatStream(messages, {
    ...options,
    onUsage: (reported) => { usage = reported; },
    onFinish: (reason) => { finishReason = reason; },
  })) {
    content += token;
    onToken?.(token);
  }

  return { content, usage, finishReason };
}

async function processChunk(
  chunk: MarkdownChunk,
  depth: number,
  options: PipelineOptions,
  knownSections: string[],
  projectName?: string
): Promise<ChunkResult> {
  if (options.signal?.aborted) throw abortError();

  const systemPrompt = buildSystemPrompt(options.context, {
    startDate: options.startDate,
    maxTasks: options.limits.maxTasksPerChunk,
    maxSections: options.limits.maxSectionsPerChunk,
    knownSections,
    chunk: {
      index: chunk.index + 1,
      total: options.plan.chunks.length,
      ...(chunk.headingTrail.length > 0 ? { heading: chunk.headingTrail.join(' > ') } : {}),
    },
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildChunkUserPrompt(chunk.text, projectName, {
      index: chunk.index + 1,
      total: options.plan.chunks.length,
      ...(chunk.headingTrail.length > 0 ? { heading: chunk.headingTrail.join(' > ') } : {}),
    }) },
  ];

  const result = await callModel(
    options.ai,
    messages,
    {
      model: options.model,
      temperature: 0.2,
      maxTokens: options.limits.maxOutputTokens,
      responseFormat: 'json_object',
      effort: 'low',
      ...(options.signal ? { signal: options.signal } : {}),
    },
    options.stream,
    options.onToken
  );

  const usage = result.usage ?? { promptTokens: 0, completionTokens: 0 };

  if (isTruncated(result.finishReason)) {
    const halves = splitChunkInHalf(chunk.text);
    if (!halves || depth >= 2) {
      throw new ImportLimitError(
        502,
        'IMPORT_TRUNCATED',
        'The AI response was truncated even after splitting the block. Reduce the document or raise AI_IMPORT_MAX_TOKENS.'
      );
    }

    options.onProgress?.({ chunk: chunk.index + 1, total: options.plan.chunks.length, retry: true });
    const [left, right] = halves;
    const leftResult = await processChunk(
      { ...chunk, text: left, estimatedTasks: chunk.estimatedTasks },
      depth + 1,
      options,
      knownSections,
      projectName
    );
    const rightResult = await processChunk(
      { ...chunk, text: right, estimatedTasks: chunk.estimatedTasks },
      depth + 1,
      options,
      knownSections,
      projectName
    );

    return {
      previews: [...leftResult.previews, ...rightResult.previews],
      usage: {
        promptTokens: usage.promptTokens + leftResult.usage.promptTokens + rightResult.usage.promptTokens,
        completionTokens: usage.completionTokens + leftResult.usage.completionTokens + rightResult.usage.completionTokens,
      },
    };
  }

  const parsed = parseAIResponse(result.content);
  const { preview, projectName: extractedName } = buildPreviewFromParsed(parsed, options.context?.sections ?? []);
  return {
    previews: [{
      sections: preview,
      ...(extractedName ? { projectName: extractedName } : {}),
    }],
    usage,
  };
}

/**
 * Processes a plan sequentially so section names extracted in one block are
 * available to the next one. Truncated blocks are split and retried, never
 * silently dropped.
 */
export async function runImportPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const previews: AIImportPreview[] = [];
  const usage = { promptTokens: 0, completionTokens: 0 };
  const knownSections = new Set((options.context?.sections ?? []).map((section) => section.name));
  let projectName = options.projectName;
  let chunksProcessed = 0;

  for (const chunk of options.plan.chunks) {
    if (options.signal?.aborted) throw abortError();

    options.onProgress?.({ chunk: chunk.index + 1, total: options.plan.chunks.length });
    const result = await processChunk(chunk, 0, options, [...knownSections], projectName);
    chunksProcessed++;

    previews.push(...result.previews);
    usage.promptTokens += result.usage.promptTokens;
    usage.completionTokens += result.usage.completionTokens;

    for (const preview of result.previews) {
      if (!projectName && preview.projectName) projectName = preview.projectName;
      for (const section of preview.sections) knownSections.add(section.name);
    }
  }

  const merged = mergePreviews(previews, options.context?.sections ?? []);
  const taskCount = merged.sections.reduce((sum, section) => sum + section.tasks.length, 0);
  if (taskCount > options.limits.maxTasks) {
    throw new ImportLimitError(
      413,
      'IMPORT_TOO_MANY_TASKS',
      `The AI generated ${taskCount} tasks; the limit is ${options.limits.maxTasks}. Reduce the document or raise AI_IMPORT_MAX_TASKS.`
    );
  }

  return {
    preview: {
      ...merged,
      ...(projectName && !merged.projectName ? { projectName } : {}),
      usage,
    },
    usage,
    chunksProcessed,
  };
}

export function toPublicPlan(plan: ImportPlan, limits: ImportLimits): Record<string, unknown> {
  return {
    chunks: plan.chunks.length,
    totalChars: plan.totalChars,
    estimatedTasks: plan.estimatedTasks,
    estimatedTokens: plan.estimatedTokens,
    requiresConfirmation: plan.requiresConfirmation,
    warnings: plan.warnings,
    maxTasks: limits.maxTasks,
    maxChunks: limits.maxChunks,
    chunkChars: limits.chunkChars,
  };
}
