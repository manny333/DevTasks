#!/usr/bin/env node
/**
 * Authorization coverage test.
 *
 * Scans every Express route handler in `src/routes` and fails when a handler
 * that touches project data has no access check at all. This is the regression
 * test for the "any authenticated user can read any project" class of bug:
 * it does not need a database, so it runs in CI on every push.
 *
 * Routes that only expose the caller's own data (their notifications, their
 * API keys, their search results) are exempt by design.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routesDir = path.join(root, 'src', 'routes');

/** Files whose handlers are scoped to the authenticated user by construction. */
const EXEMPT_FILES = new Set(['auth.ts', 'notifications.ts', 'userSettings.ts', 'search.ts', 'me.ts']);

/** Individual handlers that legitimately need no project-level guard. */
const EXEMPT_ROUTES = new Set([
  'ai.ts GET /providers',   // lists the caller's own provider configuration
  'projects.ts GET /',      // list is filtered by the caller's memberships
  'projects.ts POST /',     // creates a new project owned by the caller
]);

/** Any of these proves the handler resolved and checked access. */
const GUARD_PATTERNS = [
  /requireTaskAccess\s*\(/,
  /requireSectionAccess\s*\(/,
  /requireProjectAccess\s*\(/,
  /ensureProjectAccess\s*\(/,
  /ensureSectionAccess\s*\(/,
  /requireSectionManager\s*\(/,
  /canManageMembers\s*\(/,
  /getProjectScope\s*\(/,
  /getProjectAccess\s*\(/,
  /getSectionAccess\s*\(/,
  /ownerId\s*!==\s*req\.userId/,
];

const HANDLER_RE = /router\.(get|post|patch|put|delete)\(\s*'([^']+)'/g;

const files = fs.readdirSync(routesDir).filter((file) => file.endsWith('.ts')).sort();
let checked = 0;
let failures = 0;

for (const file of files) {
  if (EXEMPT_FILES.has(file)) continue;

  const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
  const handlers = [...source.matchAll(HANDLER_RE)];

  handlers.forEach((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < handlers.length ? (handlers[index + 1].index ?? source.length) : source.length;
    const body = source.slice(start, end);
    const method = match[1].toUpperCase();
    const route = match[2];
    const label = `${file} ${method} ${route}`;

    if (EXEMPT_ROUTES.has(label)) return;

    checked += 1;
    if (!GUARD_PATTERNS.some((pattern) => pattern.test(body))) {
      failures += 1;
      console.error(`x missing authorization guard: ${label}`);
    }
  });
}

console.log(`\n${checked} handlers checked, ${failures} without an access guard.`);
if (failures > 0) process.exit(1);
