import { Group } from 'three'
import type { FurnitureKind, FurniturePlacement, RoomFrame } from './api'
import type { ModelKit } from '../three/model'
import { monitor, shelf, table, officeChair, wallScreen, carton, workstations } from './furniture'

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
  const fitted = fitFurniture(item, room)
  return Math.abs(fitted.x - item.x) < 0.000001 && Math.abs(fitted.y - item.y) < 0.000001
}

export function buildPlacedFurniture(parent: Group, model: ModelKit, item: FurniturePlacement, frame: RoomFrame) {
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
    default:model.asset(object,item.kind,0,0,0,width,height,depth)
  }
  const size=furnitureSize(item)
  object.scale.set(size.width/width,size.height/height,size.depth/depth)
  return object
}
