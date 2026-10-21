import { vec, type Course, type Platform, type Anchor, type Biome, type Vec, type Landform } from './types';
import { makeRocks } from './environment';

export const ECOSYSTEM_ID = 'ecosystem-main-v3';

type Placement = [name: string, zone: number, x: number, top: number, z: number, form: Landform, width: number, thickness: number, length: number, yaw: number, bend?: number];
export const ROUTE_PLACEMENTS: Placement[] = [
  ['물가의 첫 연잎',0,3.299,5.15,4.525,'leaf',4.8,.3,4.4,0,.15],
  ['물 밖으로 뻗은 뿌리',0,5.331,10.15,1.71,'root',6,.8,6,.6],
  ['풀숲 진입 잎',1,12.5,15.5,-2,'leaf',4,.35,4,.8],
  ['휘어진 큰 잎',1,15.5,20,-6,'leaf',5.2,.4,8,-.8,.7],
  ['줄기 사이 되돌아 오르기',1,20,24.5,-1,'leaf',5.8,.4,7,.5,.5],
  ['암벽으로 향한 잎 끝',1,24,30,-7,'leaf',5.4,.45,7,1.1,.8],
  ['골짜기 입구 돌턱',2,30.5,35.6,-9,'stone',6,2,6,.2],
  ['골짜기 안쪽 쐐기',2,35,40,-6,'stone',6,3,7,-.5],
  ['오른쪽 암벽 선반',2,39,45.8,-8,'stone',6,2.6,6,.4],
  ['암벽 틈 되돌기',2,34.5,50.2,-16,'stone',5.8,3,7,-.2],
  ['꽃 줄기 아래 암반',2,36,55.1,-19,'stone',6,2,6,.4],
  ['꽃의 아래쪽 잎',3,39,60.5,-26,'leaf',6,.4,7,.2,.5],
  ['줄기 오른쪽 잎',3,44,65.2,-28,'leaf',6,.5,8,-.7,.8],
  ['꽃받침 밑을 돌아 오르기',3,42,70.8,-34,'leaf',6,.5,8,1.2,.8],
  ['겹친 꽃잎 안쪽',3,37,75.4,-35,'petal',7,.6,8,.5,1.2],
  ['말린 꽃잎 가장자리',3,35,80,-30,'petal',7,.6,8,-.7,1.5],
  ['나무를 향한 바깥 꽃잎',3,32,85.1,-35,'petal',6,.5,8,1.1,1],
  ['첫 가지 갈림',4,27,90.5,-38,'branch',6,1,7,.8],
  ['줄기 앞 가지',4,22,95,-35,'branch',6,1.4,8,-1],
  ['줄기 왼쪽 가지',4,17,100.2,-39,'branch',7,1.4,8,.5],
  ['옹이 뒤로 돌아 오르기',4,20,105.6,-45,'branch',8,1.2,9,-.4],
  ['수관 아래 가지 끝',4,16,110.1,-45,'branch',6,1.2,8,.8],
  ['산을 향한 굵은 가지',4,12,115,-39,'branch',5.5,1,8,1],
  ['능선 첫 암반',5,7,120.5,-35,'stone',6,2.5,7,.3],
  ['바람 반대편 선반',5,3,125.2,-39,'stone',6,3,6,-.3],
  ['덮개 바위 아래',5,-2,130.1,-34,'stone',6,2.8,7,.5],
  ['좁은 안부',5,1,135.4,-29,'stone',5.5,2,7,-.5],
  ['구름으로 열린 능선',5,-6,140,-30,'stone',6,2.2,6,.3],
  ['첫 구름 선반',6,-12,145.5,-25,'cloud',7,2,7,.2],
  ['구름 옆면 돌아 오르기',6,-17,150.2,-27,'cloud',7,2.2,8,-.4],
  ['구름 사이 빈틈',6,-17,155.4,-20,'cloud',8,2.8,7,.3],
  ['밤하늘 앞 구름 끝',6,-14,160.2,-14,'cloud',7,2.4,8,-.3],
  ['첫 운석 바위',7,-12,165.5,-7,'stone',5.5,2.2,6,.4],
  ['별자리 왼쪽 운석',7,-7,170.2,-3,'stone',5,2,5,-.5],
  ['정상 아래 노출된 운석',7,-11,175.4,2,'stone',5.4,2,5.6,.3],
];

