// A single, cached Canvas2D architectural drawing. Coordinates stay in CSS pixels.
export function createOfficeScene(members, departments) {
  const width=2100,height=1250,stations=new Map();
  const palette=['#7d937c','#71919e','#b58c78','#b79c63','#8996ad','#86a69a','#a594b0','#6d8d88'];
  const project=(x,y,z=0)=>({x:825+(x-y)*.74,y:135+(x+y)*.34-z});
  const roomSpecs=departments.map((d,i)=>({...d,x:65+(i%4)*395,y:60+Math.floor(i/4)*405,w:365,h:340,color:d.color||palette[i%8]}));
  const polygon=(x,y,w,h,z=0)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(p=>project(...p,z));
  const box=points=>{const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)}};
  const rooms=roomSpecs.map(r=>{const p=polygon(r.x,r.y,r.w,r.h),b=box(p),c=project(r.x+r.w/2,r.y+r.h/2);return {...r,shortName:r.shortName||r.name,description:r.description||'Ruang kolaborasi tim',polygon:p,bounds:b,center:c,focus:{x:b.x-60,y:b.y-95,width:b.w+120,height:b.h+155},count:members.filter(m=>m.departmentId===r.id).length,door:project(r.x+r.w/2,r.y+r.h),waypoint:{x:r.x+r.w/2,y:r.y+r.h+24}}});
  for(const r of roomSpecs){members.filter(m=>m.departmentId===r.id).forEach((m,i)=>{const col=i%4,row=Math.floor(i/4),home={x:r.x+51+col*83,y:r.y+132+row*108};stations.set(m.id,{home,rest:{x:r.x+48+col*84,y:r.y+r.h-38},roomId:r.id,waypoints:[{x:home.x,y:home.y+25},{x:home.x+38,y:home.y+25},{x:home.x+38,y:r.y+r.h-38}]})})}
  function drawStatic(c){
    c.save();c.lineJoin='round';c.lineCap='round';
    const path=(pts,fill,stroke)=>{c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke()}};
    const slab=(x,y,w,h,z,fill,side='#d1d1c5',depth=8)=>{const a=polygon(x,y,w,h,z),b=polygon(x,y,w,h,z-depth);path([a[1],a[2],b[2],b[1]],side);path([a[2],a[3],b[3],b[2]],side);path(a,fill)};
    const line=(a,b,color,lw=1)=>{c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.strokeStyle=color;c.lineWidth=lw;c.stroke()};
    const label=(s,x,y,size=12,color='#52615a',weight=500)=>{c.font=`${weight} ${size}px Inter, system-ui, sans-serif`;c.textAlign='center';c.fillStyle=color;c.fillText(s,x,y)};
    const leg=(x,y,z)=>line(project(x,y,2),project(x,y,z),'#53615c',2);
    const plant=(x,y,size=1)=>{const p=project(x,y);c.fillStyle='rgba(35,54,44,.10)';c.beginPath();c.ellipse(p.x+5,p.y+2,17*size,7*size,0,0,Math.PI*2);c.fill();slab(x-8*size,y-8*size,16*size,16*size,16*size,'#e6e3d6','#b8bcb0',16*size);for(let i=0;i<7;i++){const a=i*2.4,q=project(x+Math.cos(a)*11*size,y+Math.sin(a)*11*size,23*size+(i%3)*7*size);c.fillStyle=['#496d54','#67866a','#8a9d75'][i%3];c.beginPath();c.ellipse(q.x,q.y,8*size,15*size,a*.3,0,Math.PI*2);c.fill()}};
    const chair=(x,y,color='#829082')=>{slab(x-10,y-10,20,20,12,color,'#657466',4);const a=project(x-10,y+10,12),b=project(x+10,y+10,12),d=project(x+10,y+10,32),e=project(x-10,y+10,32);path([a,b,d,e],color);leg(x,y,12)};
    const desk=(x,y,accent,i)=>{chair(x+6,y+32);leg(x-29,y-14,26);leg(x+29,y+14,26);slab(x-35,y-21,70,43,27,'#f4f0e5','#c8c8ba',4);const a=project(x-19,y-7,29),b=project(x+10,y-7,29),d=project(x+10,y-7,50),e=project(x-19,y-7,50);path([a,b,d,e],'#34433e','#26342f');path([{x:a.x+2,y:a.y-2},{x:b.x-2,y:b.y-2},{x:d.x-2,y:d.y+2},{x:e.x+2,y:e.y+2}],'#718d88');line(project(x-4,y-7,28),project(x-4,y-7,36),'#42564e',2);slab(x-16,y+7,27,9,29,'#cbd3cb','#b7c1b8',1);slab(x+22,y+2,8,10,29,i%2?'#b08a6e':accent,accent,5);if(i%3===0){slab(x-31,y+5,10,17,29,'#e7ddc2','#c8c1ae',2)}};
    const sofa=(x,y,w=100,color='#9baca0')=>{slab(x,y,w,35,15,color,'#758a7c',12);slab(x,y+29,w,9,35,color,'#758a7c',22);slab(x-4,y,9,39,28,color,'#758a7c',18);slab(x+w-5,y,9,39,28,color,'#758a7c',18);for(let k=1;k<w/35;k++)line(project(x+k*35,y,16),project(x+k*35,y+27,16),'#849b8b')};
    const glass=(x,y,w,h)=>{const a=project(x,y),b=project(x+w,y+h),at=project(x,y,67),bt=project(x+w,y+h,67);path([a,b,bt,at],'rgba(165,204,196,.17)','#aabfb3');line(at,bt,'#7d968a',2);for(let n=0;n<=3;n++){const xx=x+w*n/3,yy=y+h*n/3;line(project(xx,yy),project(xx,yy,67),'#a0b4a9',1.3)}};
    // Foundation and continuous circulation, raised above a soft architectural shadow.
    c.shadowColor='rgba(32,49,38,.17)';c.shadowBlur=38;c.shadowOffsetY=24;slab(25,20,1640,1090,0,'#e3e6da','#aab7a7',17);c.shadowColor='transparent';
    slab(48,42,1594,1026,2,'#f3f2e9','#d6dbcf',3);
    for(let x=60;x<1630;x+=45)line(project(x,43,3),project(x,1067,3),'rgba(127,134,112,.09)');
    // The rear cutaway wall is tall; front edges stay open to preserve visibility.
    path([project(45,40),project(1640,40),project(1640,40,86),project(45,40,86)],'#e3e8dd');
    line(project(45,40,86),project(1640,40,86),'#fdfdf6',4);
    for(const r of roomSpecs){
      slab(r.x,r.y,r.w,r.h,4,'#ece9dd','#d2d4c6',3);
      for(let yy=r.y+18;yy<r.y+r.h;yy+=22)line(project(r.x,yy,5),project(r.x+r.w,yy,5),'rgba(142,121,91,.10)');
      slab(r.x+12,r.y+65,r.w-24,228,5,r.color+'1b',r.color+'1b',1);
      glass(r.x,r.y,r.w,0);if(r.x>65)glass(r.x,r.y,0,r.h-18);
      // Low front sill and a generous, visibly open entrance.
      slab(r.x,r.y+r.h-4,114,5,17,'#ccd4c6','#aebcae',17);slab(r.x+r.w-114,r.y+r.h-4,114,5,17,'#ccd4c6','#aebcae',17);
      const rp=project(r.x+r.w/2,r.y+28,14);label(r.name.toLocaleUpperCase('id-ID'),rp.x,rp.y,12,'#3f5147',650);label(`${members.filter(m=>m.departmentId===r.id).length} WORKSTATIONS`,rp.x,rp.y+15,8,'#7c887e',550);
      const team=members.filter(m=>m.departmentId===r.id);team.forEach((m,i)=>{const s=stations.get(m.id);desk(s.home.x-6,s.home.y-32,r.color,i)});
      plant(r.x+r.w-19,r.y+53,.8);plant(r.x+19,r.y+r.h-30,.7);
      // Cabinet, pinboard and a slim strip of department color.
      slab(r.x+18,r.y+39,95,14,27,'#d9dece','#b9c3b2',24);for(let n=0;n<5;n++)slab(r.x+22+n*15,r.y+40,10,9,39,[r.color,'#d5cbb3','#86968a'][n%3],'#a5b19d',10);
      line(project(r.x+12,r.y+3,53),project(r.x+r.w-12,r.y+3,53),r.color,3);
    }
    // Quiet central promenade: uncluttered crossings, islands of greenery.
    for(let x=250;x<1650;x+=395){plant(x,434,.8);const p=project(x+80,432,4);label('·',p.x,p.y,16,'#b9c2b4')}
    // A full-width social floor: reception, meeting suite, lounge, café and terrace.
    slab(65,846,1510,205,5,'#dedbc9','#c5c6b6',4);
    for(let x=65;x<1570;x+=27)line(project(x,847,6),project(x,1050,6),'rgba(138,111,74,.15)');
    const amenity=(name,x,y)=>{const p=project(x,y,8);label(name,p.x,p.y,11,'#617064',650)};
    amenity('RECEPTION',190,861);slab(102,914,145,40,38,'#f5f1e4','#a8b6a1',36);slab(107,919,135,30,40,'#e3ddc8','#b9b79e',3);const brand=project(175,922,47);label('SOFTKLINIK',brand.x,brand.y,11,'#526d59',700);plant(85,998,1.1);sofa(280,967,90,'#b4aa95');
    amenity('MEETING SUITE',527,861);slab(410,887,258,148,7,'#c6d1c2','#b2bdad',2);glass(405,878,0,158);glass(405,878,270,0);for(let i=0;i<4;i++){chair(439+i*57,917,'#8d9c90');chair(439+i*57,998,'#8d9c90')}leg(450,947,31);leg(620,965,31);slab(427,935,219,52,32,'#e7ddc6','#b4ae98',5);slab(508,944,46,26,34,'#87998d','#697d71',2);plant(650,1016,.8);
    amenity('THE LIVING ROOM',830,861);slab(726,894,245,139,7,'#c4c7b7','#c4c7b7',1);sofa(741,908,130,'#849b8b');sofa(878,965,65,'#c3b49b');slab(792,969,66,37,20,'#d5c5a5','#b4a383',14);slab(805,976,17,12,22,'#f5f0df','#dad3bc',2);plant(953,907,1);slab(724,1017,100,12,40,'#889c82','#6f8668',38);for(let n=0;n<7;n++)slab(730+n*12,1019,8,8,54,['#c9b994','#e3dfc8','#80978c'][n%3],'#9aab91',12);
    amenity('CAFÉ & PANTRY',1131,861);slab(1022,884,229,26,37,'#e7e7db','#879984',35);slab(1032,888,37,18,48,'#3f5148','#2f4139',12);slab(1090,887,28,21,39,'#bac6ba','#95a791',2);plant(1228,895,.55);for(let i=0;i<2;i++){const x=1062+i*115;chair(x,974,'#b5aa8e');chair(x+35,1010,'#b5aa8e');leg(x+20,986,28);slab(x-6,969,61,38,29,'#eee5d2','#c3b99f',4)}
    amenity('GARDEN TERRACE',1435,861);slab(1300,884,249,150,7,'#b5c0a5','#99ac91',3);for(let x=1310;x<1540;x+=21)line(project(x,884,8),project(x,1034,8),'#a4b497');sofa(1340,937,125,'#e0d9c5');slab(1380,990,56,26,19,'#c5b28f','#a69574',12);for(let x=1305;x<1550;x+=52)plant(x,1023,.9);plant(1530,903,1.3);
    // Perimeter gardens and crisp white foundation edge.
    for(let y=90;y<810;y+=145)plant(1630,y,1.0);
    line(project(25,1110),project(1665,1110),'#f8f8ee',4);
    const mark=project(70,1090,4);label('SOFTKLINIK  /  CONNECTED WORKPLACE',mark.x+165,mark.y+24,11,'#8a978a',550);
    c.restore();
  }
  function drawActor(c,actor,seconds,options={}){
    const member=actor.member||actor,s=stations.get(actor.id||member.id),x=actor.x??actor.position?.x??s?.home.x??0,y=actor.y??actor.position?.y??s?.home.y??0;
    const p=project(x,y),walking=!!actor.walking&&!options.paused,t=seconds*7+(actor.phase||0),bob=walking?Math.sin(t)*1.1:0,working=['working','bekerja','busy'].includes(actor.state),color=member.color||'#748f80';
    c.save();c.translate(p.x,p.y+bob);c.fillStyle='rgba(37,57,43,.15)';c.beginPath();c.ellipse(0,2,10,4,0,0,Math.PI*2);c.fill();
    if(options.selected||options.hovered){c.strokeStyle=options.selected?'#467d60':'#a9b79f';c.lineWidth=2;c.beginPath();c.ellipse(0,2,15,7,0,0,Math.PI*2);c.stroke()}
    c.strokeStyle='#39473f';c.lineWidth=4;c.lineCap='round';const stride=walking?Math.sin(t)*4:0;c.beginPath();c.moveTo(-3,-8);c.lineTo(-4+stride,0);c.moveTo(3,-8);c.lineTo(4-stride,0);c.stroke();
    c.fillStyle=color;c.beginPath();c.roundRect(-7,-24,14,18,[6,6,3,3]);c.fill();
    c.strokeStyle=color;c.lineWidth=4;c.beginPath();c.moveTo(-6,-20);c.lineTo(-10,-12+(working?Math.sin(t*1.5):stride));c.moveTo(6,-20);c.lineTo(10,-12-(walking?stride:0));c.stroke();
    const skin=['#dcae89','#c58d69','#e8c3a0','#aa7356'][Math.abs(String(member.id).split('').reduce((a,b)=>a+b.charCodeAt(0),0))%4];c.fillStyle=skin;c.beginPath();c.ellipse(0,-29,6,7,0,0,Math.PI*2);c.fill();c.fillStyle='#3d3c32';c.beginPath();c.ellipse(-1,-33,6.5,4.5,-.2,Math.PI,Math.PI*2);c.fill();
    if(working){c.fillStyle='#8fae83';c.beginPath();c.arc(10,-32,3,0,Math.PI*2);c.fill()}
    if(options.selected||options.hovered){const name=member.shortName||member.name||'';c.font='600 11px Inter, system-ui, sans-serif';const w=c.measureText(name).width+16;c.fillStyle='#fcfdf7';c.shadowColor='rgba(35,50,40,.12)';c.shadowBlur=8;c.beginPath();c.roundRect(-w/2,-58,w,19,6);c.fill();c.shadowBlur=0;c.fillStyle='#354b3e';c.textAlign='center';c.fillText(name,0,-45)}c.restore();
  }
  function hitRoom(x,y){return rooms.find(r=>{let inside=false;for(let i=0,j=r.polygon.length-1;i<r.polygon.length;j=i++){const a=r.polygon[i],b=r.polygon[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)inside=!inside}return inside})||null}
  return {width,height,rooms,stations,drawStatic,drawActor,hitRoom,project,bounds:{x:0,y:0,width,height}};
}


