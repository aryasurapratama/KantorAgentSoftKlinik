// Adapted from humaedihume/kantor-agent (MIT). See ../LICENSE-kantor-agent.txt.
// Continuous campus: 35 data-backed agents, shared instanced low-poly geometry.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { officeFetch } from '../../api-client.js';
const $=id=>document.getElementById(id);
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
try {
// Every 3D entry point uses the same eight-division floor plan.
const {createCampus}=await import('./campus.js?v=8-divisions-only-7');
const data=await fetch('/team.json').then(r=>{if(!r.ok)throw Error('Roster tidak tersedia');return r.json()});
const roster=data.members, departments=data.departments;
let topView=false;let selected='all',paused=false,state=null,lastDraw=0,frames=0,renderMs=0,animationTime=0,frameCap=10,previousFrame=0;
const stats={calls:0,triangles:0};
function viewport(){const top=document.querySelector('header').getBoundingClientRect().bottom+18;let boundary=document.querySelector('nav').getBoundingClientRect().top;if(innerWidth<760)boundary=Math.min(boundary,$('architectureControls').getBoundingClientRect().top);const bottom=innerHeight-boundary+14;return {top,width:innerWidth,height:Math.max(180,innerHeight-top-bottom)}}
let view=viewport();
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1));renderer.setSize(view.width,view.height);renderer.domElement.style.cssText=`position:absolute;top:${view.top}px;left:0`;renderer.shadowMap.enabled=false;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.setClearColor('#1d2c26');$('scene').append(renderer.domElement);
renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','Kantor 3D interaktif. Pilih divisi melalui pemilih DIVISI. Home untuk reset, T tampak atas, L label, Spasi jeda, plus dan minus untuk zoom.');
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
const scene=new THREE.Scene();const camera=new THREE.OrthographicCamera(-40,40,30,-30,.1,900);
const environment=new RoomEnvironment(),generator=new THREE.PMREMGenerator(renderer);scene.environment=generator.fromScene(environment,.025).texture;environment.dispose();generator.dispose();scene.environmentIntensity=.35;
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minZoom=.5;controls.maxZoom=12;controls.minDistance=7;controls.maxDistance=600;controls.maxPolarAngle=Math.PI*.46;controls.minPolarAngle=.0001;
scene.add(new THREE.HemisphereLight('#fffdf7','#8d9a8d',.65));const sun=new THREE.DirectionalLight('#fff0d2',1.8);sun.position.set(-18,30,16);scene.add(sun);const fill=new THREE.DirectionalLight('#b9d8d0',.22);fill.position.set(22,16,-10);scene.add(fill);
// Furniture and walls remain static: compute their shadow map once per scene.
sun.castShadow=true;sun.position.set(-30,55,18);sun.target.position.set(0,0,8);scene.add(sun.target);sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-45,right:45,top:44,bottom:-44,near:.5,far:140});sun.shadow.bias=-.0001;sun.shadow.normalBias=.035;renderer.shadowMap.enabled=false;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
const materialCache=new Map();
function material(color){if(!materialCache.has(color))materialCache.set(color,new THREE.MeshLambertMaterial({color}));return materialCache.get(color)}
const dummy=new THREE.Object3D();
const campus=createCampus(THREE,scene,roster,departments),{rooms,homes}=campus;
const cb=campus.bounds;if(cb){const radius=Math.hypot(cb.maxX-cb.minX,cb.maxZ-cb.minZ)/2+8;sun.target.position.set((cb.minX+cb.maxX)/2,0,(cb.minZ+cb.maxZ)/2);sun.position.copy(sun.target.position).add(new THREE.Vector3(-radius,radius*1.7,radius*.6));Object.assign(sun.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:.5,far:radius*5});sun.shadow.camera.updateProjectionMatrix()}
const navigable=rooms;
for(const room of navigable) room.color=room.color||'#6c8b83';
const labelLayer=document.createElement('div');labelLayer.id='roomLabels';document.body.append(labelLayer);
const roomLabels=navigable.filter(room=>room.label!==false).map(room=>{const button=document.createElement('button');button.className='room-label';button.dataset.room=room.id;button.title=`Lihat ruang ${room.name}`;button.style.setProperty('--room-color',room.color);const name=document.createElement('span');name.textContent=room.name;const count=document.createElement('small');const n=roster.filter(m=>m.departmentId===room.id).length;count.textContent=n||'';count.hidden=!n;button.append(name,count);button.onclick=()=>focus(room.id);labelLayer.append(button);return{room,button,anchor:new THREE.Vector3(room.x-1,.25,room.z+(room.depth?room.depth/2+.8:4.6))}});
const sharedLabels=[...(campus.sharedSpaces||[]).map(s=>({...s,kind:'space'})),...(campus.wayfinding||[]).map(s=>({...s,kind:'wayfinding'}))].filter(s=>!navigable.some(r=>r.id===s.id||r.name===s.name)).map(({name,x,z,y,kind})=>{const label=document.createElement('div');label.className=`shared-label ${kind==='wayfinding'?'wayfinding-label':''}`;label.textContent=name;labelLayer.append(label);return {button:label,anchor:new THREE.Vector3(x,y||.2,z),kind}});
let labelsVisible=true;const projected=new THREE.Vector3();$('labelsToggle').onclick=()=>{labelsVisible=!labelsVisible;$('labelsToggle').setAttribute('aria-pressed',String(labelsVisible));};
function updateLabels(){
 const occupied=[],overview=selected==='all'&&camera.zoom<1.6;
 for(const item of [...roomLabels,...sharedLabels]){
  projected.copy(item.anchor).project(camera);
  const x=(projected.x+1)*view.width/2,y=(1-projected.y)*view.height/2;
  let hide=!labelsVisible||(selected!=='all'&&item.room?.id!==selected)||(!item.room&&overview)||projected.z>1||projected.z< -1||x<16||x>view.width-16||y<10||y>view.height-10;
  const width=item.button.offsetWidth||100,height=item.button.offsetHeight||30;
  if(!hide&&selected==='all'){
   hide=occupied.some(r=>Math.abs(x-r.x)<(width+r.width)/2+6&&Math.abs(y-r.y)<(height+r.height)/2+5);
   if(!hide)occupied.push({x,y,width,height});
  }
  item.button.hidden=hide;item.button.style.transform=`translate(-50%,-50%) translate(${x}px,${y+view.top}px)`;
 }
}