export function makeEcosystem(): Course {
  const biomes: Biome[] = [
    { id:'pond',name:'작은 연못',start:0,end:15,center:vec(0,0,0),kind:'grass',foods:['fruit-fly'],sky:'#dce8ce',color:'#749d4c' },
    { id:'grass',name:'거대한 풀숲',start:15,end:35,center:vec(16,15,-3),kind:'grass',foods:['fruit-fly','fly'],sky:'#d3e8b7',color:'#6fa345' },
    { id:'rocks',name:'바위 골짜기',start:35,end:60,center:vec(36,35,-12),kind:'rock',foods:['fly','beetle'],sky:'#d8ddd4',color:'#9b9c88' },
    { id:'flower',name:'거대한 꽃',start:60,end:90,center:vec(40,60,-32),kind:'petal',foods:['pollen','bee'],sky:'#f1ded9',color:'#e3a2b4' },
    { id:'tree',name:'오래된 나무',start:90,end:120,center:vec(20,90,-40),kind:'branch',foods:['bee','moth'],sky:'#c3d8ba',color:'#80634b' },
    { id:'mountain',name:'바위산 능선',start:120,end:145,center:vec(0,120,-34),kind:'rock',foods:['beetle','moth'],sky:'#c6d6e4',color:'#7c8e9e' },
    { id:'clouds',name:'구름 바다',start:145,end:165,center:vec(-16,145,-20),kind:'cloud',foods:['dew'],sky:'#9dbfe0',color:'#e5edf8' },
    { id:'stars',name:'별의 길',start:165,end:180,center:vec(-10,165,0),kind:'star',foods:['stardust'],sky:'#192846',color:'#dfc584' },
  ];
  const start = vec(0,.95,3.5);
  const platforms: Platform[] = [{id:'ground',position:vec(0,-.3,0),size:vec(28,.6,28),kind:'ground',zone:0,round:true}];
  const anchors: Anchor[] = [], solids: NonNullable<Course['solids']> = [];
  const kindFor = (form: Landform, zone: number): Platform['kind'] => form === 'stone' ? 'rock' : form === 'root' ? 'branch' : form;
  const piece = (id: string, zone: number, position: Vec, size: Vec, form: Landform, yaw = 0, bend = .3, color?: string) => {
    const p: Platform = {id,zone,position,size,form,kind:kindFor(form,zone),rotation:vec(0,yaw,0),bend,color};
    platforms.push(p); return p;
  };
  const stem = (from: Vec, to: Vec, radius: number, kind: 'trunk'|'stem'|'grass') => {
    const direction = vec(to.x-from.x,to.y-from.y,to.z-from.z);
    solids.push({position:vec((from.x+to.x)/2,(from.y+to.y)/2,(from.z+to.z)/2),radius,
      height:Math.hypot(direction.x,direction.y,direction.z),direction,kind});
  };
  const recovery: [Landform,number,number,number,string][] = [
    ['root',15,2,12,'#728144'],['stone',16,4,12,'#8a8c70'],['petal',16,.8,13,'#6f964c'],
    ['branch',16,2,13,'#876747'],['stone',16,3,11,'#78838b'],['cloud',16,3,13,'#e8f1f7'],['stone',13,3,11,'#666c86'],
  ];
  for (let zone = 1; zone < biomes.length; zone++) {
    const b = biomes[zone], [form,w,h,d,color] = recovery[zone-1];
    const p = piece(`basin-${b.id}`,zone,vec(b.center.x,b.start+.15-h/2,b.center.z),vec(w,h,d),form,0,.25,color);
    p.refuge = b.name; p.recovery = true;
    anchors.push({id:`food-basin-${b.id}`,position:vec(b.center.x,b.start+2.8,b.center.z),zone,recovery:true,food:b.foods[0]});
  }
  const route: NonNullable<Course['route']> = [];
  const routePads = ROUTE_PLACEMENTS.map(([name,zone,x,top,z,form,w,h,d,yaw,bend], index) => {
    // A little more real landing area gives the player room to build a swing
    // without turning every route beat into a broad, flat platform.
    const p = piece(`pad-${index+1}`,zone,vec(x,top-h/2,z),vec(w*1.1,h,d*1.1),form,yaw,bend);
    if (zone === 7) p.color = '#666a82';
    // Keep the route's springy leaf readable as a small rebound, rather than
    // sending a landing outside the next rope arc.
    if (index === 3) p.bounce = 2.8;
    route.push({platform:p.id,launch:`fly-${index+2}-a`,arrival:`fly-${index+2}-b`,name,zone}); return p;
  });
  const summit: Platform = {id:'summit',position:vec(-8,180,6),size:vec(8,.4,8),kind:'star',zone:7};
  platforms.push(summit);
  route.push({platform:'summit',launch:'',name:'별의 정상',zone:7});
  const top = (p: Platform) => p.position.y+p.size.y/2;
  let previous = start;
  for (let index=0; index < route.length; index++) {
    const i=index+1, p=index===35?summit:routePads[index], b=biomes[p.zone];
    // Keep the first meal just above the last landing where it can be caught
    // before a deliberate swing. It no longer carries the frog to a distant,
    // scripted arrival point. The rocks leave the basin center open below.
    anchors.push({id:`fly-${i}-a`,position:vec(previous.x,previous.y+2.65,previous.z),zone:p.zone,recovery:false,food:b.foods[(i+1)%b.foods.length]});
    // A second catch sits over this landing, so each route beat stays local
    // and a miss can still be corrected with another deliberate swing.
    const a: Anchor={id:`fly-${i}-b`,position:vec(p.position.x,top(p)+1.5,p.position.z),zone:p.zone,recovery:false,food:b.foods[i%b.foods.length]};
    if (b.foods.includes('bee')) a.motion={amplitude:vec(.32,.08,.2),period:3.5,phase:0};
    if (a.food==='pollen') a.motion={amplitude:vec(.16,.16,.12),period:4.5,phase:0};
    if (a.food==='moth') a.motion={amplitude:vec(.2,.2,.12),period:4,phase:0};
    anchors.push(a);
    previous=vec(p.position.x,top(p)+.4,p.position.z);
  }
  for(let zone=0;zone<7;zone++) {
    const last=routePads.filter(p=>p.zone===zone).at(-1)!;
    const next=routePads.find(p=>p.zone===zone+1)!;
    const relay=anchors.find(a=>a.id===`fly-${routePads.indexOf(next)+1}-a`)!;
    relay.id=`food-crossing-${biomes[zone].id}`; relay.transition=true;
    route.find(r=>r.platform===last.id)!.launch=relay.id;
  }
  // Keep the last two catches on their authored landings. The final summit
  // approach has its own food so it doesn't pull a mid-route anchor away.
  anchors.find(a=>a.id==='fly-36-b')!.position=vec(summit.position.x-.8,top(summit)+1.2,summit.position.z-1);
  const groundResolution=32, heights:number[]=[];
  for(let x=0;x<=groundResolution;x++) for(let z=0;z<=groundResolution;z++) {
    const lx=(x/groundResolution-.5)*28,lz=(z/groundResolution-.5)*28;
    const pond=Math.hypot(lx+6,lz+4);
    heights.push(.16+.12*(.5+.5*Math.sin(lx*.24+.4)*Math.cos(lz*.3-.25))+1.3*(Math.hypot(lx,lz)/14)**2.1-.55*Math.max(0,Math.min(1,(7.7-pond)/2.2)));
  }
  stem(vec(-3,0,-4),vec(6,10,-3),.55,'trunk');
  stem(vec(6,9,-1),vec(14,14,-5),.7,'trunk');
  for(const p of routePads.filter(p=>p.zone===1)) {
    const y=top(p); stem(vec(20,8,-8),vec(20,y+1,-8),.26,'grass');
    stem(vec(20,y-3,-8),vec(p.position.x,y-.8,p.position.z),.18,'grass');
  }
  piece('gorge-east-wall',2,vec(44,42,-17),vec(5,28,10),'stone',-.2,0,'#777f70');
  piece('gorge-west-wall',2,vec(29,43,-20),vec(5,22,10),'stone',.25,0,'#969582');
  stem(vec(45.8,28,-30),vec(45.8,83.5,-30),1.05,'stem');
  for(const p of routePads.filter(p=>p.zone===3)) {
    if(p.id==='pad-17') stem(vec(45.8,top(p)-8,-38),vec(p.position.x,top(p)-.8,p.position.z-3),.23,'stem');
    else stem(vec(45.8,top(p)-5,-30),vec(p.position.x,top(p)-.8,p.position.z),.23,'stem');
  }
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4;
    piece(`flower-crown-${i}`,3,vec(48+Math.sin(a)*3.7,82-.4*Math.cos(a),-31+Math.cos(a)*3.7),vec(5.8,.5,10.3),'petal',a,1.8,i%2?'#d96592':'#e88eab');
  }
  piece('flower-pollen-heart',3,vec(47,82.7,-31),vec(5,1.2,5),'stone',0,0,'#e6bc5a');
  for(let i=0;i<7;i++) {
    const a=i*2.4, x=47+Math.sin(a)*1.5,z=-31+Math.cos(a)*1.5;
    stem(vec(x,83,z),vec(x,85+i%2,z),.08,'stem');
    piece(`stamen-${i}`,3,vec(x,85+i%2,z),vec(.5,.6,.5),'stone',a,0,'#eecf75');
  }
  stem(vec(26,66,-43),vec(26,123,-43),1.9,'trunk');
  for(const p of routePads.filter(p=>p.zone===4)) {
    stem(vec(24,top(p)-5,-43),vec(p.position.x,top(p)-1.1,p.position.z),.55,'trunk');
    stem(vec(p.position.x,top(p)-1,p.position.z),vec(p.position.x+3,top(p)-1.5,p.position.z-3),.18,'trunk');
  }
  for(const [i,x,y,z] of [[0,29,116,-49],[1,25,122,-43],[2,32,110,-46]]) {
    piece(`tree-canopy-${i}`,4,vec(x,y,z),vec(13,.7,12),'leaf',i*1.2,1.4,'#587f46');
    stem(vec(24,y-8,-43),vec(x,y-.6,z),.5,'trunk');
  }
  stem(vec(22,87,-42),vec(13,88,-36),1.1,'trunk');
  stem(vec(22,87,-42),vec(23,89,-33),1,'trunk');
  piece('mountain-spine',5,vec(3,124,-46),vec(9,29,11),'stone',-.2,0,'#737e87');
  piece('mountain-capstone',5,vec(-4,136,-40),vec(12,4,7),'stone',.4,0,'#a3acb1');
  piece('mountain-low-buttress',5,vec(10,111,-46),vec(7,18,8),'stone',-.3,0,'#8c938d');
  piece('cloud-hanging-bank',6,vec(-25,150,-29),vec(10,6,11),'cloud',.4,0,'#dbe7f3');
  piece('cloud-high-bank',6,vec(-24,159,-18),vec(9,5,10),'cloud',-.2,0,'#edf4fc');
  anchors.push({id:'food-mountain-shortcut',position:vec(-4,138,-31),zone:5,recovery:false,food:'moth',motion:{amplitude:vec(.2,.15,.12),period:4,phase:0}});
  const water={id:'cloud-dew',position:vec(-12,153,-30),radius:2.5};
  anchors.push({id:'food-cloud-exit',position:vec(-11.4,157,-30),zone:6,recovery:false,food:'dew'});
  return {id:ECOSYSTEM_ID,mode:'main',height:180,start,platforms,anchors,summit,biomes,solids,rocks:makeRocks(),
    landscapes:[{position:vec(),size:vec(28,1,28),resolution:groundResolution,heights,zone:0,round:true}],waters:[water],route,bounds:70};
}
