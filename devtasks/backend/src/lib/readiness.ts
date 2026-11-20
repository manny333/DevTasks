export type ReadinessState = 'READY' | 'NEEDS_CONTEXT' | 'BLOCKED' | 'NOT_APPLICABLE';

export interface ReadyConfig {
  requireContext: boolean;
  requireAcceptanceCriteria: boolean;
  requireNoBlockers: boolean;
  requireDocument: boolean;
}

export const DEFAULT_READY_CONFIG: ReadyConfig = {
  requireContext: true,
  requireAcceptanceCriteria: true,
  requireNoBlockers: true,
  requireDocument: false,
};

export type ReadinessCode = 'CONTEXT' | 'ACCEPTANCE' | 'BLOCKERS' | 'DOCUMENT';

export interface ReadinessCheck {
  code: ReadinessCode;
  passed: boolean;
  required: boolean;
}

export interface Readiness {
  state: ReadinessState;
  pickable: boolean;
  checks: ReadinessCheck[];
  blockedBy: string[];
}

export interface ReadinessTask {
  status: string;
  archived?: boolean;
  description?: string | null;
  context?: string | null;
  acceptanceCriteria?: string | null;
  assignees?: { userId?: string }[];
  documents?: { documentId?: string }[];
  blockedBy?: { dependsOn?: { title?: string; status?: string } }[];
}

/** Computes readiness dynamically; it is intentionally not stored on the task. */
export function computeReadiness(task: ReadinessTask, config: ReadyConfig = DEFAULT_READY_CONFIG): Readiness {
  const blockers = (task.blockedBy ?? [])
    .map((entry) => entry.dependsOn)
    .filter((dependency): dependency is NonNullable<typeof dependency> => Boolean(dependency));
  const unresolved = blockers.filter((dependency) => dependency.status !== 'DONE');
  const blockedNames = unresolved
    .map((dependency) => dependency.title)
    .filter((title): title is string => Boolean(title));

  const checks: ReadinessCheck[] = [
    {
      code: 'CONTEXT',
      passed: Boolean(task.context?.trim() || task.description?.trim()),
      required: config.requireContext,
    },
    {
      code: 'ACCEPTANCE',
      passed: Boolean(task.acceptanceCriteria?.trim()),
      required: config.requireAcceptanceCriteria,
    },
    {
      code: 'BLOCKERS',
      passed: unresolved.length === 0,
      required: config.requireNoBlockers,
    },
    {
      code: 'DOCUMENT',
      passed: (task.documents ?? []).length > 0,
      required: config.requireDocument,
    },
  ];

  if (task.archived || task.status !== 'TODO') {
    return { state: 'NOT_APPLICABLE', pickable: false, checks, blockedBy: blockedNames };
  }

  const missingRequired = checks.some((check) => check.required && !check.passed);
  const state: ReadinessState = unresolved.length > 0 && config.requireNoBlockers
    ? 'BLOCKED'
    : missingRequired
      ? 'NEEDS_CONTEXT'
      : 'READY';

  const pickable = state === 'READY' && (task.assignees ?? []).length === 0;

  return { state, pickable, checks, blockedBy: blockedNames };
}
