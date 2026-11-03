import { classifyMessage, fastResponse } from '../fast-router.js';

const cases = [
  ['ping', 'ping'],
  ['halo', 'halo'],
  ['percakapan biasa', 'Jelaskan cara membuat ringkasan laporan.'],
  ['meeting', 'Siapkan agenda meeting dan notulen.'],
  ['coding kompleks', 'Debug API TypeScript, jalankan test, lalu buat pull request.'],
];
const rounds = Math.max(10, Math.min(10000, Number.parseInt(process.env.BENCHMARK_ROUNDS || '100', 10) || 100));
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor((values.length - 1) * p))];
const report = {};
for (const [name, input] of cases) {
  const samples = [];
  let decision;
  for (let i = 0; i < rounds; i++) {
    const started = performance.now();
    decision = classifyMessage(input);
    if (decision.kind === 'deterministic') fastResponse(input);
    samples.push(performance.now() - started);
  }
  report[name] = { route: decision.route, kind: decision.kind, lane: decision.lane, codexCalls: decision.kind === 'deterministic' ? 0 : 1, rounds, p50Ms: Number(percentile(samples, .5).toFixed(4)), p95Ms: Number(percentile(samples, .95).toFixed(4)), maxMs: Number(Math.max(...samples).toFixed(4)) };
}
console.log(JSON.stringify({ generatedAt: new Date().toISOString(), router: 'fast-router', version: '1.0', report }, null, 2));
