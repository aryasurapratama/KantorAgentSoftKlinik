import { useEffect, useRef } from 'react';
import './office-shell.css';

const ACTIONS = new Set(['task', 'chat', 'settings', 'workspace', 'result', '3d', 'lite']);

export default function OfficeView({ onAction, agents = [], departments = [], mode = 'lite' }) {
  const frame = useRef(null);
  useEffect(() => {
    const allowedAgents = new Set(agents.map((agent) => agent.id));
    const allowedDepartments = new Set(departments.map((department) => 'department:' + department.id));
    const receive = (event) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const message = event.data;
      if (!message || message.source !== 'harmes-office' || !ACTIONS.has(message.action)) return;
      if (message.agentId !== undefined && !allowedAgents.has(message.agentId) && !(message.action === 'task' && (message.agentId === 'team' || allowedDepartments.has(message.agentId)))) return;
      if (message.taskId !== undefined && typeof message.taskId !== 'string') return;
      onAction?.(message);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onAction, agents, departments]);
  return <section className="office-view" aria-label="Kantor animasi Softklinik Harmes">
    <iframe key={mode} ref={frame} title={`Kantor Softklinik Harmes · ${mode === '3d' ? '3D' : '2D ringan'}`} src={mode === '3d' ? '/office/index.html' : '/office-lite/index.html'} />
  </section>;
}
