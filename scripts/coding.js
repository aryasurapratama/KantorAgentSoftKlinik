import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspace = path.join(root, 'Kantor Agent.code-workspace');
const defaultRouter = 'http://127.0.0.1:20128';

export function parseModelsPayload(payload) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.data)) return [];
  return payload.data
    .map((model) => (model && typeof model.id === 'string' ? model.id.trim() : ''))
    .filter(Boolean);
}

export function codexConfigPath(env = process.env, home = os.homedir()) {
  const codexHome = env.CODEX_HOME || path.join(home, '.codex');
  return path.join(codexHome, 'config.toml');
}

export function readCodexConfigStatus(configPath = codexConfigPath()) {
  try {
    const source = fs.readFileSync(configPath, 'utf8');
    let section = '';
    const selected = {};
    let hasIncompatibleAgentsSetting = false;
    for (const line of source.split(/\r?\n/)) {
      const table = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
      if (table) { section = table[1]; continue; }
      const setting = line.match(/^\s*(model_provider|base_url|wire_api)\s*=\s*(["'])([^"']*)\2\s*(?:#.*)?$/);
      if (section === 'agents' && /^\s*default_subagent_model\s*=\s*"/.test(line)) hasIncompatibleAgentsSetting = true;
      if (!setting) continue;
      if (!section && setting[1] === 'model_provider') selected.provider = setting[3];
      if (section === 'model_providers.9router') selected[setting[1]] = setting[3];
    }
    return {
      exists: true,
      // Expose only a boolean. Never print config values, headers, or secrets.
      hasRouterProvider: selected.provider === '9router'
        && /^http:\/\/(?:127\.0\.0\.1|localhost):20128\/v1\/?$/.test(selected.base_url || '')
        && (!selected.wire_api || selected.wire_api === 'responses'),
      hasIncompatibleAgentsSetting,
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false, hasRouterProvider: false, hasIncompatibleAgentsSetting: false };
    return { exists: false, hasRouterProvider: false, hasIncompatibleAgentsSetting: false, unreadable: true };
  }
}

export function resolveCodeCommand(env = process.env, platform = process.platform) {
  if (env.CODE_CMD) return env.CODE_CMD;
  if (platform !== 'win32') return 'code';
  const localAppData = env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const programFiles = env.PROGRAMFILES || 'C:\\Program Files';
  const candidates = [
    path.join(localAppData, 'Programs', 'Microsoft VS Code', 'Code.exe'),
    path.join(programFiles, 'Microsoft VS Code', 'Code.exe'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function localRouterBase(baseUrl) {
  try {
    const url = new URL(baseUrl);
    const host = url.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '::1'].includes(host)) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    const pathname = url.pathname.replace(/\/+$/, '');
    if (pathname && pathname !== '/v1') return null;
    return `${url.origin}${pathname}`;
  } catch {
    return null;
  }
}

export async function checkRouter(baseUrl, fetchModels = fetch) {
  const localBase = localRouterBase(baseUrl);
  if (!localBase) return { ok: false, status: 0, models: [], endpoint: '', error: '9Router harus memakai alamat loopback HTTP(S) dengan path /v1.' };
  const endpoint = `${localBase.endsWith('/v1') ? localBase : `${localBase}/v1`}/models`;
  try {
    const response = await fetchModels(endpoint, { signal: AbortSignal.timeout(2500) });
    let payload = null;
    try { payload = await response.json(); } catch { /* keep the status useful for a proxy error */ }
    const models = parseModelsPayload(payload);
    return { ok: response.ok && models.length > 0, status: response.status, models, endpoint };
  } catch (error) {
    return { ok: false, status: 0, models: [], endpoint, error: error?.message || 'connection failed' };
  }
}

async function launchCode(command) {
  // Execute Code.exe directly: paths never pass through shell interpolation.
  await new Promise((resolve, reject) => {
    const child = spawn(command, [workspace], { cwd: root, detached: true, windowsHide: true, stdio: 'ignore' });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const checkOnly = argv.includes('--check');
  const strict = argv.includes('--strict');
  const routerArgIndex = argv.indexOf('--router');
  const router = routerArgIndex >= 0 && argv[routerArgIndex + 1]
    ? argv[routerArgIndex + 1]
    : (env.NINE_ROUTER_URL || defaultRouter);
  const result = await checkRouter(router);
  const config = readCodexConfigStatus(codexConfigPath(env));

  if (result.ok) {
    const models = result.models.length ? result.models.join(', ') : 'no model IDs returned';
    console.log(`9Router ready: ${result.endpoint} (${models})`);
  } else {
    const detail = result.status ? `HTTP ${result.status}` : result.error;
    console.error(`9Router unavailable: ${result.endpoint} (${detail}).`);
  }
  if (config.exists) console.log(`Codex user config found: ${config.hasRouterProvider ? '9Router Responses routing detected' : 'routing not verified; review Codex settings'}.`);
  else console.log('Codex user config not found. Configure Codex at user level if needed.');
  if (config.hasIncompatibleAgentsSetting) console.error('Codex CLI may reject the user config schema (agents.default_subagent_model). Upgrade or review that setting; no config changes made.');
  if (config.unreadable) console.error('Codex user config could not be read; no changes made.');

  if (checkOnly) return result.ok ? 0 : 1;
  if (!result.ok && strict) return 1;
  const command = resolveCodeCommand(env);
  try {
    await launchCode(command);
    console.log(`VS Code workspace opened: ${workspace}`);
    return 0;
  } catch (error) {
    console.error(`VS Code could not be opened (${error.message}). Run code manually for ${workspace}.`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then((code) => { process.exitCode = code; }).catch(() => {
    console.error('Coding launcher failed. Check the local router URL and VS Code installation.');
    process.exitCode = 1;
  });
}
