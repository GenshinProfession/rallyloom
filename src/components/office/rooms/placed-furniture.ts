import { Group } from 'three'
import type { FurnitureKind, FurniturePlacement, RoomFrame } from './api'
import type { ModelKit } from '../three/model'
import { monitor, shelf, table, officeChair, wallScreen, carton, workstations } from './furniture'
import { buildDataScreen } from '../three/data-screen'

export const FURNITURE = {
  desk: { label: '桌子', width: 60, depth: 36, height: 24 },
  shelf: { label: '置物架', width: 56, depth: 22, height: 44 },
  plant: { label: '绿植', width: 23, depth: 24, height: 38 },
  sofa: { label: '沙发', width: 75, depth: 32, height: 29 },
  coffee: { label: '咖啡机', width: 20, depth: 19, height: 28 },
  lamp: { label: '落地灯', width: 18, depth: 18, height: 48 },
  workstation: { label:'办公工位',width:62,depth:80,height:40 },
  chair: { label:'办公椅',width:24,depth:26,height:28 },
  'meeting-table': { label:'会议桌',width:150,depth:62,height:25 },
  'round-table': { label:'圆桌',width:62,depth:62,height:24 },
  'coffee-table': { label:'茶几',width:48,depth:30,height:14 },
  counter: { label:'前台 / 茶水柜',width:130,depth:38,height:28 },
  cabinet: { label:'矮柜',width:62,depth:26,height:26 },
  'display-shelf': { label:'样品展示架',width:78,depth:22,height:44 },
  'clothes-rack': { label:'衣物展示架',width:78,depth:30,height:48 },
  rug: { label:'地毯',width:130,depth:92,height:1 },
  partition: { label:'工位隔板',width:5,depth:46,height:28 },
  screen: { label:'展示大屏',width:125,depth:8,height:62 },
  'studio-light': { label:'摄影补光灯',width:32,depth:24,height:60 },
  camera: { label:'摄影机',width:24,depth:24,height:42 },
  carton: { label:'纸箱',width:22,depth:18,height:15 },
  printer: { label:'打印机',width:28,depth:24,height:17 },
  trolley: { label:'运输推车',width:36,depth:38,height:32 },
  microwave: { label:'微波炉',width:27,depth:24,height:17 },
  sink: { label:'水槽',width:30,depth:24,height:18 },
  cup: { label:'咖啡杯',width:8,depth:8,height:7 },
  notebook: { label:'笔记本 / 文件',width:18,depth:13,height:2 },
  monitor: { label:'显示器',width:30,depth:14,height:28 },
  bench: { label:'长工位桌',width:200,depth:56,height:40 },
  'desk-l': { label:'L 型办公桌',width:96,depth:76,height:25 },
  bookcase: { label:'书柜',width:96,depth:26,height:88 },
  whiteboard: { label:'白板',width:120,depth:6,height:72 },
  tv: { label:'电视 / 显示屏',width:96,depth:6,height:56 },
  'water-cooler': { label:'饮水机',width:24,depth:24,height:56 },
  'plant-large': { label:'大绿植',width:44,depth:44,height:74 },
  'conference-table': { label:'长会议桌',width:240,depth:74,height:26 },
  'data-screen': { label:'数据显示屏',width:200,depth:8,height:112 },
} satisfies Record<FurnitureKind, { label: string; width: number; depth: number; height: number }>

export function furnitureSize(item: FurniturePlacement) {
  return { ...FURNITURE[item.kind], ...item.size }
}

function clearances(item: FurniturePlacement, room: RoomFrame) {
  const { width, depth } = furnitureSize(item)
  const angle = item.rotation * Math.PI / 180
  const sin = Math.abs(Math.sin(angle)), cos = Math.abs(Math.cos(angle))
  return {
    x: (cos * width + sin * depth) / (2 * room.width),
    y: (sin * width + cos * depth) / (2 * room.height),
  }
}

