#!/usr/bin/env node
/**
 * Contract drift check.
 *
 * Compares the enum values used by:
 *   1. Prisma schema   (backend/prisma/schema.prisma)
 *   2. Frontend types  (frontend/src/types/index.ts)
 *   3. Shared contract (shared/api-types.ts)
 *
 * Fails when any of them diverges, so a rename on one side cannot silently
 * break the other.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(root, 'backend', 'prisma', 'schema.prisma');
const frontendTypesPath = path.join(root, 'frontend', 'src', 'types', 'index.ts');
const sharedTypesPath = path.join(root, 'shared', 'api-types.ts');

const ENUMS = ['TaskStatus', 'ProjectRole', 'AccessType', 'NotificationType', 'ActivityAction'];

function readEnumsFromSchema(source) {
  const enums = {};
  const enumRe = /enum\s+(\w+)\s*\{([\s\S]*?)\}/g;
  for (const match of source.matchAll(enumRe)) {
    enums[match[1]] = match[2]
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter(Boolean)
      .map((line) => line.split(/\s+/)[0]);
  }
  return enums;
}

function readTypeUnions(source) {
  const unions = {};
  const typeRe = /export\s+type\s+(\w+)\s*=\s*([\s\S]*?);/g;
  for (const match of source.matchAll(typeRe)) {
    const name = match[1];
    if (!ENUMS.includes(name)) continue;
    unions[name] = [...match[2].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  }
  return unions;
}

function compare(label, expected, actual) {
  const problems = [];
  for (const name of ENUMS) {
    const a = new Set(expected[name] ?? []);
    const b = new Set(actual[name] ?? []);
    if (a.size === 0) {
      problems.push(`${name}: missing in ${label}`);
      continue;
    }
    for (const value of a) {
      if (!b.has(value)) problems.push(`${name}: "${value}" missing in ${label}`);
    }
    for (const value of b) {
      if (!a.has(value)) problems.push(`${name}: unexpected "${value}" in ${label}`);
    }
  }
  return problems;
}

const schemaEnums = readEnumsFromSchema(fs.readFileSync(schemaPath, 'utf8'));
const frontendEnums = readTypeUnions(fs.readFileSync(frontendTypesPath, 'utf8'));
const sharedEnums = readTypeUnions(fs.readFileSync(sharedTypesPath, 'utf8'));

const problems = [
  ...compare('shared/api-types.ts', schemaEnums, sharedEnums),
  ...compare('frontend/src/types/index.ts', schemaEnums, frontendEnums),
];

if (problems.length > 0) {
  console.error('Contract drift detected:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`Contract OK: ${ENUMS.length} enums in sync (Prisma schema = shared = frontend).`);
