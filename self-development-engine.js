import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile as nodeExecFile } from 'node:child_process';
import { promisify } from 'node:util';

const defaultExec = promisify(nodeExecFile);
const stamp = () => new Date().toISOString();
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const STATUSES = Object.freeze(['proposed', 'validated', 'approved', 'applied', 'rolled_back', 'failed']);
const npmCheck = (args) => process.platform === 'win32'
  ? { command: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe'), args: ['/d', '/s', '/c', `npm.cmd ${args.join(' ')}`] }
  : { command: 'npm', args };
const CHECKS = Object.freeze({
  tests: npmCheck(['test']),
  // Compile source before any optional bundle-size gate. `check:build` alone
  // can pass against stale dist output.
  build: npmCheck(['run', 'build']),
  doctor: npmCheck(['run', 'doctor']),
});
const blocked = /^(?:\.env(?:\.|$)|data(?:$|[\/\\])|\.git(?:$|[\/\\])|node_modules(?:$|[\/\\])|(?:approval-policy|api-security|coding-workspace|coding-task-runner|self-development-engine|self-development-routes)\.js$|scripts[\\/]?(?:start|doctor|runtime)\.js$|.*\.(?:pem|key|p12|pfx|secret)$)/i;

function cleanText(value, max, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw fail(`${label} tidak valid.`);
  return value.trim();
}

function safeRecord(proposal) {
  return proposal ? structuredClone(proposal) : null;
}

export function createSelfDevelopmentEngine({
  projectRoot = process.cwd(),
  dataDir = path.join(projectRoot, 'data'),
  fsApi = fs,
  exec = defaultExec,
  platform = process.platform,
  now = stamp,
  maxOutput = 120_000,
  worktreeRoot = path.join(dataDir, 'self-development', 'worktrees'),
  startCoding,
} = {}) {
  const root = path.resolve(projectRoot);
  const fileName = 'self-development.json';
  let db = { schemaVersion: 1, proposals: [], audit: [] };
  let ready;
  let creating = false;

  const run = async (command, args, cwd = root, options = {}) => {
    try {
      const result = await exec(command, args, { cwd, shell: false, windowsHide: true, timeout: options.timeout || 20 * 60_000, maxBuffer: maxOutput });
      return { stdout: String(result?.stdout || ''), stderr: String(result?.stderr || ''), code: 0 };
    } catch (error) {
      return { stdout: String(error?.stdout || ''), stderr: String(error?.stderr || error?.message || ''), code: Number.isInteger(error?.code) ? error.code : 1 };
    }
  };
  const save = async () => {
    await fsApi.mkdir(dataDir, { recursive: true });
    const temp = path.join(dataDir, `.self-development-${randomUUID()}.tmp`);
    await fsApi.writeFile(temp, JSON.stringify(db, null, 2), { encoding: 'utf8', mode: 0o600 });
    await fsApi.rename(temp, path.join(dataDir, fileName));
  };
  const init = async () => {
    if (ready) return ready;
    ready = (async () => {
      try {
        const parsed = JSON.parse(await fsApi.readFile(path.join(dataDir, fileName), 'utf8'));
        if (parsed && Array.isArray(parsed.proposals) && Array.isArray(parsed.audit)) db = { schemaVersion: 1, proposals: parsed.proposals, audit: parsed.audit };
      } catch { /* First run or corrupt optional history: start a clean audit log. */ }
      await fsApi.mkdir(worktreeRoot, { recursive: true });
      return db;
    })();
    return ready;
  };
  const addAudit = (proposal, action, detail = {}) => {
    const row = { id: randomUUID(), proposalId: proposal?.id || null, action, at: now(), ...detail };
    db.audit.unshift(row); db.audit = db.audit.slice(0, 2000);
    if (proposal) { proposal.audit = proposal.audit || []; proposal.audit.push(row); proposal.updatedAt = row.at; }
    return row;
  };
  const get = id => db.proposals.find(item => item.id === id);
  const requireProposal = async id => { await init(); const proposal = get(id); if (!proposal) throw fail('Proposal perubahan tidak ditemukan.', 404); return proposal; };
  const worktreePath = id => path.join(worktreeRoot, id);
  const relativeFiles = output => String(output || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => line.replace(/^\?\?\s+/, '').replace(/^\s*[MADRCU?!]{1,2}\s+/, '').trim()).filter(Boolean);
  const assertInside = value => { const resolved = path.resolve(value); const allowed = [root, path.resolve(worktreeRoot)]; const inside = allowed.some(base => { const relative = path.relative(base, resolved); return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative); }); if (!inside) throw fail('Path proyek harus berada di dalam workspace atau worktree maintenance.'); return resolved; };
  const inspect = async (cwd, baseCommit, { markUntracked = true } = {}) => {
    const status = await run('git', ['status', '--short'], cwd);
    const statusFiles = relativeFiles(status.stdout); assertSafeFiles(statusFiles);
    if (markUntracked) for (const file of statusFiles) if (/^\?\?\s/.test(status.stdout.split(/\r?\n/).find(line => line.includes(file)) || '')) await run('git', ['add', '-N', '--', file], cwd);
    const diff = await run('git', baseCommit ? ['diff', baseCommit, '--binary', '--no-ext-diff'] : ['diff', '--binary', '--no-ext-diff'], cwd);
    const staged = await run('git', ['diff', '--cached', '--binary', '--no-ext-diff'], cwd);
    const files = [...new Set([...statusFiles, ...relativeFiles((await run('git', baseCommit ? ['diff', baseCommit, '--name-only'] : ['diff', '--name-only'], cwd)).stdout), ...relativeFiles((await run('git', ['diff', '--cached', '--name-only'], cwd)).stdout)])];
    const patch = `${diff.stdout}\n${staged.stdout}`;
    return { files, patch, diffHash: createHash('sha256').update(patch).digest('hex'), clean: files.length === 0, status: status.stdout.slice(-maxOutput) };
  };
  const checkName = value => { const name = String(value || 'tests'); if (!Object.hasOwn(CHECKS, name)) throw fail(`Pemeriksaan '${name}' tidak diizinkan.`); return name; };
  const assertSafeFiles = files => {
    const unsafe = files.filter(file => blocked.test(file.replaceAll('\\', '/')));
    if (unsafe.length) throw fail(`Perubahan menyentuh path terlarang: ${unsafe.join(', ')}`, 403);
  };
  const ensureSafeParent = async (cwd, target) => {
    const parent = path.dirname(target); const relative = path.relative(cwd, parent); const parts = relative ? relative.split(path.sep).filter(Boolean) : []; let current = cwd;
    for (const part of parts) { current = path.join(current, part); try { const stat = await fsApi.lstat(current); if (stat.isSymbolicLink()) throw fail(`Folder symlink ditolak: ${relative}`, 403); } catch (error) { if (error.status) throw error; if (error.code !== 'ENOENT') throw error; } }
  };

  async function create(input = {}) {
    if (creating) throw fail('Proposal maintenance sedang dibuat.', 409);
    creating = true;
    try { return await createProposal(input); } finally { creating = false; }
  }
  async function createProposal({ request, target = 'maintenance', actor = 'owner' } = {}) {
    await init();
    const instruction = cleanText(request, 16_000, 'Instruksi maintenance');
    const targetName = cleanText(target, 120, 'Target maintenance');
    if (db.proposals.some(item => ['proposed', 'validated', 'approved'].includes(item.status))) throw fail('Masih ada proposal maintenance aktif.', 409);
    const id = randomUUID();
    const pathForWorktree = worktreePath(id);
    const branch = `maintenance/${id}`;
    const add = await run('git', ['worktree', 'add', '-b', branch, pathForWorktree, 'HEAD']);
    if (add.code !== 0) throw fail(`Worktree maintenance gagal dibuat: ${add.stderr.slice(-500)}`, 503);
    // Preserve the operator's current uncommitted application edits in the
    // disposable proposal worktree. Git worktrees start at HEAD, which would
    // otherwise make the coding agent act on stale code. Copy only safe,
    // tracked/untracked files; secrets, runtime data, dependencies, and the
    // maintenance engine itself remain excluded by assertSafeFiles().
    try {
    const sourceStatus = await run('git', ['diff', 'HEAD', '--name-only', '-z'], root);
    const untracked = await run('git', ['ls-files', '-z', '--others', '--exclude-standard'], root);
    if (sourceStatus.code !== 0 || untracked.code !== 0) throw fail('Perubahan lokal tidak dapat dibaca.', 503);
    // Core runtime files are copied as read-only context for the coding agent;
    // assertSafeFiles() still rejects any attempted change to them later.
    const snapshotBlocked = /^(?:\.env(?:\.|$)|data(?:$|[\\/])|\.git(?:$|[\\/])|node_modules(?:$|[\\/])|.*\.(?:pem|key|p12|pfx|secret)$)/i;
    const dirtyFiles = [...new Set(`${sourceStatus.stdout}\0${untracked.stdout}`.split('\0').filter(Boolean))].filter(file => !snapshotBlocked.test(file.replaceAll('\\', '/')));
      for (const relative of dirtyFiles) {
        const source = path.resolve(root, relative); const targetPath = path.resolve(pathForWorktree, relative);
        const rel = path.relative(pathForWorktree, targetPath);
        if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw fail('Perubahan lokal berada di luar worktree.', 403);
        let stat;
        try { stat = await fsApi.lstat(source); } catch (error) { if (error.code !== 'ENOENT') throw error; await fsApi.rm(targetPath, { force: true }); continue; }
        if (!stat.isFile()) continue;
        await ensureSafeParent(root, source);
        await ensureSafeParent(pathForWorktree, targetPath);
        await fsApi.mkdir(path.dirname(targetPath), { recursive: true });
        await fsApi.copyFile(source, targetPath);
        if (blocked.test(relative.replaceAll('\\', '/'))) {
          try { await fsApi.chmod(targetPath, 0o444); } catch {}
        }
      }
      if (dirtyFiles.length) {
        const stage = await run('git', ['add', '--', ...dirtyFiles], pathForWorktree);
        if (stage.code !== 0) throw fail(`Snapshot perubahan lokal gagal: ${stage.stderr.slice(-500)}`, 503);
        const commit = await run('git', ['-c', 'user.name=Maintenance Snapshot', '-c', 'user.email=maintenance@localhost', 'commit', '--no-verify', '-m', 'snapshot: current workspace'], pathForWorktree);
        if (commit.code !== 0) throw fail(`Snapshot perubahan lokal gagal: ${commit.stderr.slice(-500)}`, 503);
      }
    } catch (error) {
      await run('git', ['worktree', 'remove', '--force', pathForWorktree], root);
      throw error;
    }
    const base = await run('git', ['rev-parse', 'HEAD'], pathForWorktree); const baseCommit = base.stdout.trim().split(/\s+/)[0];
    const risk = /\b(config|konfigurasi|dependency|dependensi|package|policy|kebijakan|security|keamanan|credential|kredensial)\b/i.test(`${instruction} ${targetName}`) ? 'HIGH' : 'MEDIUM';
    const proposal = { id, request: instruction, target: targetName, actor, status: 'proposed', worktreePath: pathForWorktree, baseCommit, checks: [], changedFiles: [], diffHash: null, risk, requiresApproval: true, branch, commit: null, rollbackCommit: null, evidence: [], audit: [], createdAt: now(), updatedAt: now() };
    db.proposals.unshift(proposal); addAudit(proposal, 'proposed', { worktreePath: pathForWorktree }); await save();
    return safeRecord(proposal);
  }

  async function validate(id, { checks = ['tests', 'build'], actor = 'quality-control' } = {}) {
    const proposal = await requireProposal(id);
    if (proposal.status !== 'proposed') throw fail('Proposal hanya dapat divalidasi dari status proposed.', 409);
    if (!Array.isArray(checks) || checks.length < 1 || checks.length > 3) throw fail('Daftar pemeriksaan tidak valid.');
    const cwd = assertInside(proposal.worktreePath);
    const rows = [];
    // Install from the proposal lockfile rather than silently using a stale
    // production node_modules tree. Lifecycle scripts remain disabled.
    try {
      const manifest = JSON.parse(await fsApi.readFile(path.join(cwd, 'package.json'), 'utf8'));
      if (Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).length) {
        await fsApi.access(path.join(cwd, 'package-lock.json'));
        const spec = npmCheck(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
        const result = await run(spec.command, spec.args, cwd);
        rows.push({ name: 'dependencies', command: [spec.command, ...spec.args].join(' '), code: result.code, passed: result.code === 0, output: `${result.stdout}\n${result.stderr}`.slice(-maxOutput), at: now() });
        if (result.code !== 0) throw fail('Dependensi proposal gagal disiapkan.');
      }
    } catch (error) {
      proposal.checks = rows; proposal.status = 'failed'; proposal.error = `Dependensi proposal tidak valid: ${error.message}`;
      addAudit(proposal, 'validation_failed', { actor, reason: proposal.error }); await save(); return safeRecord(proposal);
    }
    for (const raw of checks) {
      const name = checkName(raw); const spec = CHECKS[name]; const result = await run(spec.command, spec.args, cwd);
      rows.push({ name, command: [spec.command, ...spec.args].join(' '), code: result.code, passed: result.code === 0, output: `${result.stdout}\n${result.stderr}`.slice(-maxOutput), at: now() });
      if (result.code !== 0) { proposal.checks = rows; proposal.status = 'failed'; addAudit(proposal, 'validation_failed', { actor, check: name }); await save(); return safeRecord(proposal); }
      if (name === 'build') {
        try {
          const manifest = JSON.parse(await fsApi.readFile(path.join(cwd, 'package.json'), 'utf8'));
          if (manifest.scripts?.['check:build']) {
            const budget = npmCheck(['run', 'check:build']); const checked = await run(budget.command, budget.args, cwd);
            rows.push({ name: 'build_budget', command: [budget.command, ...budget.args].join(' '), code: checked.code, passed: checked.code === 0, output: `${checked.stdout}\n${checked.stderr}`.slice(-maxOutput), at: now() });
            if (checked.code !== 0) { proposal.checks = rows; proposal.status = 'failed'; addAudit(proposal, 'validation_failed', { actor, check: 'build_budget' }); await save(); return safeRecord(proposal); }
          }
        } catch { /* build already passed; optional budget gate unavailable */ }
      }
    }
    let inspected;
    try { inspected = await inspect(cwd, proposal.baseCommit); assertSafeFiles(inspected.files); }
    catch (error) { proposal.checks = rows; proposal.status = 'failed'; proposal.error = error.message; addAudit(proposal, 'validation_failed', { actor, reason: error.message }); await save(); return safeRecord(proposal); }
    proposal.checks = rows; proposal.changedFiles = inspected.files; proposal.diffHash = inspected.diffHash; proposal.evidence = [{ type: 'git_status', clean: inspected.clean, files: inspected.files, diffHash: inspected.diffHash, at: now() }];
    if (inspected.clean) { proposal.status = 'failed'; proposal.error = 'Belum ada perubahan kode untuk divalidasi.'; addAudit(proposal, 'validation_failed', { actor, reason: proposal.error }); }
    else { proposal.status = 'validated'; delete proposal.error; addAudit(proposal, 'validated', { actor, diffHash: inspected.diffHash, files: inspected.files }); }
    await save(); return safeRecord(proposal);
  }

  // OBSERVE is deliberately read-only. It records the worktree state that a
  // reviewer saw before a PR is prepared, without staging or modifying files.
  async function observe(id, { actor = 'quality-control' } = {}) {
    const proposal = await requireProposal(id);
    if (!['proposed', 'validated'].includes(proposal.status)) throw fail('Proposal hanya dapat diobservasi dari status proposed atau validated.', 409);
    const cwd = assertInside(proposal.worktreePath);
    const head = await run('git', ['rev-parse', 'HEAD'], cwd);
    if (head.code !== 0) throw fail(`Git HEAD tidak dapat dibaca: ${head.stderr.slice(-500)}`, 503);
    const branch = await run('git', ['branch', '--show-current'], cwd);
    const inspected = await inspect(cwd, proposal.baseCommit, { markUntracked: false });
    assertSafeFiles(inspected.files);
    const observation = {
      type: 'workspace_observation',
      actor,
      at: now(),
      head: head.stdout.trim().split(/\s+/)[0] || null,
      branch: branch.stdout.trim().slice(0, 200) || proposal.branch,
      clean: inspected.clean,
      files: inspected.files,
      diffHash: inspected.diffHash,
    };
    proposal.observation = observation;
    proposal.evidence = [...(proposal.evidence || []).filter(item => item.type !== 'workspace_observation'), observation];
    addAudit(proposal, 'observed', { actor, clean: observation.clean, files: observation.files, diffHash: observation.diffHash });
    await save();
    return safeRecord(proposal);
  }

  // Prepare a reviewable PR descriptor, without pushing or calling GitHub.
  // Approval/apply remains a separate explicit owner action.
  async function preparePullRequest(id, { title, body = '', actor = 'quality-control' } = {}) {
    const proposal = await requireProposal(id);
    if (proposal.status !== 'validated') throw fail('PR hanya dapat disiapkan setelah validasi.', 409);
    const cwd = assertInside(proposal.worktreePath);
    const inspected = await inspect(cwd, proposal.baseCommit);
    assertSafeFiles(inspected.files);
    if (inspected.clean || inspected.diffHash !== proposal.diffHash) throw fail('Diff berubah atau kosong sejak validasi. Jalankan validasi ulang.', 409);
    const prTitle = cleanText(title || `Maintenance: ${proposal.target}`, 250, 'Judul PR');
    const prBody = typeof body === 'string' ? body.slice(0, 10_000) : '';
    proposal.pullRequest = {
      status: 'ready_for_review',
      title: prTitle,
      body: prBody,
      branch: proposal.branch,
      base: proposal.baseCommit,
      baseCommit: proposal.baseCommit,
      files: inspected.files,
      diffHash: inspected.diffHash,
      preparedAt: now(),
      preparedBy: actor,
    };
    addAudit(proposal, 'pull_request_prepared', { actor, diffHash: inspected.diffHash, files: inspected.files });
    await save();
    return safeRecord(proposal);
  }

  // A PR descriptor is reviewable evidence, not approval. A second, explicit
  // reviewer decision is required before the owner can apply a change. A
  // reviewer may request a bounded repair cycle; the old descriptor is then
  // invalidated and must be regenerated after QA runs again.
  async function reviewPullRequest(id, { approved = false, actor = 'reviewer', findings = [], summary = '' } = {}) {
    const proposal = await requireProposal(id);
    if (actor !== 'reviewer') throw fail('Review harus dilakukan oleh reviewer terpisah.', 403);
    if (proposal.status !== 'validated' || proposal.pullRequest?.status !== 'ready_for_review') throw fail('Pull request belum siap direview.', 409);
    const cwd = assertInside(proposal.worktreePath);
    const inspected = await inspect(cwd, proposal.baseCommit);
    assertSafeFiles(inspected.files);
    if (inspected.clean || inspected.diffHash !== proposal.diffHash || proposal.pullRequest.diffHash !== proposal.diffHash) throw fail('Diff berubah atau kosong sejak validasi. Jalankan validasi ulang.', 409);
    if (!Array.isArray(findings) || findings.length > 20 || findings.some(item => typeof item !== 'string' || item.length > 1000)) throw fail('Temuan review tidak valid.');
    const checks = Array.isArray(proposal.checks) ? proposal.checks : [];
    if (!checks.some(check => check.name === 'tests' && check.passed === true) || checks.some(check => check.passed !== true)) throw fail('QA belum lulus. Jalankan test yang berhasil sebelum review.', 409);
    const review = { status: approved ? 'approved' : 'changes_requested', actor, summary: String(summary || '').slice(0, 2000), findings: findings.slice(), diffHash: proposal.diffHash, at: now() };
    proposal.reviewHistory = [...(proposal.reviewHistory || []), review].slice(-10);
    proposal.review = review;
    if (!approved) {
      const cycles = Number(proposal.repairCycles || 0) + 1;
      if (cycles > 3) throw fail('Batas repair otomatis tercapai. Reviewer harus menilai secara manual.', 409);
      proposal.repairCycles = cycles;
      proposal.status = 'proposed';
      proposal.pullRequest = null;
      proposal.diffHash = null;
      proposal.checks = [];
      addAudit(proposal, 'review_changes_requested', { actor, findings, cycle: cycles });
    } else addAudit(proposal, 'review_approved', { actor, diffHash: proposal.diffHash });
    await save();
    return safeRecord(proposal);
  }

  // Coding agents submit bounded file edits here. The agent never receives the
  // production path; every write is confined to its disposable worktree.
  async function writeChanges(id, { files = [], actor = 'senior-programmer' } = {}) {
    const proposal = await requireProposal(id);
    if (proposal.status !== 'proposed') throw fail('Perubahan hanya dapat ditulis pada proposal proposed.', 409);
    if (!Array.isArray(files) || files.length < 1 || files.length > 100) throw fail('Daftar berkas perubahan tidak valid.');
    const cwd = assertInside(proposal.worktreePath); const changed = [];
    for (const item of files) {
      if (!item || typeof item !== 'object' || typeof item.path !== 'string' || typeof item.content !== 'string' || item.content.length > 1_000_000) throw fail('Format berkas perubahan tidak valid.');
      const relative = item.path.replaceAll('\\', '/').replace(/^\.\//, '');
      if (!relative || relative.startsWith('../') || relative.includes('/../') || blocked.test(relative)) throw fail(`Path perubahan ditolak: ${item.path}`, 403);
      const target = path.resolve(cwd, relative); const inside = path.relative(cwd, target); if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) throw fail('Path perubahan harus berada di worktree.', 403);
      await ensureSafeParent(cwd, target);
      try { const stat = await fsApi.lstat(target); if (stat.isSymbolicLink()) throw fail(`Path symlink ditolak: ${item.path}`, 403); } catch (error) { if (error.status) throw error; if (error.code !== 'ENOENT') throw error; }
      await fsApi.mkdir(path.dirname(target), { recursive: true }); const temp = `${target}.${randomUUID()}.tmp`; await fsApi.writeFile(temp, item.content, { encoding: 'utf8', mode: 0o600 }); await fsApi.rename(temp, target); changed.push(relative);
    }
    proposal.changedFiles = [...new Set([...(proposal.changedFiles || []), ...changed])]; addAudit(proposal, 'changes_written', { actor, files: changed }); await save(); return safeRecord(proposal);
  }

  async function code(id, { agentId = 'developer', instruction, actor = 'senior-programmer' } = {}) {
    const proposal = await requireProposal(id);
    if (proposal.status !== 'proposed') throw fail('Coding hanya dapat dimulai pada proposal proposed.', 409);
    if (typeof startCoding !== 'function') throw fail('Coding agent belum terhubung.', 503);
    const task = cleanText(instruction || proposal.request, 16_000, 'Instruksi coding');
    const job = await startCoding({ agentId, instruction: task, workspacePath: proposal.worktreePath, maintenance: true });
    proposal.codingJobId = job?.id || null; addAudit(proposal, 'coding_started', { actor, agentId, jobId: proposal.codingJobId }); await save(); return safeRecord(proposal);
  }

  async function approve(id, { approved = false, actor = 'owner', reason = '' } = {}) {
    const proposal = await requireProposal(id);
    if (!approved || actor !== 'owner') throw fail('Persetujuan pemilik wajib diberikan.', 403);
    if (proposal.status !== 'validated') throw fail('Proposal belum lolos validasi.', 409);
    if (proposal.pullRequest?.status !== 'ready_for_review' || proposal.pullRequest.diffHash !== proposal.diffHash) throw fail('Pull request belum disiapkan atau diff berubah. Siapkan PR ulang sebelum persetujuan.', 409);
    if (proposal.review?.status !== 'approved' || proposal.review.diffHash !== proposal.diffHash) throw fail('Review reviewer belum disetujui atau diff berubah.', 409);
    proposal.status = 'approved'; proposal.approvedAt = now(); proposal.approvedBy = actor; proposal.approvalReason = typeof reason === 'string' ? reason.slice(0, 2000) : '';
    addAudit(proposal, 'approved', { actor, reason: proposal.approvalReason }); await save(); return safeRecord(proposal);
  }

  async function apply(id, { approved = false, actor = 'owner' } = {}) {
    const proposal = await requireProposal(id);
    if (!approved || actor !== 'owner') throw fail('Apply perubahan memerlukan persetujuan pemilik.', 403);
    if (proposal.status !== 'approved') throw fail('Proposal belum disetujui.', 409);
    const cwd = assertInside(proposal.worktreePath); const inspected = await inspect(cwd, proposal.baseCommit); assertSafeFiles(inspected.files);
    if (inspected.clean || inspected.diffHash !== proposal.diffHash) throw fail('Diff berubah atau kosong sejak validasi. Jalankan validasi ulang.', 409);
    const main = await inspect(root); if (!main.clean) throw fail('Workspace produksi memiliki perubahan lokal. Bersihkan atau commit dahulu.', 409);
    const commitMessage = `maintenance: ${proposal.target}`.slice(0, 120);
    // Squash the complete validated tree relative to the captured baseline.
    // This includes committed and uncommitted agent edits without ever
    // cherry-picking the operator's pre-existing snapshot commit.
    let commitId;
    {
      const add = await run('git', ['add', '-A'], cwd); if (add.code !== 0) throw fail(`Git add gagal: ${add.stderr.slice(-500)}`, 503);
      const tree = await run('git', ['write-tree'], cwd); if (tree.code !== 0) throw fail(`Git tree gagal: ${tree.stderr.slice(-500)}`, 503);
      const commit = await run('git', ['commit-tree', tree.stdout.trim(), '-p', proposal.baseCommit, '-m', commitMessage], cwd); if (commit.code !== 0) throw fail(`Commit maintenance gagal: ${commit.stderr.slice(-500)}`, 503);
      commitId = commit.stdout.trim().split(/\s+/)[0];
      const cherry = await run('git', ['cherry-pick', commitId], root); if (cherry.code !== 0) { await run('git', ['cherry-pick', '--abort'], root); throw fail(`Apply maintenance gagal: ${cherry.stderr.slice(-500)}`, 503); }
      const appliedHead = await run('git', ['rev-parse', 'HEAD'], root); commitId = appliedHead.stdout.trim().split(/\s+/)[0] || commitId;
    }
    proposal.status = 'applied'; proposal.commit = commitId; proposal.appliedAt = now(); addAudit(proposal, 'applied', { actor, commit: commitId, diffHash: proposal.diffHash }); await save(); return safeRecord(proposal);
  }

  async function rollback(id, { approved = false, actor = 'owner', reason = '' } = {}) {
    const proposal = await requireProposal(id);
    if (!approved || actor !== 'owner') throw fail('Rollback memerlukan persetujuan pemilik.', 403);
    if (proposal.status !== 'applied' || !proposal.commit) throw fail('Proposal belum diterapkan atau tidak memiliki commit.', 409);
    const result = await run('git', ['revert', '--no-edit', proposal.commit], root); if (result.code !== 0) throw fail(`Rollback gagal: ${result.stderr.slice(-500)}`, 503);
    const hash = await run('git', ['rev-parse', 'HEAD'], root); proposal.status = 'rolled_back'; proposal.rollbackCommit = hash.stdout.trim().split(/\s+/)[0] || null; proposal.rolledBackAt = now(); addAudit(proposal, 'rolled_back', { actor, reason: String(reason || '').slice(0, 2000), commit: proposal.rollbackCommit }); await save(); return safeRecord(proposal);
  }

  async function dispose(id) {
    const proposal = await requireProposal(id); const cwd = assertInside(proposal.worktreePath);
    const result = await run('git', ['worktree', 'remove', '--force', cwd], root); if (result.code !== 0) throw fail(`Worktree tidak dapat dihapus: ${result.stderr.slice(-500)}`, 503);
    if (['proposed', 'validated', 'failed'].includes(proposal.status)) proposal.status = 'failed';
    addAudit(proposal, 'worktree_removed'); await save(); return safeRecord(proposal);
  }

  async function failProposal(id, { reason = 'Coding tidak selesai.', actor = 'task-worker' } = {}) {
    const proposal = await requireProposal(id);
    if (!['proposed', 'failed'].includes(proposal.status)) throw fail('Hanya proposal belum tervalidasi dapat ditandai gagal.', 409);
    proposal.status = 'failed'; proposal.error = String(reason).slice(0, 1000);
    addAudit(proposal, 'coding_failed', { actor, reason: proposal.error }); await save(); return safeRecord(proposal);
  }

  return { init, list: async () => { await init(); return safeRecord(db.proposals); }, snapshot: async () => { await init(); return safeRecord({ proposals: db.proposals, audit: db.audit, statuses: STATUSES, checks: Object.keys(CHECKS) }); }, get: requireProposal, create, observe, code, writeChanges, validate, reviewPullRequest, review: reviewPullRequest, preparePullRequest, preparePR: preparePullRequest, createPullRequest: preparePullRequest, approve, apply, rollback, dispose, failProposal, statuses: STATUSES, checks: Object.keys(CHECKS) };
}

export { STATUSES as SELF_DEVELOPMENT_STATUSES };
