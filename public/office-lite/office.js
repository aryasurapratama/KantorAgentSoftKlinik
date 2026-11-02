import { createOfficeScene } from './scene.js';

const $ = id => document.getElementById(id);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const formatTime = value => new Intl.DateTimeFormat('id-ID', { timeZone:'Asia/Jakarta', hour:'2-digit', minute:'2-digit' }).format(new Date(value));
const statusNames = { bekerja:'Sedang bekerja', selesai:'Baru selesai', santai:'Siap menerima tugas' };
const taskNames = { queued:'Menunggu', running:'Dikerjakan', completed:'Selesai', failed:'Gagal' };
const chatIcon = '<svg viewBox="0 0 24 24"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5Z"/></svg>';
const canvas = $('office');
const stage = canvas.parentElement;
const context = canvas.getContext('2d');
const backdrop = document.createElement('canvas');
backdrop.id = 'room-backdrop';
backdrop.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
canvas.before(backdrop);
const background = backdrop.getContext('2d');
const artwork = document.createElement('canvas');
const labels = document.createElement('div');
labels.id = 'roomLabels';
stage.append(labels);
const tooltip = document.createElement('div');
tooltip.id = 'agentTooltip';
tooltip.hidden = true;
tooltip.setAttribute('role','status');
stage.append(tooltip);

let members = [], departments = [], people = [], scene, tasks = [], snapshot;
let focusedRoom = 'core', selected = null, hovered = null, query = '', lastSignature = '';
let paused = false;
try { paused = localStorage.getItem('harmes.lite.paused') === '1'; } catch {}
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = motionPreference.matches;
let width = 1, height = 1, pixelRatio = 1, baseScale = 1, scale = 1;
let zoom = 1, offsetX = 0, offsetY = 0, panX = 0, panY = 0;
let view = { x:0, y:0, width:1, height:1 }, pointer = null, dirty = true, backgroundDirty = true;
let lastFrame = 0, frames = 0, totalRenderMs = 0, lastRenderMs = 0, pollTimer, polling = false;

