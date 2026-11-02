import { readFileSync } from 'node:fs';
const { members, departments } = JSON.parse(readFileSync(new URL('./public/team.json', import.meta.url), 'utf8'));
const ALL = members.map((member, index) => ({ id: member.id, key: index === 0 ? 'ketua' : `tim-${index - 1}`, name: member.shortName, fullName: member.name, role: member.role, color: member.color, departmentId: member.departmentId, department: member.department, virtual: member.virtual }));
const [DIRECTOR, ...TEAM] = ALL;
const actor = (id) => ALL.find((item) => item.id === id) || DIRECTOR;
const clip = (value, max = 220) => String(value || '').slice(0, max);
const stateFor = (status) => status === 'running' ? 'bekerja' : status === 'completed' ? 'selesai' : 'terhenti';

export function buildOfficeState(state = {}, settings = {}, liveInference = [], at = new Date()) {
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const messages = Array.isArray(state.messages) ? state.messages : [];
  const activity = Array.isArray(state.activity) ? state.activity : [];
  const now = new Date(at).toISOString();
  const nowMs = new Date(now).getTime();
  const live = new Set(liveInference);
  const runs = [];
  const stepByAgent = new Map();
  const latestRun = new Map();
  const stepFeed = [];
  for (const task of tasks) {
    for (const [index, step] of (task.steps || []).entries()) {
      if (step.status === 'queued') continue;
      const agent = actor(step.agentId);
      const started = step.startedAt || task.createdAt;
      const ended = step.endedAt || (['completed', 'failed'].includes(task.status) ? task.updatedAt : null);
      const run = {
        id: `${task.id}:${index}`, taskId: task.id, task: clip(task.title, 180), label: agent.name,
        color: agent.color, agent_type: agent.role, status: step.status === 'running' && !live.has(step.agentId) ? 'menunggu' : stateFor(step.status), started, ended,
        last: [{ t: ended || started, kind: step.status === 'running' ? 'inference' : 'text', text: step.status === 'running' ? 'Menyiapkan jawaban…' : clip(step.content || step.label, 160) }],
        tools: 0, tokens: 0,
      };
      runs.push(run);
      const previous = latestRun.get(step.agentId);
      if (!previous || new Date(ended || started) > new Date(previous.ended || previous.started)) latestRun.set(step.agentId, run);
      if (step.status === 'running' && live.has(step.agentId)) stepByAgent.set(step.agentId, run);
      if (step.startedAt) stepFeed.push({ t: step.startedAt, who: agent.key, name: agent.name, text: step.label || `Mengerjakan: ${task.title}`, kind: 'task', color: agent.color });
      if (step.endedAt) stepFeed.push({ t: step.endedAt, who: agent.key, name: agent.name, text: `${step.status === 'completed' ? 'Selesai' : 'Terhenti'}: ${step.label || task.title}`, kind: 'task', color: agent.color });
    }
  }
  const dataFor = (id) => {
    const agent = actor(id);
    const agentMessages = messages.filter((item) => item.agentId === id);
    const message = agentMessages.at(-1);
    const current = stepByAgent.get(id);
    const lastRun = latestRun.get(id);
    if (current) return { state: 'bekerja', activity: 'berpikir', updated: current.started, run: current, last: current.last };
    if (live.has(id)) {
      const user = agentMessages.filter((item) => item.role === 'user').at(-1);
      const chatRun = { id: `chat:${user?.id || id}`, task: 'Percakapan', label: agent.name, color: agent.color, agent_type: agent.role, status: 'bekerja', started: user?.createdAt || now, ended: null, last: [{ t: user?.createdAt || now, kind: 'inference', text: 'Menyiapkan jawaban…' }], tools: 0, tokens: 0 };
      return { state: 'bekerja', activity: 'berpikir', updated: chatRun.started, run: chatRun, last: chatRun.last };
    }
    const messageEnded = message?.role === 'assistant' ? message.createdAt : null;
    const ended = [lastRun?.status === 'selesai' ? lastRun.ended : null, messageEnded].filter(Boolean).sort().at(-1);
    const recentlyDone = ended && nowMs >= new Date(ended).getTime() && nowMs - new Date(ended).getTime() <= 12000;
    const last = message ? [{ t: message.createdAt, kind: 'text', text: clip(message.content, 160) }] : lastRun?.last || [];
    return { state: recentlyDone ? 'selesai' : 'santai', activity: 'idle', updated: ended || message?.createdAt || lastRun?.started || null, run: lastRun || null, last };
  };
  const todos = { at: tasks.map((task) => task.updatedAt || task.createdAt).sort().at(-1) || null, source: 'Harmes', items: tasks.map((task) => ({ text: task.title, taskId: task.id, status: task.status === 'completed' ? 'completed' : task.status === 'running' ? 'in_progress' : 'pending' })) };
  const ketua = { ...dataFor('director'), ...DIRECTOR, tools: 0, tokens: 0, other_sessions: 0, waiting_on: 0, todos };
  const team = TEAM.map((agent) => ({ ...dataFor(agent.id), ...agent }));
  const feed = [...stepFeed, ...activity.map((item) => ({ t: item.createdAt, who: 'system', name: item.title || 'Kantor', text: clip(item.detail, 180), kind: item.type || 'task', color: item.type === 'error' ? '#c43d3d' : DIRECTOR.color }))];
  for (const message of messages.slice(-50)) {
    const agent = actor(message.agentId);
    feed.push({ t: message.createdAt, who: agent.key, name: message.role === 'user' ? 'Harmes' : agent.name, text: clip(message.content, 180), kind: 'chat', color: agent.color });
  }
  feed.sort((a, b) => new Date(b.t) - new Date(a.t));
  return {
    app: 'kantor-agent', now, departments, project: settings.businessName || 'Softklinik Harmes', transcripts: true,
    names: `${DIRECTOR.name}|${TEAM.map((item) => item.name).join('|')}`,
    ketua, team, freelancers: [],
    runs: runs.sort((a, b) => new Date(b.started) - new Date(a.started)).slice(0, 100), feed: feed.slice(0, 100),
    stats: { active: [ketua, ...team].filter((item) => item.state === 'bekerja').length, recent_starts: tasks.map((task) => task.createdAt) },
  };
}
export default buildOfficeState;
