import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import YAML from 'yaml';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig(path = join(ROOT, 'config', 'display.yaml')) {
  return YAML.parse(readFileSync(path, 'utf8'));
}

/** Read a dotted path from the config and stop with a clear message when it is unset. */
export function need(config, path) {
  const value = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), config);
  if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) {
    throw new Error(`config/display.yaml: ${path} is not set (see docs/setup.md)`);
  }
  return value;
}

/** Load KEY=VALUE lines from .env into process.env without overriding what is already set. */
export function loadEnv(path = join(ROOT, '.env')) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

export function secret(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (a GitHub secret, or .env locally; see docs/setup.md)`);
  return value;
}