function post(action, extra = {}) { if (parent !== window) parent.postMessage({ source:'harmes-office', action, ...extra }, location.origin); else location.href = '/'; }
function assignmentName(id) { if (id === 'team') return 'Tim inti'; if (id?.startsWith('department:')) return departments.find(d => d.id === id.slice(11))?.name || 'Divisi'; return members.find(p => p.id === id)?.shortName || 'Tim'; }
function makePeople() {
  people = members.map((member, index) => {
    const station = scene.stations.get(member.id);
    if (!station) throw new Error(`Meja belum tersedia untuk ${member.name}.`);
    const start = index % 9 === 4 ? station.rest : station.home;
    return { ...member, index, ...station, x:start.x, y:start.y, state:'santai', phase:index * 1.71, walking:false, path:[], atRest:start === station.rest, nextMove:performance.now() + 14000 + index * 2300 };
  });
}
function walkTo(person, destination) {
  const towardHome = destination === 'home';
  const middle = towardHome ? [...person.waypoints].reverse() : person.waypoints;
  const target = towardHome ? person.home : person.rest;
  person.path = [...middle, target].map(point => ({ ...point }));
  person.atRest = !towardHome;
  if (reducedMotion || paused) { person.x = target.x; person.y = target.y; person.path = []; person.walking = false; }
}
function animatePeople(now, delta) {
  for (const person of people) {
    if (!paused && !reducedMotion && person.state === 'santai' && now > person.nextMove) {
      if (person.index % 5 === 0) walkTo(person, person.atRest ? 'home' : 'rest');
      person.nextMove = now + 27000 + person.index * 900;
    }
    let distanceBudget = delta * 52;
    while (person.path.length && distanceBudget > 0) {
      const target = person.path[0], dx = target.x - person.x, dy = target.y - person.y, distance = Math.hypot(dx,dy);
      if (distance <= distanceBudget || distance < .2) { person.x = target.x; person.y = target.y; person.path.shift(); distanceBudget -= distance; }
      else { person.x += dx / distance * distanceBudget; person.y += dy / distance * distanceBudget; distanceBudget = 0; }
    }
    person.walking = person.path.length > 0;
  }
}
function resize() {
  width = Math.max(1,stage.clientWidth); height = Math.max(1,stage.clientHeight); pixelRatio = Math.min(devicePixelRatio || 1,1.5);
  for (const surface of [canvas,backdrop]) { surface.width = Math.round(width * pixelRatio); surface.height = Math.round(height * pixelRatio); }
  layout();
}
function layout() {
  if (!scene) return;
  const area = $('sceneViewport').getBoundingClientRect(), origin = canvas.getBoundingClientRect();
  view = { x:area.left - origin.left, y:area.top - origin.top, width:Math.max(60,area.width), height:Math.max(80,area.height) };
  const bounds = scene.bounds; baseScale = Math.min(view.width / bounds.width,view.height / bounds.height); scale = baseScale * zoom;
  offsetX = view.x + view.width / 2 - (bounds.x + bounds.width / 2) * scale + panX;
  offsetY = view.y + view.height / 2 - (bounds.y + bounds.height / 2) * scale + panY;
  $('zoomValue').textContent = `${Math.round(zoom * 100)}%`; backgroundDirty = true; dirty = true; positionLabels();
}
function focusRoom(id) {
  focusedRoom = departments.some(d => d.id === id) ? id : 'core'; zoom = 1; panX = panY = 0; layout();
  const room = scene.rooms.find(r => r.id === focusedRoom);
  if (room) { zoom = Math.min(3.8,Math.max(1,Math.min(view.width / room.focus.width,view.height / room.focus.height) / baseScale * .88)); const center = { x:room.focus.x + room.focus.width / 2, y:room.focus.y + room.focus.height / 2 }; panX = (scene.bounds.x + scene.bounds.width / 2 - center.x) * baseScale * zoom; panY = (scene.bounds.y + scene.bounds.height / 2 - center.y) * baseScale * zoom; layout(); }
  $('departmentView').value = focusedRoom; $('viewLabel').textContent = room?.name || 'Seluruh kantor'; $('roomCount').textContent = room ? `${room.count} agen · divisi` : `${departments.length} divisi · ${people.length} agen`; $('roomTask').disabled = !room;
  document.querySelectorAll('[data-room]').forEach(button => { const active = button.dataset.room === focusedRoom; button.classList.toggle('active',active); button.setAttribute('aria-pressed',String(active)); }); populate();
}
function changeZoom(nextZoom, point = { x:view.x + view.width / 2, y:view.y + view.height / 2 }) { const before = { x:(point.x - offsetX) / scale, y:(point.y - offsetY) / scale }; zoom = Math.max(.65,Math.min(4.5,nextZoom)); layout(); panX += point.x - (before.x * scale + offsetX); panY += point.y - (before.y * scale + offsetY); layout(); }
function drawBackground() { background.setTransform(pixelRatio,0,0,pixelRatio,0,0); background.clearRect(0,0,width,height); background.save(); background.translate(offsetX,offsetY); background.scale(scale,scale); background.drawImage(artwork,0,0); background.restore(); backgroundDirty = false; }
function positionLabels() { if (!scene) return; for (const room of scene.rooms) { const node = document.querySelector(`[data-room-label="${room.id}"]`); if (!node) continue; const center = scene.project(room.x + room.w / 2,room.y + 35,58); const x = offsetX + center.x * scale, y = offsetY + center.y * scale; node.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`; node.hidden = x < 30 || x > width - 25 || y < 18 || y > height - 20; node.classList.toggle('active',focusedRoom === room.id); } }
function render(now) {
  requestAnimationFrame(render); if (document.hidden || !scene) return;
  const moving = people.some(person => person.walking || person.state === 'bekerja'), fps = moving ? 12 : 8;
  if (!dirty && (paused || reducedMotion || now - lastFrame < 1000 / fps)) return;
  const delta = Math.min((now - lastFrame) / 1000,.25) || .1; lastFrame = now; const started = performance.now();
  if (!paused && !reducedMotion) animatePeople(now,delta); if (backgroundDirty) drawBackground();
  context.setTransform(pixelRatio,0,0,pixelRatio,0,0); context.clearRect(0,0,width,height); context.save(); context.translate(offsetX,offsetY); context.scale(scale,scale);
  for (const person of [...people].sort((a,b) => a.x + a.y - b.x - b.y)) scene.drawActor(context,person,now / 1000,{ selected:person.id === selected, hovered:person.id === hovered, paused:paused || reducedMotion });
  context.restore(); dirty = false; lastRenderMs = performance.now() - started; frames++; totalRenderMs += lastRenderMs;
}
function populate() {
  const search = query.trim().toLocaleLowerCase('id-ID'); const filtered = people.filter(p => (focusedRoom === 'core' || p.departmentId === focusedRoom) && `${p.name} ${p.role} ${p.department} ${p.description}`.toLocaleLowerCase('id-ID').includes(search));
  $('memberCount').textContent = `${filtered.length}/${people.length}`;
  const html = filtered.map(person => `<button class="member ${escapeHTML(person.state)} ${selected === person.id ? 'selected' : ''}" data-chat="${escapeHTML(person.id)}" style="--color:${escapeHTML(person.color)}" title="${escapeHTML(person.name)} · ${escapeHTML(person.role)}"><span class="avatar">${escapeHTML(person.initials)}</span><strong>${escapeHTML(person.shortName)}</strong><span class="role">${escapeHTML(person.role)}</span><span class="member-state"><i></i>${escapeHTML(statusNames[person.state] || statusNames.santai)}</span><span class="chat-icon">${chatIcon}</span><span class="fullname">${person.virtual ? 'AI tambahan' : 'Profil tim website'} · ${escapeHTML(person.department)}</span></button>`).join('') || '<p class="no-members">Tidak ada agen yang cocok.</p>';
  if ($('roster').innerHTML !== html) $('roster').innerHTML = html;
}
function displayState(data) {
  const statuses = new Map([data.ketua,...data.team].map(person => [person.id,person]));
  for (const person of people) { const next = statuses.get(person.id)?.state || 'santai'; if (person.state !== next) { person.state = next; if (next === 'bekerja') walkTo(person,'home'); if (next === 'santai') person.nextMove = performance.now() + 12000 + person.index * 500; dirty = true; } }
  $('active').textContent = data.stats.active; $('total').textContent = people.length; $('live').classList.remove('off'); $('live').innerHTML = `<i></i> Terhubung · ${formatTime(data.now)}`;
  const working = people.filter(p => p.state === 'bekerja').map(p => p.shortName); $('phase').textContent = working.length ? `Sedang bekerja: ${working.join(', ')}` : 'Satu kantor. Banyak keahlian. Siap mengerjakan ide Anda.';
  const signature = JSON.stringify([people.map(p => [p.id,p.state]),data.feed,tasks]); if (signature === lastSignature) return; lastSignature = signature; populate();
  $('activityCount').textContent = data.feed.length; $('taskCount').textContent = tasks.length;
  $('feed').innerHTML = data.feed.length ? data.feed.slice(0,35).map(item => `<div class="feed-item"><span class="feed-avatar" style="--color:${escapeHTML(item.color)}">${escapeHTML(item.name.slice(0,1))}</span><div class="feed-text"><strong>${escapeHTML(item.name)}</strong><time>${formatTime(item.t)}</time><p>${escapeHTML(item.text)}</p></div></div>`).join('') : '<div class="empty"><strong>Kantor siap menerima ide.</strong><p>Percakapan dan perkembangan pekerjaan akan muncul di sini.</p></div>';
  $('tasks').innerHTML = tasks.length ? tasks.slice(0,35).map(task => `<button class="task" data-result="${escapeHTML(task.id)}"><span class="row"><strong>${escapeHTML(task.title)}</strong><span class="status ${escapeHTML(task.status)}">${taskNames[task.status] || 'Menunggu'}</span></span><small>${escapeHTML(assignmentName(task.agentId))} · ${formatTime(task.createdAt)}</small></button>`).join('') : '<div class="empty"><svg><use href="#i-task"/></svg><strong>Pekerjaan besar dimulai dari satu tugas.</strong><p>Ceritakan hasil yang Anda butuhkan.<br>Pilih agen atau kolaborasi divisi.</p><button data-action="task">Buat tugas pertama</button></div>';
}
async function poll() { clearTimeout(pollTimer); if (polling) return; polling = true; try { const [stateResponse,taskResponse] = await Promise.all([fetch('/api/office-state'),fetch('/api/state')]); if (!stateResponse.ok || !taskResponse.ok) throw new Error('Koneksi kantor terputus. Jalankan Mulai Desktop.cmd.'); snapshot = await stateResponse.json(); tasks = (await taskResponse.json()).tasks; displayState(snapshot); $('loadError').hidden = true; } catch (error) { $('live').classList.add('off'); $('live').innerHTML = '<i></i> Terputus'; $('loadError').textContent = error.message; $('loadError').hidden = false; } finally { polling = false; pollTimer = setTimeout(poll,document.hidden ? 15000 : 4000); } }
function setPanel(id, open) { for (const panel of document.querySelectorAll('.panel')) { if (panel.id === id || open) panel.classList.toggle('collapsed',panel.id !== id || !open); panel.setAttribute('aria-hidden',String(panel.classList.contains('collapsed'))); } for (const toggle of document.querySelectorAll('[data-toggle]')) toggle.setAttribute('aria-expanded',String(!$(toggle.dataset.toggle).classList.contains('collapsed'))); }
function openChat(id) { if (!members.some(member => member.id === id)) return; selected = id; dirty = true; populate(); setPanel('teamPanel',false); tooltip.hidden = true; post('chat',{ agentId:id }); }
function setMotion() { $('motion').textContent = paused ? 'Lanjut gerak' : 'Jeda gerak'; $('motion').setAttribute('aria-pressed',String(paused)); if (paused) for (const person of people) if (person.path.length) { const end = person.path.at(-1); person.x = end.x; person.y = end.y; person.path = []; person.walking = false; } try { localStorage.setItem('harmes.lite.paused',paused ? '1' : '0'); } catch {} dirty = true; }
function localPoint(event) { const rect = canvas.getBoundingClientRect(); return { x:event.clientX - rect.left, y:event.clientY - rect.top }; }
function hitPerson(point) { const x = (point.x - offsetX) / scale, y = (point.y - offsetY) / scale; return people.map(person => { const at = scene.project(person.x,person.y,17); return { person,distance:Math.hypot((x - at.x) * scale,(y - at.y) * scale) }; }).filter(hit => hit.distance < Math.max(9,17 * scale)).sort((a,b) => a.distance - b.distance)[0]?.person; }
function hoverAt(point) { const person = hitPerson(point), next = person?.id || null; if (next !== hovered) { hovered = next; dirty = true; } canvas.style.cursor = person ? 'pointer' : 'grab'; tooltip.hidden = !person; if (person) { tooltip.innerHTML = `<strong>${escapeHTML(person.shortName)}</strong><span>${escapeHTML(person.role)}</span><small>${escapeHTML(statusNames[person.state])} · Klik untuk diskusi</small>`; tooltip.style.left = `${Math.max(12,Math.min(width - 224,point.x + 16))}px`; tooltip.style.top = `${Math.max(12,Math.min(height - 90,point.y - 76))}px`; } }
document.addEventListener('click',event => { const action = event.target.closest('[data-action]'); if (action) post(action.dataset.action); const chat = event.target.closest('[data-chat]'); if (chat) openChat(chat.dataset.chat); const task = event.target.closest('[data-result]'); if (task) post('result',{ taskId:task.dataset.result }); const room = event.target.closest('[data-room]'); if (room && scene) focusRoom(room.dataset.room); const toggle = event.target.closest('[data-toggle]'); if (toggle) setPanel(toggle.dataset.toggle,$(toggle.dataset.toggle).classList.contains('collapsed')); });
$('departmentView').onchange = event => focusRoom(event.target.value); $('teamSearch').oninput = event => { query = event.target.value; populate(); }; $('roomTask').onclick = () => { if (focusedRoom !== 'core') post('task',{ agentId:`department:${focusedRoom}` }); }; $('motion').onclick = () => { paused = !paused; setMotion(); }; $('zoomIn').onclick = () => changeZoom(zoom * 1.22); $('zoomOut').onclick = () => changeZoom(zoom / 1.22); $('resetView').onclick = () => focusRoom('core');
canvas.addEventListener('pointerdown',event => { if (event.button !== 0) return; const point = localPoint(event); pointer = { ...point,startX:point.x,startY:point.y }; canvas.setPointerCapture(event.pointerId); canvas.classList.add('dragging'); tooltip.hidden = true; });
canvas.addEventListener('pointermove',event => { if (!scene) return; const point = localPoint(event); if (!pointer) { hoverAt(point); return; } panX += point.x - pointer.x; panY += point.y - pointer.y; pointer.x = point.x; pointer.y = point.y; layout(); });
canvas.addEventListener('pointerup',event => { if (!pointer || !scene) return; const point = localPoint(event); if (Math.hypot(point.x - pointer.startX,point.y - pointer.startY) < 5) { const person = hitPerson(point); if (person) openChat(person.id); else { const room = scene.hitRoom((point.x - offsetX) / scale,(point.y - offsetY) / scale); if (room) focusRoom(room.id); } } pointer = null; canvas.classList.remove('dragging'); });
canvas.addEventListener('pointercancel',() => { pointer = null; canvas.classList.remove('dragging'); }); canvas.addEventListener('pointerleave',() => { hovered = null; tooltip.hidden = true; dirty = true; }); canvas.addEventListener('dblclick',() => focusRoom('core')); canvas.addEventListener('wheel',event => { if (scene) { event.preventDefault(); changeZoom(zoom * Math.exp(-event.deltaY * .0012),localPoint(event)); } },{ passive:false });
document.addEventListener('keydown',event => { if (event.target.closest('input,textarea,select')) return; if (event.key === 'Home' || event.key === '0') { event.preventDefault(); focusRoom('core'); } if (event.key === 'Escape') for (const panel of document.querySelectorAll('.panel')) setPanel(panel.id,false); }); document.addEventListener('visibilitychange',() => { lastFrame = performance.now(); if (!document.hidden) { dirty = true; poll(); } }); motionPreference.addEventListener('change',event => { reducedMotion = event.matches; dirty = true; }); new ResizeObserver(resize).observe(stage);
try {
  const response = await fetch('/team.json'); if (!response.ok) throw new Error('Daftar tim tidak tersedia.'); const roster = await response.json(); members = roster.members; departments = roster.departments; if (!members?.length || !departments?.length) throw new Error('Daftar tim belum valid.');
  scene = createOfficeScene(members,departments); artwork.width = scene.width; artwork.height = scene.height; scene.drawStatic(artwork.getContext('2d')); makePeople();
  $('departmentView').innerHTML = '<option value="core">Seluruh kantor</option>' + departments.map(department => `<option value="${escapeHTML(department.id)}">${escapeHTML(department.name)}</option>`).join('');
  $('departmentNav').innerHTML = `<button data-room="core" style="--room-color:#426b59" aria-pressed="true"><span>Seluruh kantor</span><span>${people.length}</span></button>` + scene.rooms.map(room => `<button data-room="${escapeHTML(room.id)}" style="--room-color:${escapeHTML(room.color)}" aria-pressed="false"><span>${escapeHTML(room.name)}</span><span>${room.count}</span></button>`).join('');
  labels.innerHTML = scene.rooms.map(room => `<button class="room-label" data-room="${escapeHTML(room.id)}" data-room-label="${escapeHTML(room.id)}" style="--room-color:${escapeHTML(room.color)}" title="Fokus ${escapeHTML(room.name)}"><i></i>${escapeHTML(room.name)}<span>${room.count}</span></button>`).join('');
  $('teamSource').textContent = `${members.filter(p => !p.virtual).length} profil tim website + ${members.filter(p => p.virtual).length} spesialis AI tambahan.`;
  resize(); focusRoom('core'); setMotion(); requestAnimationFrame(render); poll();
} catch (error) { $('loadError').textContent = error.message; $('loadError').hidden = false; }
window.__officeLite = { actors:() => people.map(person => ({ id:person.id,departmentId:person.departmentId,visible:true,state:person.state,x:person.x,y:person.y,screen:scene.project(person.x,person.y),walking:person.walking,target:person.path.at(-1) || { x:person.x,y:person.y } })), rooms:() => scene?.rooms.map(room => ({ id:room.id,name:room.name,count:room.count,bounds:room.bounds })) || [], camera:() => ({ width,height,scale,offsetX,offsetY,zoom,viewport:view,bounds:scene?.bounds }), metrics:() => ({ frameCount:frames,lastRenderMs,averageRenderMs:frames ? totalRenderMs / frames : 0,pixels:width * height * pixelRatio ** 2,webgl:false,paused,room:focusedRoom,onstage:people.length,total:members.length }) };