const actorParts=[['body',new THREE.BoxGeometry(.4,.53,.25),0,.97,0],['head',new THREE.SphereGeometry(.18,8,6),0,1.42,0],['hair',new THREE.BoxGeometry(.32,.13,.29),0,1.56,-.02],['leftArm',new THREE.BoxGeometry(.11,.45,.13),-.28,.98,0],['rightArm',new THREE.BoxGeometry(.11,.45,.13),.28,.98,0],['leftLeg',new THREE.BoxGeometry(.14,.5,.16),-.12,.43,0],['rightLeg',new THREE.BoxGeometry(.14,.5,.16),.12,.43,0]];
const actors=roster.map((m,i)=>({...m,key:i?'tim-'+(i-1):'ketua',home:homes.get(m.id)||{x:0,z:0},pos:{...(homes.get(m.id)||{x:0,z:0})},work:false,state:'santai',walking:false,path:[],nextWalk:2+i*.4,heading:Math.PI}));
const meshes=actorParts.map(([name,geo])=>{const mesh=new THREE.InstancedMesh(geo,material(name==='head'?'#d9ac8b':name==='hair'?'#3d4146':name.includes('Leg')?'#3f5665':'#ffffff'),actors.length);if(name==='body'||name.includes('Arm'))actors.forEach((a,i)=>mesh.setColorAt(i,new THREE.Color(a.color||'#44849b')));mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);scene.add(mesh);return mesh});
function updateActors(t,dt){actors.forEach((a,i)=>{
if(!paused&&!reduced){
 const room=rooms.find(r=>r.id===a.departmentId),aisle=room.x+5.6,front=room.z+6.3;
 if(a.work&&!a.returning&&Math.hypot(a.pos.x-a.home.x,a.pos.z-a.home.z)>.05){a.path=[{x:aisle,z:a.pos.z},{x:aisle,z:a.home.z+.45},{x:a.home.x,z:a.home.z+.45},{...a.home}];a.returning=true;}
 if(!a.work&&!a.path.length&&t>a.nextWalk){a.path=[{x:a.home.x,z:a.home.z+.45},{x:aisle,z:a.home.z+.45},{x:aisle,z:front},{x:room.x+3,z:front},{x:aisle,z:front},{x:aisle,z:a.home.z+.45},{x:a.home.x,z:a.home.z+.45},{...a.home}];a.nextWalk=t+40+i*.3;}
 a.walking=false;const target=a.path[0];if(target){const dx=target.x-a.pos.x,dz=target.z-a.pos.z,dist=Math.hypot(dx,dz),step=Math.min(dist,dt*.9);if(dist<.03){a.path.shift();if(!a.path.length)a.returning=false}else{a.pos.x+=dx/dist*step;a.pos.z+=dz/dist*step;a.heading=Math.atan2(dx,dz);a.walking=true}}
}
const stride=a.walking?Math.sin(t*10+i)*.4:0,typing=a.work&&!a.walking?Math.sin(t*8+i)*.08:0;
actorParts.forEach(([name,g,x,y,z],p)=>{const c=Math.cos(a.heading),sn=Math.sin(a.heading);dummy.position.set(a.pos.x+x*c+z*sn,y,a.pos.z-x*sn+z*c);dummy.scale.set(1,1,1);dummy.rotation.set(name.includes('Leg')?stride*(name==='leftLeg'?1:-1):name.includes('Arm')?(a.work&&!a.walking?-.8+typing:-stride):0,a.heading,0);dummy.updateMatrix();meshes[p].setMatrixAt(i,dummy.matrix)})});meshes.forEach(m=>m.instanceMatrix.needsUpdate=true)}
function fitView(room){
 const bounds=campus.bounds||{minX:-34,maxX:34,minZ:-20,maxZ:27,maxY:4};
 const target=new THREE.Vector3(room?.x??(bounds.minX+bounds.maxX)/2,.8,room?.z??(bounds.minZ+bounds.maxZ)/2),direction=(topView?new THREE.Vector3(0,1,.001):new THREE.Vector3(-1,Math.SQRT2,1)).normalize();
 const right=new THREE.Vector3(0,1,0).cross(direction).normalize(),up=direction.clone().cross(right).normalize();
 let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;const halfX=room?(room.width||14)/2:(bounds.maxX-bounds.minX)/2,halfZ=room?(room.depth||12)/2:(bounds.maxZ-bounds.minZ)/2;
 for(const x of [-halfX,halfX])for(const y of [-.8,(room?.maxY??bounds.maxY??4)-.8])for(const z of [-halfZ,halfZ]){const corner=new THREE.Vector3(x,y,z),cx=corner.dot(right),cy=corner.dot(up);minX=Math.min(minX,cx);maxX=Math.max(maxX,cx);minY=Math.min(minY,cy);maxY=Math.max(maxY,cy)}
 const aspect=view.width/view.height,halfHeight=Math.max((maxY-minY)/2,(maxX-minX)/2/aspect,room?8:0)*1.08;
 camera.top=halfHeight;camera.bottom=-halfHeight;camera.left=-halfHeight*aspect;camera.right=halfHeight*aspect;camera.zoom=1;camera.updateProjectionMatrix();
 target.addScaledVector(right,(maxX+minX)/2).addScaledVector(up,(maxY+minY)/2);
 controls.target.copy(target);camera.position.copy(target).addScaledVector(direction,140);controls.update();
}
function focus(id,updateUrl=true){selected=navigable.some(r=>r.id===id)?id:'all';$('roomSelector').value=selected;fitView(navigable.find(r=>r.id===selected));if(updateUrl){const url=new URL(location.href);url.searchParams.set('room',selected);history.replaceState({},'',url)}renderDirectory();const current=navigable.find(r=>r.id===selected);$('spaceInfo').hidden=!current;$('spaceName').textContent=current?.name||'';$('spaceDescription').textContent=current?.description||'Ruang kerja departemen';const count=roster.filter(m=>m.departmentId===selected).length;$('spaceFeatures').textContent=current?`${count} agen`:'';}
const allOption=new Option('Seluruh kantor','all');$('roomSelector').append(allOption);
for(const room of rooms)$('roomSelector').append(new Option(room.name,room.id));
$('roomSelector').onchange=e=>focus(e.target.value);$('roomCount').textContent=`${departments.length} divisi · ${roster.length} agen`;

