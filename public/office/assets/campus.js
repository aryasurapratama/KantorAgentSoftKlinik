import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSurfaces } from './surfaces.js';
// Roofless architectural model. Static furniture shares instanced geometry.
export function createCampus(THREE, scene, roster, departments) {
  const palette = {
    ivory: '#f3f0e9', wall: '#d8d1c3', frame: '#283332', wood: '#c6aa82',
    oak: '#d7bd95', dark: '#283332', sage: '#7c8069', glass: '#b7dce7',
  };
  const rooms = departments.map((d, i) => ({
    ...d, x: -24 + (i % 4) * 16, z: -12 + Math.floor(i / 4) * 16,
    width: 14, depth: 11,
    color: ['#858176', '#777f72', '#8d7a6f', '#8a816b', '#7c8074', '#8d8276', '#7e8067', '#717a7c'][i],
  }));
  const homes = new Map(), groups = new Map(), shadows = [];
  const surfaces = createSurfaces(THREE);
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    soft: new RoundedBoxGeometry(1, 1, 1, 2, .08),
    round: new THREE.CylinderGeometry(.5, .5, 1, 12),
    leaf: new THREE.IcosahedronGeometry(.5, 1),
    wheel: new THREE.CylinderGeometry(.5,.5,1,12).rotateX(Math.PI/2),
  };
  const frond = new THREE.BufferGeometry(), vertices=[], indices=[];
  for(let i=0;i<=6;i++){const t=i/6,width=Math.sin(Math.PI*t)*.17+.007;vertices.push(t,Math.sin(Math.PI*t)*.46,width,t,Math.sin(Math.PI*t)*.46,-width);if(i<6){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3)}}
  frond.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));frond.setIndex(indices);frond.computeVertexNormals();geometries.frond=frond;
  function part(shape, x, y, z, w, h, d, color, rotation = 0) {
    const key = `${shape}:${color}`;
    if (!groups.has(key)) groups.set(key, { shape, color, parts: [] });
    groups.get(key).parts.push({ x, y, z, w, h, d, rotation });
  }
  const box = (...args) => part('box', ...args);
  const soft = (...args) => part('soft', ...args);
  const round = (...args) => part('round', ...args);
  const shadow = (x, z, w, d) => shadows.push([x, z, w, d]);
  function plant(x, z, large = false) {
    const s = large ? 1.3 : 1;
    round(x, .3 * s, z, .65 * s, .6 * s, .65 * s, '#e8e7df');
    round(x, .61 * s, z, .54 * s, .05, .54 * s, '#6e7566');
    round(x, .95 * s, z, .07, .7 * s, .07, '#8a8465');
    for(let i=0;i<8;i++)part('frond',x,1.25*s,z,1.1*s,.9*s,1.1*s,i%2?'#7f9b59':'#4f734d',i*Math.PI/4);
    part('leaf', x, 1.33 * s, z, .23 * s, .55 * s, .23 * s, '#608a73');
    shadow(x, z, 1.5 * s, 1.5 * s);
  }
  function chair(x, z, facing = 0, color = '#62827b') {
    round(x, .12, z, .55, .06, .55, '#87958c');
    round(x, .3, z, .1, .4, .1, '#87958c');
    box(x, .52, z, .7, .18, .67, color);
    const sign = facing === 0 ? 1 : -1;
    box(x, .85, z + sign * .3, .7, .65, .12, color);
  }
  function coffeeTable(x, z, size = 1.2) {
    round(x, .5, z, .5, 1, .5, '#b99d79');
    round(x, .6, z, size, .12, size, palette.oak);
    round(x + .2, .72, z, .17, .16, .17, '#e8e7df');
    shadow(x, z, size + .5, size + .5);
  }
  function sofa(x, z, width = 3.4, color = '#638d7e', facing = 0) {
    const sign = facing === 0 ? -1 : 1;
    box(x, .22, z, width - .3, .3, 1.15, '#9c8e75');
    soft(x, .51, z, width, .4, 1.35, color);
    soft(x, .9, z + sign * .55, width, .85, .25, color);
    box(x - width / 2 + .13, .73, z, .26, .65, 1.4, color);
    box(x + width / 2 - .13, .73, z, .26, .65, 1.4, color);
    for (let i = 0; i < 3; i++) box(x - width / 3 + i * width / 3, .74, z, width / 3 - .12, .08, 1, '#b2c4b1');
    shadow(x, z, width + .8, 2.1);
  }
  function cabinet(x, z, width = 3) {
    box(x, .57, z, width, 1.14, .7, palette.oak);
    box(x, 1.18, z, width + .1, .08, .8, palette.ivory);
    for (let i = -.5; i <= .5; i += .5) box(x + width * i * .6, .62, z + .36, .025, .85, .025, '#b99d79');
    round(x - width * .27, 1.32, z, .28, .26, .28, '#e8e7df');
    part('leaf', x - width * .27, 1.57, z, .55, .55, .55, '#608a73');
  }
  function board(x, z, color) {
    box(x, 1.85, z, 4.4, 1.65, .1, palette.frame);
    box(x, 1.85, z + .07, 4.22, 1.48, .05, '#f6f5ef');
    for (let i = 0; i < 6; i++) box(x - 1.4 + (i % 3) * .65, 2.18 - Math.floor(i / 3) * .4, z + .11, .45, .26, .03, i % 2 ? color : palette.oak);
    box(x + 1.15, 1.63, z + .11, .45, .7, .03, color);
    box(x + 1.75, 1.78, z + .11, .35, 1, .03, color);
  }
  function desk(member, x, z, accent) {
    homes.set(member.id, { x, z: z + 1 });
    shadow(x, z + .2, 3.1, 2.3);
    soft(x, .79, z, 2.25, .13, 1.15, palette.ivory);
    box(x - .96, .41, z, .09, .78, .8, palette.ivory);
    box(x + .96, .41, z, .09, .78, .8, palette.ivory);
    box(x, .28, z - .35, 1.92, .08, .08, palette.frame);
    box(x, 1.3, z - .22, .99, .63, .09, palette.dark);
    box(x, 1.3, z - .16, .88, .51, .025, '#7db5b6');
    box(x - .22, 1.32, z - .14, .025, .29, .015, '#bed5d0');
    box(x + .15, 1.17, z - .14, .48, .025, .015, '#bed5d0');
    box(x, 1, z - .22, .06, .35, .06, palette.frame);
    box(x, .88, z + .22, .7, .035, .25, '#e8e7df');
    round(x + .83, .97, z + .22, .16, .22, .16, palette.ivory);
    box(x - .82, .88, z + .14, .2, .04, .3, accent);
    chair(x, z + 1.05);
  }

  // One broad floor plate, generous promenades, a warm timber facade.
  box(0, -.36, 3, 67, .7, 47, '#a3b1aa');
  box(0, -.015, 3, 66.5, .06, 46.5, palette.ivory);
  box(0, .035, -4, 65, .035, 5, '#e1e4dc');
  box(0, .035, 12, 65, .035, 4.5, '#e1e4dc');
  for (const z of [-6.28, -1.72, 10, 14]) box(0, .06, z, 65, .02, .055, '#c8cdbe');
  box(0, 1.7, -19, 66.5, 3.4, .2, palette.wall);
  box(-33, .55, 3, .18, 1.1, 46, palette.wall);
  box(33, .55, 3, .18, 1.1, 46, palette.wall);
  // Warm timber canopy and recessed entrance rhythm.
  box(0, 3.25, -18.45, 66, .16, 1.1, palette.oak);
  for (let x = -30; x <= 30; x += 4) {
    box(x, 2, -18.84, 3.6, 2.5, .08, '#a6c5c7');
    box(x + 1.87, 2, -18.76, .09, 2.6, .1, palette.frame);
    box(x, .7, -18.65, 3.9, .12, .42, palette.oak);
  }
  for (const z of [-4, 12]) for (const x of [-16, 0, 16]) {
    box(x, .34, z, 3.5, .65, .85, palette.ivory);
    box(x, .69, z, 3.25, .08, .65, '#7c8770');
    for (const dx of [-1.1, 0, 1.1]) part('leaf', x + dx, 1.05, z, 1, .85, .8, '#82a28a');
    shadow(x, z, 4.5, 1.8);
  }

  for (const room of rooms) {
    const { x, z, color } = room;
    // Light oak perimeter, muted carpet work zone. Every room is 14 by 11.
    box(x, .045, z, 14, .07, 11, '#e0d0b4');
    for (let line = -5; line <= 5; line++) box(x, .084, z + line, 13.9, .006, .025, '#d1bea1');
    box(x - .6, .09, z - 1.3, 11.5, .04, 6.9, color);
    box(x, 1.4, z - 5.5, 14, 2.8, .16, '#48483f');
    box(x, .23, z - 5.35, 13.8, .35, .16, palette.oak);
    board(x - 2.9, z - 5.35, color);
    for (let slat = 0; slat < 15; slat++) box(x + 1.6 + slat * .28, 1.5, z - 5.34, .09, 2.55, .12, palette.oak);
    for (const side of [-1, 1]) {
      box(x + side * 7, .16, z, .12, .32, 11, palette.wall);
      box(x + side * 7, 1.45, z, .055, 2.25, 11, palette.glass);
      box(x + side * 7, 2.62, z, .09, .09, 11, palette.frame);
      for (const dz of [-5.5, -1.8, 1.8, 5.5]) box(x + side * 7, 1.45, z + dz, .09, 2.4, .07, palette.frame);
    }
    // Clear three-unit entry on the right; open door swing.
    box(x - 1.5, 1.4, z + 5.5, 11, 2.3, .055, palette.glass);
    box(x - 1.5, .16, z + 5.5, 11, .28, .1, palette.wall);
    box(x - 1.5, 2.62, z + 5.5, 11, .09, .1, palette.frame);
    for (const dx of [-7, -3.4, .3, 4]) box(x + dx, 1.45, z + 5.5, .07, 2.4, .09, palette.frame);
    box(x + 5.9, .09, z + 5.5, 2.4, .035, 1, '#c8cdbe');
    const members = roster.filter(m => m.departmentId === room.id);
    members.forEach((m, i) => desk(m, x - 5 + (i % 4) * 2.9, z - 3.25 + Math.floor(i / 4) * 3.8, color));
    plant(x + 6, z - 4.45);
    if (members.length <= 4) {
      box(x - 1.2, .105, z + 2.2, 7, .035, 4, '#ede9de');
      sofa(x - 1.9, z + .5, 3.7, room.id === 'leadership' ? '#7b8d9d' : palette.sage);
      coffeeTable(x - 1.9, z + 2.4, 1.4);
      chair(x + 1, z + 2.45, Math.PI, '#ac9579');
      cabinet(x - 5.5, z + 3.6, 2.2);
      plant(x + 2.7, z + 4.4);
    } else {
      cabinet(x - 4.4, z + 4, 3.2);
      plant(x + 2.5, z + 4.2);
      if (room.id === 'creative') {
        // Camera stand beside the creative team's open studio area.
        box(x - 6.1, .85, z + 2.6, .07, 1.6, .07, palette.dark);
        box(x - 6.1, 1.75, z + 2.6, .5, .4, .35, palette.dark);
        round(x - 6.1, .13, z + 2.6, .65, .07, .65, palette.dark);
      }
    }
  }

  const spaces=[],circulation=[];
  // One connected headquarters floor: public south, staff centre, restricted north.
  box(0,-.42,-14,108,.7,116,'#a3b1aa');box(0,-.04,-14,107,.05,115,palette.ivory);
  for(const z of [-68,-52,-36,-20,-4,12,16,32]){box(0,.02,z,104,.025,3.8,'#dce1d9');circulation.push({name:'Koridor '+z,x:0,z,width:104,depth:3.8});}
  for(const x of [-50,-32,32,50]){box(x,.025,-14,2.5,.025,112,'#dce1d9');circulation.push({name:'Koridor samping',x,z:-14,width:2.5,depth:112});}
  function monitor(x,z,w=1.2){box(x,1.4,z,w,.8,.1,palette.frame);box(x,1.4,z+.06,w-.1,.67,.02,'#86a5a5');box(x,1,z,.07,.6,.1,palette.frame);}
  function bench(x,z,w=3,d=1.2){soft(x,.8,z,w,.13,d,palette.oak);for(const dx of [-w/2+.15,w/2-.15])box(x+dx,.4,z,.1,.8,d-.1,palette.frame);}
  function suite(id,name,x,z,width,depth,zone,kind='office',label=true){
    const entry={x:x+width/2-1.5,z:z+depth/2};
    const p={id,name,x,z,width,depth,zone,entry,label,description:name+' dengan pintu ke koridor.',features:[]};spaces.push(p);
    const tint={research:'#b6c6c5',robotics:'#c8bd9b',technical:'#a2b1af',executive:'#c3b095',creative:'#c0b3bf',wellness:'#bfcbb7',public:'#ddd4c3',operations:'#c4c8be'}[zone]||'#c6ccbe';
    box(x,.065,z,width-.1,.08,depth-.1,tint);box(x,1.35,z-depth/2,width,2.7,.15,palette.wall);
    for(const side of [-1,1]){box(x+side*width/2,1.3,z,.06,2.6,depth,palette.glass);box(x+side*width/2,2.65,z,.09,.09,depth,palette.frame);}
    // South wall ends 3 metres before the right edge, leaving a real doorway.
    box(x-1.5,1.3,z+depth/2,width-3,2.6,.06,palette.glass);box(x-1.5,2.65,z+depth/2,width-3,.09,.1,palette.frame);
    box(entry.x,.09,entry.z,2.4,.05,.65,palette.oak);box(x+width/2,1.3,entry.z,.1,2.6,.15,palette.frame);
    box(x-width/2+.8,1.8,entry.z+.05,1.2,.35,.04,palette.dark);box(x,2.64,z-depth/2+.13,width-.5,.035,.08,'#f4cf87');
    const back=z-depth/2+1;
    if(kind==='office'||kind==='lab'){
      for(const dx of [-width/2+2,0]){bench(x+dx,z-1,2.1,1);monitor(x+dx,z-1.3);chair(x+dx,z);}
      cabinet(x-width/2+2.4,back,3.5);
      if(kind==='lab'){bench(x-1,z+2,4,1.1);for(let j=0;j<3;j++){box(x-2+j,1.1,z+2,.5,.5,.45,palette.ivory);box(x-2+j,1.4,z+2,.3,.08,.3,palette.frame);}p.features=['Workstation riset','Meja instrumen','Penyimpanan laboratorium'];}else plant(x-width/2+1,z+depth/2-1);
    }else if(kind==='meeting'){
      bench(x-1,z,Math.min(width-4,7),2);for(let i=0;i<3;i++){chair(x-3+i*1.7,z-1.6,Math.PI);chair(x-3+i*1.7,z+1.6);}monitor(x-1,z-depth/2+.15,4);
    }else if(kind==='lounge'){
      sofa(x-1,z-1.5,Math.min(width-4,5),palette.sage);coffeeTable(x-1,z+.7,1.6);plant(x-width/2+1,z+depth/2-1);
    }else if(kind==='server'){
      for(const dx of [-3.8,-1.5,.8])for(const dz of [-2,1.1]){box(x+dx,1.3,z+dz,1.3,2.6,1.5,'#3a4949');for(let i=0;i<10;i++){box(x+dx,.3+i*.22,z+dz+.77,1.1,.12,.035,'#73807d');box(x+dx+.43,.3+i*.22,z+dz+.8,.04,.04,.03,'#adc3ac');}}
      box(x-1.5,2.9,z,7,.1,.5,palette.frame);box(x+width/2-1,2.3,back,.6,.7,.5,'#ae6d60');p.features=['Rak komputasi kompak','Lorong dingin dan panas','Tray kabel','Pemadaman gas','Akses terbatas'];
    }else if(kind==='robot'){
      bench(x-width/2+2.5,back+1,3.5,1.2);box(x-1,.16,z+.5,width-5,.08,depth-4,'#929b91');
      for(const dz of [-2,3])box(x-1,.22,z+dz,width-4,.035,.15,'#d8c578');
      for(const dx of [-width/2+1,width/2-3]){box(x+dx,1,z+.5,.06,1.8,5,palette.glass);box(x+dx,1.95,z+.5,.1,.08,5,palette.frame);}
      round(x-1,.55,z,1.3,.9,1.3,palette.frame);box(x-1,1.25,z,.35,1,.35,palette.ivory);box(x-.45,1.8,z,1.4,.3,.3,palette.oak);box(x+.2,1.5,z,.2,.5,.2,palette.frame);p.features=['Sel uji terlindung','Marka keselamatan','Bangku kerja robotik'];
    }else if(kind==='utility'){
      for(const dx of [-width/2+1.7,0]){box(x+dx,1,z-1,1.8,2,1.4,'#a1aaa4');for(let j=0;j<6;j++)box(x+dx,.5+j*.2,z-.28,1.4,.07,.03,palette.frame);}box(x,2.5,back,width-1,.4,.5,palette.ivory);
    }else if(kind==='studio'){
      for(let j=0;j<10;j++)box(x-width/2+.7+j*.65,1.5,z-depth/2+.12,.35,2.3,.12,'#7f767b');bench(x-1,z,3,1.4);monitor(x-1,z-.4,2);chair(x-2,z+1.3);chair(x,z+1.3);
      for(const dx of [-width/2+1,width/2-3]){round(x+dx,.1,z+1,.8,.1,.8,palette.frame);box(x+dx,1.1,z+1,.06,2.2,.06,palette.frame);box(x+dx,2.1,z+1,.7,.6,.3,palette.ivory);}round(x-1,1.7,z+.1,.15,.3,.15,palette.frame);
    }else if(kind==='classroom'){
      for(let r=0;r<3;r++)for(let c=0;c<3;c++){let tx=x-width/2+2+c*2.6,tz=z-depth/2+3+r*2;bench(tx,tz,1.8,.7);chair(tx,tz+.7);}monitor(x,z-depth/2+.15,5);
    }else if(kind==='care'){
      box(x-1,.5,z,1.6,.6,3.1,palette.ivory);soft(x-1,.87,z,1.6,.18,3,'#dfe3d6');soft(x-1,1,z-1,.9,.2,.5,palette.ivory);cabinet(x-width/2+1.8,back,2.2);chair(x+1,z);
    }else if(kind==='wc'){
      round(x-1,.5,z-.7,.8,.8,1.1,palette.ivory);box(x-1,.9,z-1,.7,.7,.25,palette.ivory);cabinet(x-1,z+1.5,2);box(x-2,.9,z,.07,.1,1.7,palette.frame);
    }
    return p;
  }
  const labs=['Riset AI','Machine Learning','Deep Learning','AI Generatif','Pemrosesan Bahasa','Visi Komputer','AI Multimodal','Pelatihan Model','Evaluasi & Benchmark','AI Terapan','Algoritma AI','Sistem Otonom'];
  labs.forEach((n,i)=>suite('lab-'+i,n,-40+i%6*16,-44+Math.floor(i/6)*16,14,11,'research','lab'));
  [['robotics','Laboratorium Robotik','robot'],['robot-test','Uji Robot Otonom','robot'],['iot','IoT & Prototipe Elektronik','lab'],['gpu','GPU Compute Room','server'],['server','Server & Jaringan','server'],['ups','UPS & Pendingin Presisi','utility']].forEach(([id,n,k],i)=>suite(id,n,-40+i*16,-60,14,11,i<3?'robotics':'technical',k));
  [['ceo','Kantor CEO',-12,'office'],['chief','CTO & Kepala Ilmuwan',4,'office'],['board','Ruang Dewan Direksi',20,'meeting'],['academy','Akademi & Perpustakaan',36,'classroom']].forEach(([id,n,z,k])=>suite(id,n,-41,z,14,11,id==='academy'?'corporate':'executive',k));
  [['soc','SOC & Keamanan Siber',-12,'office','technical'],['noc','NOC, MLOps & Cloud',4,'office','technical'],['media','Studio Video & Foto',20,'studio','creative'],['audio','Podcast & Pascaproduksi',36,'studio','creative']].forEach(([id,n,z,k,zone])=>suite(id,n,41,z,14,11,zone,k));
  suite('auditorium','Auditorium & Pelatihan',-24,24,14,11,'public','classroom');suite('visitor','Lounge Tamu',-8,24,14,11,'public','lounge');suite('cafe','Lounge & Kafe',8,24,14,11,'wellness','lounge');suite('innovation','Hub Inovasi & Rapat',24,24,14,11,'corporate','meeting');
  cabinet(8,19.6,8);box(8,1.25,19.6,8,.1,1.2,palette.frame);box(5.5,1.65,19.6,1,.7,.7,palette.frame);
  [['musala','Musala',-26,'lounge'],['aid','Pertolongan Pertama',-18,'care'],['nursing','Ruang Laktasi',18,'care'],['wc','Toilet Aksesibel',26,'wc']].forEach(([id,n,x,k])=>suite(id,n,x,38,6,7,'wellness',k));
  // Central lobby: direct public approach; employee screening lane on the east.
  spaces.push({id:'lobby',name:'Lobi & Resepsionis',x:0,z:38,width:26,depth:8,zone:'public',description:'Lobi tinggi ganda dengan registrasi dan pintu geser.',features:['Registrasi tamu','RFID karyawan','Biometrik','CCTV'],entry:{x:0,z:44},label:true});
  soft(-5,.7,37,6.5,1.3,1.7,palette.ivory);box(-5,1.4,37,6.7,.12,1.9,palette.oak);monitor(-5,36.7);box(-5,2.7,34,7,1.4,.16,palette.frame);
  suite('security','Pos Keamanan',-8,31,5,3.5,'public','none',false);bench(-8,31,3,.8);monitor(-8,30.7,1.7);
  for(const x of [-12,12]){box(x,3,40,.45,6,.45,palette.wall);plant(x,42,true);}
  // Sliding leaves park outside a clear 3.2 m entry opening.
  for(const x of [-3,3]){box(x,1.9,44,2.7,3.8,.06,palette.glass);box(x,3.85,44,2.8,.1,.1,palette.frame);}
  box(0,5.8,47,25,.22,8,palette.oak);for(const x of [-11,11])box(x,2.9,49,.2,5.8,.2,palette.frame);
  box(0,-.08,48,27,.24,8,palette.ivory);
  for(let i=0;i<12;i++)box(0,-.25+i*.015,53-i*.4,6,.08,.44,palette.ivory);
  box(0,-.35,57,120,.15,8,'#606a66');for(let i=0;i<7;i++)box(0,-.25,54.5+i*.4,6,.025,.18,palette.ivory);
  for(const x of [-32,32]){box(x,-.22,52,22,.06,5,'#c0c7bc');for(let j=0;j<5;j++)box(x-9+j*4.5,-.17,52,.08,.025,4.6,palette.ivory);}
  function car(x,z,c){soft(x,.6,z,1.8,.7,3.8,c);soft(x,.98,z-.15,1.6,.6,2,palette.glass);for(const dx of [-.95,.95])for(const dz of [-1.1,1.1])box(x+dx,.3,z+dz,.18,.55,.6,palette.frame);}
  car(-37,52,'#e6e6df');car(-28,52,'#71827e');car(34,52,'#b6b5ad');
  // Service edge: rear rooms, loading, exterior egress and dedicated equipment access.
  [['store','Gudang Peralatan'],['maintenance','HVAC & Pemeliharaan'],['waste','Pengelolaan Limbah']].forEach(([id,n],i)=>suite(id,n,-40+i*16,-73,14,7,'operations','utility',false));
  box(-24,-.42,-73,50,.7,12,'#a3b1aa');box(-24,-.04,-73,50,.05,12,palette.ivory);box(25,-.1,-73,42,.1,10,'#a1aaa0');
  for(const x of [-53,53])for(let z=-65;z<=41;z+=4){box(x,.25,z,.18,.5,3.8,palette.wall);box(x,1.8,z,.055,2.5,3.8,palette.glass);box(x,1.8,z-2,.12,3.6,.12,palette.frame);}
  // Restricted north wing has a cross-wall; controlled doors align with staff corridors.
  for(const x of [-41,-16,16,41])box(x,1.3,-20,Math.abs(x)===41?15:29,2.6,.06,palette.glass);
  for(const x of [-32,0,32]){for(const dx of [-1.2,1.2]){box(x+dx,.7,-20,.3,1.4,.9,palette.frame);box(x+dx,1.43,-20,.23,.06,.35,'#84a38c');}box(x,2.5,-20,2.2,.3,.1,palette.frame);}
  // Side promenades also cross the restricted threshold only through controlled gates.
  for(const x of [-50,50]){for(const dx of [-.9,.9]){box(x+dx,1.3,-20,.7,2.6,.08,palette.glass);box(x+dx,.7,-20,.18,1.4,.55,palette.frame);}box(x,2.5,-20,2.2,.28,.1,palette.frame);box(x,1.7,-20,.08,1.25,.08,'#c5a667');}
  for(const x of [5,7,9]){box(x,.7,34,.3,1.4,1,palette.frame);box(x,1.45,34,.22,.08,.4,'#84a38c');}
  for(const x of [-50,50])for(const z of [-65,40]){spaces.push({id:'exit-'+x+'-'+z,name:'Pintu Darurat',x,z,width:3,depth:3,zone:'operations',entry:{x,z:z+1.5},label:false,description:'Pintu keluar langsung ke jalur luar.'});box(x,2.5,z,1,.35,.1,'#799a83');box(x-1,1,z,.3,.75,.25,'#b46d60');}
  for(const x of [-59,59])for(const z of [-62,-44,-24,0,24,42]){box(x,.15,z,4,.3,5,'#b2bba4');plant(x,z,true);part('leaf',x,3.1,z,3.2,3.7,3.1,'#769174');}
  box(-55,.02,23,6,.13,29,'#a08a6b');for(const z of [15,24,33]){coffeeTable(-55,z,1.6);chair(-55,z+1.4);chair(-55,z-1.4,Math.PI);}
  const dummy = new THREE.Object3D();
  for (const { shape, color, parts } of groups.values()) {
    const glass = color === palette.glass;
    const map = color === palette.ivory ? surfaces.marble : color === palette.oak ? surfaces.wood : color === palette.frame ? surfaces.stone : rooms.some(room => room.color === color) ? surfaces.carpet : null;
    const material = color === '#f4cf87' ? new THREE.MeshBasicMaterial({ color,toneMapped:false }) : new THREE.MeshStandardMaterial({ color: map && !rooms.some(r=>r.color===color) ? '#ffffff' : color, map, roughness: color===palette.ivory?.36:color===palette.frame?.42:.78,metalness:color===palette.frame?.2:0,transparent:glass,opacity:glass?.12:1,depthWrite:!glass });
    const mesh = new THREE.InstancedMesh(geometries[shape], material, parts.length);
    material.side=shape==='frond'?THREE.DoubleSide:THREE.FrontSide;
    mesh.castShadow=!glass&&color!=='#f4cf87';mesh.receiveShadow=!glass&&color!=='#f4cf87';
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, p.rotation, 0); dummy.scale.set(p.w, p.h, p.d); dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    scene.add(mesh);
  }
  function panel(map, x, y, z, width, height, rotation = 0) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
    mesh.position.set(x, y, z); mesh.rotation.y = rotation; scene.add(mesh);
  }
  for (const room of rooms) panel(surfaces.screen, room.x - 2.9, 1.85, room.z - 5.18, 4.15, 1.4);
  panel(surfaces.brand, 0, 2.05, 14.81, 7.8, 2.9);
  panel(surfaces.brand, 26, 1.3, 31.02, 8.2, 2.15);
  panel(surfaces.screen, -25, 1.94, 14.67, 5.3, 1.42);
  panel(surfaces.wallArt, -12, 1.85, 14.65, 4.6, 2.5);
  const warmth=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:surfaces.glow,transparent:true,opacity:.25,depthWrite:false}),rooms.length*2);
  rooms.forEach((room,i)=>{dummy.position.set(room.x,.14,room.z-3.2);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.set(14,6,1);dummy.updateMatrix();warmth.setMatrixAt(i*2,dummy.matrix);dummy.position.set(room.x,2.65,room.z-5.38);dummy.rotation.set(0,0,0);dummy.scale.set(14,1.5,1);dummy.updateMatrix();warmth.setMatrixAt(i*2+1,dummy.matrix)});scene.add(warmth);
  // Baked contact shadows: no GPU shadow map, no per-frame geometry work.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(39,54,42,.26)'); gradient.addColorStop(.4, 'rgba(39,54,42,.16)'); gradient.addColorStop(1, 'rgba(39,54,42,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  const shadowMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }), shadows.length);
  shadows.forEach(([x, z, w, d], i) => {
    dummy.position.set(x, .125, z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(w, d, 1); dummy.updateMatrix(); shadowMesh.setMatrixAt(i, dummy.matrix);
  });
  scene.add(shadowMesh);
  return { rooms, homes, spaces, circulation, bounds: { minX: -63, maxX: 63, minZ: -80, maxZ: 62, maxY: 6.5 }, sharedSpaces: spaces.filter(s=>s.label).map(s=>({...s,y:.25})) };
}

