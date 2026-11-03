export const GRADE14_BENCHMARKS = Object.freeze([
  ['ping', 'Respons ping', 'latency and codexCalls evidence'],
  ['conversation', 'Percakapan sederhana', 'response and latency evidence'],
  ['telegram', 'Instruksi Telegram', 'owner-authenticated command evidence'],
  ['meeting', 'Meeting multi-agent', 'transcript, decisions, and task evidence'],
  ['repository', 'Pemahaman repository', 'scoped repository evidence'],
  ['bug-fix', 'Perbaikan bug', 'changed files and regression test evidence'],
  ['feature', 'Pembuatan fitur baru', 'acceptance and test evidence'],
  ['unit-testing', 'Unit testing', 'test command and result evidence'],
  ['github', 'Integrasi GitHub', 'approved operation or read-only check evidence'],
  ['recovery', 'Pemulihan kegagalan Codex', 'cancel, retry, and recovery evidence'],
  ['memory', 'Penggunaan memori', 'RAM/CPU samples and threshold evidence'],
  ['design', 'Kualitas desain', 'artifact and independent review evidence'],
  ['content', 'Produksi konten', 'artifact, source facts, and review evidence'],
  ['security', 'Keamanan sistem', 'security checks and negative test evidence'],
  ['self-development', 'Pengembangan mandiri', 'worktree, diff, tests, approval evidence'],
].map(([id, name, evidence]) => Object.freeze({ id, name, evidence })));

const validScore = value => Number.isFinite(value) && value >= 0 && value <= 10 ? Number(value) : null;

/** Report only evidence supplied by callers. Missing evidence stays unverified. */
export function createGrade14Report({ evidence = {}, generatedAt = new Date().toISOString() } = {}) {
  const rows = GRADE14_BENCHMARKS.map(definition => {
    const item = evidence?.[definition.id];
    const score = validScore(item?.score);
    const hasEvidence = Boolean(item && (item.passed === true || item.status === 'verified') && item.evidence);
    return { ...definition, status: hasEvidence ? 'verified' : item ? 'failed' : 'not_run', score: hasEvidence ? score : null, evidence: item?.evidence || null, measuredAt: item?.measuredAt || null, limitations: Array.isArray(item?.limitations) ? item.limitations.slice(0, 10) : [] };
  });
  const verified = rows.filter(row => row.status === 'verified');
  const scored = verified.filter(row => row.score !== null);
  return { version: '14.0', generatedAt, grade: scored.length === rows.length ? Number((scored.reduce((sum, row) => sum + row.score, 0) / scored.length).toFixed(2)) : null, status: verified.length === rows.length && scored.length === rows.length ? 'verified' : 'not_verified', verified: verified.length, total: rows.length, benchmarks: rows };
}
