import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { members, departments } = JSON.parse(readFileSync(new URL('../public/team.json', import.meta.url), 'utf8'));
import { buildOfficeState } from '../office-state.js';
const at = new Date('2026-11-01T15:00:00Z');
const task = { id: 't1', title: 'Uji tugas', status: 'running', agentId: 'team', createdAt: '2026-11-01T14:59:00Z', updatedAt: '2026-11-01T14:59:55Z', steps: [
  { agentId: 'director', label: 'Rencana', status: 'completed', content: 'Rencana singkat', startedAt: '2026-11-01T14:59:00Z', endedAt: '2026-11-01T14:59:30Z' },
  { agentId: 'admin', label: 'Admin bekerja', status: 'running', startedAt: '2026-11-01T14:59:40Z' },
  { agentId: 'marketing', label: 'Marketing menunggu', status: 'queued' },
] };
test('office reflects only actual inference; queued agents remain idle', () => {
  const result = buildOfficeState({ tasks: [task] }, {}, ['admin'], at);
  assert.equal(result.team.length, members.length - 1);
  assert.equal(result.team[0].state, 'bekerja');
  assert.equal(result.team[1].state, 'santai');
  assert.equal(result.ketua.state, 'santai');
  assert.equal(result.stats.active, 1);
  assert.equal(result.runs.length, 2);
  assert.equal(result.runs.find(r => r.id === 't1:1').started, '2026-11-01T14:59:40Z');
  assert.ok(result.runs.every(r => r.color && r.taskId === 't1'));
  assert.ok(result.feed.some(e => e.text === 'Admin bekerja' && e.t === '2026-11-01T14:59:40Z'));
  assert.equal(buildOfficeState({ tasks: [task] }, {}, [], at).stats.active, 0);
});
test('active chat maps to real working agent; recent completion rests after 12 seconds', () => {
  const messages = [{ id: 'm1', agentId: 'marketing', role: 'user', content: 'Buat konten', createdAt: '2026-11-01T14:59:50Z' }];
  const working = buildOfficeState({ messages }, {}, ['marketing'], at);
  assert.equal(working.team[1].state, 'bekerja');
  assert.equal(working.team[1].run.id, 'chat:m1');
  messages.push({ id: 'm2', agentId: 'marketing', role: 'assistant', content: 'Hasil', createdAt: '2026-11-01T14:59:55Z' });
  assert.equal(buildOfficeState({ messages }, {}, [], at).team[1].state, 'selesai');
  assert.equal(buildOfficeState({ messages }, {}, [], new Date('2026-11-01T15:00:08Z')).team[1].state, 'santai');
});
test('task board and idle office have stable truthful defaults', () => {
  const empty = buildOfficeState({}, { businessName: 'Harmes' }, [], at);
  assert.equal(empty.project, 'Harmes');
  assert.equal(empty.names, members.map(m => m.shortName).join('|'));
  assert.equal(empty.stats.active, 0);
  assert.equal(empty.freelancers.length, 0);
  assert.equal(empty.runs.length, 0);
  assert.equal(empty.feed.length, 0);
  const result = buildOfficeState({ tasks: [task] }, {}, [], at);
  assert.equal(result.ketua.todos.items[0].status, 'in_progress');
  assert.equal(result.ketua.todos.items[0].taskId, 't1');
});

test('all specialists retain unique identities and only live inference works', () => {
  const result = buildOfficeState({}, {}, ['wibisono'], at);
  const agents = [result.ketua, ...result.team];
  assert.equal(new Set(agents.map(a => a.id)).size, members.length);
  assert.equal(new Set(agents.map(a => a.key)).size, members.length);
  assert.equal(result.team.find(a => a.id === 'wibisono').state, 'bekerja');
  assert.equal(result.team.find(a => a.id === 'wibisono').role, 'Motion Designer');
  assert.equal(result.team.find(a => a.id === 'marketing').fullName, 'Muhammad Syaifullah Fajri');
  assert.equal(result.team.find(a => a.id === 'marketing').role, 'System Analyst');
  assert.equal(result.stats.active, 1);
});

test('expanded roster exposes departments and virtual identity', () => {
  const result = buildOfficeState({}, {}, ['video_editor'], at);
  const agents = [result.ketua, ...result.team];
  assert.equal(agents.length, 35);
  assert.equal(agents.filter(a => a.virtual).length, 22);
  assert.equal(agents.filter(a => !a.virtual).length, 13);
  assert.equal(result.departments.length, 8);
  assert.ok(agents.every(a => departments.some(d => d.id === a.departmentId && d.name === a.department)));
  assert.equal(agents.find(a => a.id === 'video_editor').state, 'bekerja');
});
