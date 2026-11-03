import { setTimeout as delay } from 'node:timers/promises';

// A successful CLI exit only means the process finished. Delivery requires a
// real, nonempty diff, passing checks, and a reviewable proposal.
export async function executeCodingTask({ instruction, agentId = 'developer', signal, proposalId, onProgress = async () => {}, maintenance, coding, pollMs = 500 } = {}) {
  if (!maintenance?.create || !coding?.getJob) throw new Error('Coding engine belum terhubung.');
  signal?.throwIfAborted();
  let proposal = proposalId ? await maintenance.get(proposalId) : await maintenance.create({ request: instruction, target: 'kantor-ai', actor: 'task-worker' });
  let jobId;
  const cancel = () => jobId && coding.cancelJob(jobId).catch(() => {});
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    await onProgress({ proposalId: proposal.id });
    signal?.throwIfAborted();
    proposal = await maintenance.code(proposal.id, { agentId, instruction, actor: 'task-worker' });
    jobId = proposal.codingJobId;
    if (!jobId) throw new Error('Coding job tidak dibuat.');
    await onProgress({ proposalId: proposal.id, codingJobId: jobId });
    for (;;) {
      signal?.throwIfAborted();
      const job = coding.getJob(jobId);
      if (!job) throw new Error('Coding job hilang sebelum selesai.');
      if (['failed', 'cancelled'].includes(job.status)) throw new Error(job.error || `Coding job ${job.status}.`);
      if (job.status === 'completed') break;
      await delay(pollMs, undefined, { signal });
    }
    signal?.throwIfAborted();
    proposal = await maintenance.validate(proposal.id, { checks: ['tests', 'build'], actor: 'quality-control' });
    signal?.throwIfAborted();
    if (proposal.status !== 'validated' || !proposal.changedFiles?.length || !proposal.diffHash || !proposal.checks?.some(check => check.name === 'tests' && check.passed === true) || !proposal.checks?.some(check => check.name === 'build' && check.passed === true) || proposal.checks.some(check => check.passed !== true)) throw new Error(proposal.error || 'Coding selesai tanpa diff dan QA lulus.');
    proposal = await maintenance.preparePullRequest(proposal.id, { title: 'Maintenance Kantor AI', body: 'Perubahan coding agent dengan diff dan QA. Menunggu review reviewer dan persetujuan owner.', actor: 'quality-control' });
    const summary = `Perubahan siap ditinjau. Proposal: ${proposal.id}. Berkas: ${proposal.changedFiles.join(', ')}. Test dan build lulus. Belum diterapkan ke kantor aktif.`;
    return { status: 'validated', proposalId: proposal.id, codingJobId: jobId, changedFiles: proposal.changedFiles, checks: proposal.checks, diffHash: proposal.diffHash, summary };
  } catch (error) {
    await cancel();
    // Preserve the worktree for diagnosis and repair. Mark the proposal failed;
    // disposal is an explicit owner action after any running child has exited.
    await Promise.resolve(maintenance.failProposal?.(proposal.id, { reason: error.message, actor: 'task-worker' })).catch(() => {});
    throw error;
  } finally { signal?.removeEventListener('abort', cancel); }
}