function workspace(action,extra={}){if(parent!==window)parent.postMessage({source:'harmes-office',action,...extra},location.origin);else{const url=new URL('/',location.origin);if(action==='chat')url.searchParams.set('agent',extra.agentId);location.href=url.href;}}
const buttons=new Map();for(const actor of actors){const button=document.createElement('button');button.className='person';button.style.setProperty('--color',actor.color);const name=document.createElement('strong');name.textContent=actor.shortName;const role=document.createElement('small');role.textContent=actor.role;const status=document.createElement('em');status.textContent='Santai';button.append(name,role,status);button.onclick=()=>workspace('chat',{agentId:actor.id});buttons.set(actor.id,{button,status});$('directory').append(button)}
function renderDirectory(){const q=$('search').value.toLowerCase();for(const a of actors){const {button}=buttons.get(a.id);button.hidden=!(!rooms.some(r=>r.id===selected)||a.departmentId===selected)||!`${a.shortName} ${a.role}`.toLowerCase().includes(q)}}$('search').oninput=renderDirectory;
function resetView(){topView=false;$('topView').setAttribute('aria-pressed','false');focus('all')}
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>workspace(b.dataset.action,b.dataset.action==='task'&&rooms.some(r=>r.id===selected)?{department:selected,agentId:'department:'+selected}:{}));$('overview').onclick=resetView;$('resetView').onclick=resetView;$('quality').onchange=()=>{frameCap=$('quality').selectedIndex?20:10;renderer.setPixelRatio(Math.min(devicePixelRatio,frameCap===20?1.5:1));renderer.shadowMap.enabled=frameCap===20;renderer.shadowMap.needsUpdate=frameCap===20};$('pause').onclick=()=>{paused=!paused;$('pause').textContent=paused?'Lanjut animasi':'Jeda animasi'};
$('topView').onclick=()=>{topView=!topView;$('topView').setAttribute('aria-pressed',String(topView));fitView(navigable.find(r=>r.id===selected))};$('exportPng').onclick=()=>{renderer.render(scene,camera);const link=document.createElement('a');link.download='kantor-harmes.png';link.href=renderer.domElement.toDataURL('image/png');link.click()};
document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.target.isContentEditable||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;if(e.key==='Home'||e.key.toLowerCase()==='r'){e.preventDefault();resetView()}else if(!e.repeat&&e.key.toLowerCase()==='t'){$('topView').click()}else if(!e.repeat&&e.key.toLowerCase()==='l'){$('labelsToggle').click()}else if(!e.repeat&&e.code==='Space'){e.preventDefault();$('pause').click()}else if(e.key==='+'||e.key==='='){e.preventDefault();camera.zoom=Math.min(12,camera.zoom*1.15);camera.updateProjectionMatrix()}else if(e.key==='-'||e.key==='_'){e.preventDefault();camera.zoom=Math.max(.5,camera.zoom/1.15);camera.updateProjectionMatrix()}});
const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down;renderer.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(meshes)[0];if(hit&&actors[hit.instanceId])workspace('chat',{agentId:actors[hit.instanceId].id})});renderer.domElement.ondblclick=()=>focus('all');
async function poll(){try{const r=await officeFetch('/api/office-state',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);state=await r.json();const byId=new Map([state.ketua,...state.team].filter(Boolean).map(a=>[a.id,a]));for(const actor of actors){const live=byId.get(actor.id);actor.state=live?.state||'santai';actor.work=actor.state==='bekerja';if(actor.work&&!actor.walking)actor.heading=Math.PI;buttons.get(actor.id).status.textContent=actor.work?'Bekerja':actor.state==='selesai'?'Selesai':'Santai'}$('status').textContent=`Terhubung · ${actors.filter(a=>a.work).length} bekerja`;$('error').textContent='';$('tasks').replaceChildren();const todos=state.ketua?.todos?.items||[];if(!todos.length){const p=document.createElement('p');p.textContent='Belum ada tugas. Semua agen siap membantu.';$('tasks').append(p)}for(const todo of todos.slice(0,12)){const button=document.createElement('button');button.textContent=(todo.status==='completed'?'✓ ':todo.status==='in_progress'?'● ':'○ ')+todo.text;button.onclick=()=>workspace('result',{taskId:todo.taskId});$('tasks').append(button)}}catch(error){$('status').textContent='Koneksi terputus';$('error').textContent='Status belum tersedia; mencoba kembali.'}finally{setTimeout(poll,3000)}}
window.addEventListener('resize',()=>{view=viewport();renderer.setSize(view.width,view.height);renderer.domElement.style.top=`${view.top}px`;fitView(navigable.find(r=>r.id===selected))});
function frame(now){requestAnimationFrame(frame);if(document.hidden||now-lastDraw<1000/frameCap)return;const dt=Math.min((now-(previousFrame||now))/1000,.2);previousFrame=now;lastDraw=now;if(!paused)animationTime+=dt;updateActors(animationTime,dt);const started=performance.now();renderer.render(scene,camera);updateLabels();renderMs=performance.now()-started;frames++;stats.calls=renderer.info.render.calls;stats.triangles=renderer.info.render.triangles;}focus(new URLSearchParams(location.search).get('room')?.split(':')[0]||'all',false);poll();requestAnimationFrame(frame);$('loading').remove();
window.__kantor={building:()=>{const b=campus.bounds;const projectedCorners=[];if(b)for(const x of [b.minX,b.maxX])for(const y of [0,b.maxY||4])for(const z of [b.minZ,b.maxZ]){const p=new THREE.Vector3(x,y,z).project(camera);projectedCorners.push({x:(p.x+1)*view.width/2,y:(1-p.y)*view.height/2+view.top,z:p.z})}return{bounds:b,projectedCorners,viewport:{...view}}},stats:()=>({...stats,drawcalls:stats.calls,frames,renderMs,paused,pixelRatio:renderer.getPixelRatio(),shadows:renderer.shadowMap.enabled,shadowUpdates:'once',staff:roster.length,totalStaff:roster.length,onstage:actors.length,room:selected,frameCap}),actors:()=>actors.map(a=>({id:a.id,key:a.key,work:a.work,state:a.state,walking:a.walking,pos:[a.pos.x,0,a.pos.z],home:a.home})),spaces:()=>navigable.map(s=>({...s})),rooms:()=>rooms.map(r=>({id:r.id,name:r.name,x:r.x,z:r.z,width:r.width,depth:r.depth,members:roster.filter(m=>m.departmentId===r.id).map(m=>m.id)})),camera:()=>({position:camera.position.toArray(),target:controls.target.toArray()}),screen:id=>{const actor=actors.find(a=>a.id===id);if(!actor)return null;const p=new THREE.Vector3(actor.pos.x,1.1,actor.pos.z).project(camera);return{x:(p.x+1)*view.width/2,y:(1-p.y)*view.height/2+view.top}}};

} catch(error){const loading=$('loading');loading.replaceChildren();const box=document.createElement('div');const p=document.createElement('p');p.textContent='Kantor 3D belum tersedia di perangkat ini.';const button=document.createElement('button');button.textContent='Buka 2D Ringan';button.onclick=()=>{if(parent!==window)parent.postMessage({source:'harmes-office',action:'lite'},location.origin);else location.href='/?mode=lite'};box.append(p,button);loading.append(box);console.warn('Kantor 3D:',error.message);}
