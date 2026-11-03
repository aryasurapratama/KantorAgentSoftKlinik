const SIMPLE_RESPONSES = Object.freeze({
  ping: 'pong',
  halo: 'Halo! Kantor AI siap membantu.',
  health: 'Kantor AI sehat dan siap menerima permintaan.'
});

const normalize = value => String(value || '').trim().toLocaleLowerCase('id-ID').replace(/\s+/g, ' ');

export function isInternalDevelopmentRequest(message) {
  const text = normalize(message);
  if (/^(?:pak\s+)?(?:arya[\s,:-]+)?(?:apa|apakah|bagaimana|gimana|kenapa|mengapa|bisakah|bolehkah|jelaskan|ceritakan|menurut|diskusikan|bahas)\b/.test(text) || /[?？]$/.test(text)) return false;
  if (/\b(?:pengembangan internal|tim pengembangan|source code|coding mandiri|debugger|quality assurance|cybersecurity)\b/.test(text)) return true;
  const target = /\b(?:kantor\s+(?:ai|3d|ini|soft\s*klinik|animasi)|logo\s+(?:kantor|3d))\b/.test(text) || /\b(?:resepsion\w*|resepsi)\b/.test(text) && /\b(?:logo|animasi|duduk)\b/.test(text);
  const action = /\b(?:di\s*)?(?:ganti|ubah|perbaiki|kembangkan|implementasikan|tambahkan|optimalkan|tingkatkan)\b/.test(text);
  return target && action;
}

/**
 * Classify before loading knowledge, taking a model slot, or starting a task.
 * Rules stay deterministic so health checks never depend on a provider.
 */
export function classifyMessage(message, { source = 'chat' } = {}) {
  const text = normalize(message);
  if (isInternalDevelopmentRequest(text)) return { kind: 'complex', route: 'coding', lane: 'coding', priority: 70, normalized: text, source, confidence: 0.97 };
  if (!text) return { kind: 'invalid', route: 'reject', lane: 'interactive', priority: 100, normalized: text };
  if (/^(?:ping|ping[!.]?)$/.test(text)) return { kind: 'deterministic', route: 'ping', lane: 'interactive', priority: 100, response: SIMPLE_RESPONSES.ping, normalized: text, source };
  if (/^(?:halo|hallo|hai|hi|hello)[!.]?$/.test(text)) return { kind: 'deterministic', route: 'greeting', lane: 'interactive', priority: 100, response: SIMPLE_RESPONSES.halo, normalized: text, source };
  if (/^(?:health|health[- ]?check|status|cek kesehatan|cek status)[?.! ]*$/.test(text)) return { kind: 'deterministic', route: 'health', lane: 'interactive', priority: 100, response: SIMPLE_RESPONSES.health, normalized: text, source };
  // A question about a technical topic is still a conversation. Topic words
  // alone must not wake a specialist or start a background workflow.
  const question = /^(?:arya[\s,:-]+)?(?:apa|apakah|bagaimana|gimana|kenapa|mengapa|bisakah|bolehkah|jelaskan|ceritakan|menurut(?:mu| kamu)|diskusikan|bahas)\b/i.test(text) || /[?？]$/.test(text);
  const action = /^(?:arya[\s,:-]+)?(?:tolong[\s,:-]+)?(?:buat|bikin|buatkan|susun|rancang|kerjakan|jalankan|mulai|bangun|kembangkan|implementasikan|tambahkan|perbaiki|ubah|audit|uji|optimalkan|tingkatkan)\b/i.test(text) || /\b(?:jalankan test|buat pull request|commit|deploy)\b/i.test(text);
  if (!question || action) {
    if (/(?:coding|kode|coding|debug|bug|repository|repo|javascript|typescript|python|api|implementasi|pull request|commit)/i.test(text)) return { kind: 'complex', route: 'coding', lane: 'coding', priority: 55, normalized: text, source, confidence: action ? 0.94 : 0.74 };
    if (/(?:meeting|rapat|notulen|agenda|peserta|keputusan rapat)/i.test(text)) return { kind: 'complex', route: 'meeting', lane: 'meeting', priority: 45, normalized: text, source, confidence: action ? 0.94 : 0.72 };
    if (/(?:proyek|project|kampanye|website|flyer|video|pengembangan|produksi|workflow|tugas tim)/i.test(text)) return { kind: 'complex', route: 'project', lane: 'background', priority: 35, normalized: text, source, confidence: action ? 0.92 : 0.68 };
  }
  return { kind: 'conversation', route: 'chat', lane: 'interactive', priority: 80, normalized: text, source, confidence: question ? 0.9 : 0.78 };
}

export function fastResponse(message, options) {
  const decision = classifyMessage(message, options);
  return decision.kind === 'deterministic' ? decision.response : null;
}

export const FAST_ROUTER_VERSION = '1.0';