export function fitFurniture(item: FurniturePlacement, room: RoomFrame): FurniturePlacement {
  const edge = clearances(item, room)
  return {
    ...item,
    x: Math.max(edge.x, Math.min(1 - edge.x, item.x)),
    y: Math.max(edge.y, Math.min(1 - edge.y, item.y)),
  }
}

export function furnitureFits(item: FurniturePlacement, room: RoomFrame) {
  const edge = clearances(item, room)
  if (edge.x > .5 || edge.y > .5) return false
  const fitted = fitFurniture(item, room)
  return Math.abs(fitted.x - item.x) < 0.000001 && Math.abs(fitted.y - item.y) < 0.000001
}

export function buildPlacedFurniture(parent: Group, model: ModelKit, item: FurniturePlacement, frame: RoomFrame, screenLines: readonly string[] = []) {
  // 数据显示屏自己管理位置与朝向，文字由看板数据源决定
  if (item.kind === 'data-screen') return buildDataScreen(parent, model, item, frame, screenLines)
  const object = new Group()
  object.position.set(item.x * frame.width, item.elevation ?? 0, item.y * frame.height)
  object.rotation.y = -item.rotation * Math.PI / 180
  parent.add(object)
  const base = FURNITURE[item.kind], color=item.color ?? '#efece2'
  const { width, depth, height } = base
  switch (item.kind) {
    case 'desk': table(object,model,0,0,width,depth,color,height-3);monitor(object,model,0,-depth*.2,height,24);break
    case 'workstation': {
      workstations({group:object,model,width:1,depth:1,seats:[{x:0,y:0}],doorway:null!},62)
      officeChair(object,model);break
    }
    case 'chair':officeChair(object,model);break
    case 'shelf':case 'display-shelf':shelf(object,model,0,0,width,item.kind==='display-shelf');break
    case 'meeting-table':case 'coffee-table':table(object,model,0,0,width,depth,color,height-3);break
    case 'round-table':model.round(object,0,0,0,10,height-3,'#a0a9a6');model.round(object,0,height-3,0,width,3,color);break
    case 'rug':model.softBox(object,0,.05,0,width,.6,depth,item.color??'#d4dcda').castShadow=false;break
    case 'partition':model.softBox(object,0,2,0,width,height-2,depth,item.color??'#b8c9c1');break
    case 'counter':case 'cabinet':
      model.softBox(object,0,0,0,width,height-3,depth,item.color??'#d7c3a9');model.softBox(object,0,height-3,0,width+2,3,depth+2,'#f8f5ec');
      for(let i=0;i<4;i++){model.box(object,(i-1.5)*width/4,2,depth/2+.4,1,height-6,1,'#b5a58f');model.box(object,(i-1.5)*width/4,height*.65,depth/2+1,8,1,1,'#889795')}break
    case 'screen':wallScreen(object,model,0,0,width);break
    case 'monitor':monitor(object,model,0,0,0,width);break
    case 'carton':carton(object,model,0,0,0,width,item.color??'#d3af88');break
    case 'notebook':model.softBox(object,0,0,0,width,height,depth,item.color??'#8fa8b4');break
    case 'cup':model.round(object,0,0,0,width,height,'#fbf6e9');model.round(object,0,height,0,width*.7,.2,'#8a6b4f');break
    case 'printer':case 'microwave':
      model.softBox(object,0,0,0,width,height,depth,item.color??'#dce3e2');model.box(object,0,height*.3,depth/2+.2,width*.8,height*.35,1,'#586f7a');
      if(item.kind==='printer')model.box(object,0,3,depth*.65,width*.65,.7,depth*.45,'#fcfaf3');break
    case 'sink':model.softBox(object,0,0,0,width,3,depth,'#adbfc4');model.softBox(object,0,2,0,width*.74,2,depth*.7,'#718b96');model.round(object,width*.3,3,-depth*.35,3,height,'#b8c9cb');break
    case 'studio-light':
      model.round(object,0,0,0,16,3,'#566973');model.round(object,0,3,0,3,40,'#65737b');model.softBox(object,0,34,0,30,26,5,'#53636e');model.softBox(object,0,36,3,26,22,1,'#fff5dc');break
    case 'camera':
      for(const angle of [0,Math.PI/3,-Math.PI/3])model.box(object,0,1,0,24,2,3,'#667780').rotation.y=angle;
      model.round(object,0,2,0,3,30,'#697c85');model.softBox(object,0,30,0,15,10,9,'#435965');model.round(object,0,32,-6,7,8,'#293f4e').rotation.x=Math.PI/2;break
    case 'clothes-rack':
      for(const x of [-width/2+3,width/2-3]){model.box(object,x,0,0,4,height,4,'#829497');model.box(object,x,0,0,10,3,depth,'#829497')}
      model.box(object,0,height-3,0,width,3,3,'#829497');for(let i=0;i<4;i++)model.softBox(object,(i-1.5)*16,16,2,12,25,7,['#b28b76','#93acb5','#b4a1b3','#d8cba8'][i]);break
    case 'trolley':
      model.softBox(object,0,5,0,width,3,depth,'#92a8af');model.box(object,0,7,-depth/2+2,width,25,3,'#8da3aa');
      for(const x of [-13,13])for(const z of [-14,14])model.round(object,x,0,z,5,5,'#50616a');carton(object,model,0,8,0,24);break
    case 'bench': {
      // 长工位桌：一整条共用工位，桌面下走线槽，三到四组显示器 + 座椅
      const bays = Math.max(2, Math.round(width / 62))
      const bayWidth = (width - 8) / bays
      model.box(object,0,0,0,width-6,1.2,depth-14,'#7f8b8d')
      for(let i=0;i<=bays;i++)model.box(object,-width/2+4+i*bayWidth,1,0,2.6,24,depth-16,'#a3adb0')
      model.softBox(object,0,25.5,0,width,2.2,depth-8,item.color??'#efe9dd')
      model.softBox(object,0,23.6,0,width-4,1,depth-14,'#c9c1b2')
      model.softBox(object,0,14.5,depth/2-4.5,width-6,15,1.6,'#ded6c7')
      model.softBox(object,0,27,0,width-10,1.4,6,'#b9bfbe')
      for(let i=0;i<bays;i++){
        const x=-width/2+bayWidth*(i+.5)
        monitor(object,model,x,-depth*.14,27,bayWidth>66?24:20)
        model.softBox(object,x,26.2,-depth*.02,bayWidth*.34,.8,9,'#d7d2c6')
        model.orb(object,x+bayWidth*.16,26.4,-depth*.02,2.2,.9,3.2,'#dfe3e2')
        const chair=new Group();chair.position.set(x,0,depth/2+16);chair.rotation.y=Math.PI;object.add(chair);officeChair(chair,model)
        model.round(object,x,27.6,-depth*.36,3.2,.2,'#967a63')
      }
      break
    }
    case 'desk-l': {
      model.softBox(object,0,height,0,width,2.1,depth*.42,item.color??'#efe9dd')
      model.softBox(object,-width*.26,height,0,width*.46,2.1,depth,item.color??'#efe9dd')
      for(const x of [-width*.42,width*.4])for(const z of [-depth*.16,depth*.16])model.box(object,x,0,z,2.8,height-1,2.8,'#a3adb0')
      model.box(object,-width*.26,0,-depth*.36,2.8,height-1,2.8,'#a3adb0')
      monitor(object,model,width*.12,-depth*.14,height+2,24)
      model.softBox(object,-width*.3,height+2,.04,width*.32,.8,10,'#d7d2c6')
      break
    }
    case 'bookcase': {
      for(const x of [-width/2+2,width/2-2])model.box(object,x,0,0,3.4,height,20,'#9aa39f')
      for(const y of [2,height*.34,height*.62,height-4])model.box(object,0,y,0,width,2.6,21,'#c9bea9')
      const palette=['#a3b7c4','#c3a98d','#a9b79a','#c4a3a3','#d6cdb4']
      for(let row=0;row<3;row++){const y=[4,height*.34+3,height*.62+3][row]
        for(let i=0;i<10;i++){const w=4+((row*7+i*3)%4);model.box(object,(i-4.5)*width/10+2,y,w-1.5,3.2,13+((i+row)%3)*3,15,palette[(i+row)%palette.length])}}
      break
    }
    case 'whiteboard': {
      model.softBox(object,0,height*.42,0,width,height*.62,2.4,'#f6f7f5')
      model.box(object,0,height*.42,.6,width+3,1.4,1.4,'#b7c0bd')
      model.box(object,-width/2-1,height*.42,0,1.6,height*.62,2.8,'#b7c0bd')
      model.box(object,width/2+1,height*.42,0,1.6,height*.62,2.8,'#b7c0bd')
      model.box(object,0,height*.8,0,width+2,2.2,2,'#b7c0bd')
      for(const x of [-width/2+8,width/2-8])model.box(object,x,0,0,2.4,height*.36,2.4,'#a9b3b0')
      model.box(object,-width*.28,height*.2,1.6,width*.22,.6,.8,'#7f9bb4')
      model.box(object,-width*.14,height*.14,1.6,width*.1,.5,.8,'#c9a06f')
      break
    }
    case 'tv': {
      model.softBox(object,0,height*.48,0,width,height*.6,2.6,'#2e3a42')
      model.box(object,0,height*.48,1.5,width-5,height*.5-3,.6,'#3f5d6f')
      for(let i=0;i<4;i++)model.box(object,-width*.24,height*.6-i*4,2,width*.3,.7,.3,'#6f94a8')
      model.box(object,0,height*.14,0,9,height*.24,3.4,'#3a444a')
      model.softBox(object,0,.6,0,width*.36,1.4,14,'#5b666b')
      break
    }
    case 'water-cooler': {
      model.softBox(object,0,0,0,width,height-18,depth,item.color??'#e3e6e4')
      model.round(object,0,height-8,0,width*.34,14,'#bcd8e4')
      model.round(object,0,height-8,0,width*.22,14.5,'#d4e8ef')
      model.softBox(object,0,height*.64,depth/2+.6,6,4,2,'#9aa7a5')
      model.softBox(object,-3.4,height*.52,depth/2+1.4,2.2,3,1.6,'#6f8794')
      model.softBox(object,3.4,height*.52,depth/2+1.4,2.2,3,1.6,'#b98a7c')
      break
    }
    case 'plant-large': {
      model.round(object,0,0,0,width*.3,14,'#cbbfae')
      model.round(object,0,13,0,width*.26,2,'#7c6a57')
      model.asset(object,'plant',0,12,0,width*.92,height-12,depth*.92)
      break
    }
    case 'conference-table': {
      table(object,model,0,0,width,depth,item.color??'#f2ecdd',height-2)
      for(const x of [-width*.28,width*.28])for(const z of [-depth*.24,depth*.24])model.round(object,x,0,z,3.4,.5,'#9aa7a4')
      for(let i=0;i<6;i++){const x=-width/2+width/6*(i+.5)
        model.softBox(object,x,height*.5,0,14,1.2,10,'#dfe5e3')
        const chair=new Group();chair.position.set(x,0,(i%2===0?1:-1)*(depth/2+15));chair.rotation.y=i%2===0?Math.PI:0;object.add(chair);officeChair(chair,model)}
      break
    }
    default:model.asset(object,item.kind,0,0,0,width,height,depth)
  }
  const size=furnitureSize(item)
  object.scale.set(size.width/width,size.height/height,size.depth/depth)
  return object
}
