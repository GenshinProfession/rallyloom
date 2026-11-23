import type { FurnitureKind, FurniturePlacement, RoomPlacement, RoomSeat, RoomTemplate } from './api'
import { FURNITURE, fitFurniture } from './placed-furniture'

/** Templates are insertion presets. Once materialized, every item has its own stable identity. */
export function materializeRoom(room: RoomPlacement, template: RoomTemplate): RoomPlacement {
  if (room.useTemplateFurniture === false) return room
  const furniture: FurniturePlacement[] = []
  const {width:w,height:h}=room.frame
  const add=(kind:FurnitureKind,x:number,y:number,width?:number,depth?:number,rotation=0,elevation=0,color?:string)=>{
    const base=FURNITURE[kind]
    furniture.push(fitFurniture({id:room.id+'-preset-'+furniture.length,kind,x:x/w,y:y/h,rotation,elevation,color,size:{width:Math.min(width??base.width,w-14),depth:Math.min(depth??base.depth,h-14),height:base.height}},room.frame))
  }
  const seats=room.seats??template.seats
  if(room.template==='empty'||room.template==='room-shell')return {...room,useTemplateFurniture:false,seats:room.seats??[],furniture:room.furniture??[]}
  if(['desk-grid','studio','fulfillment','support-pods','showroom'].includes(room.template))
    for(const seat of seats)add('workstation',seat.x*w,seat.y*h,room.template==='support-pods'?49:58,80,seat.facing==='south'?180:0)
  else for(const seat of seats)add('chair',seat.x*w,seat.y*h,undefined,undefined,seat.facing==='south'?180:0)
  switch(room.template){
    case 'desk-grid':add('plant',21,31);add('plant',w-23,h-22);break
    case 'studio':
      add('rug',w*.36,70,w*.46,100);add('desk',w*.42,60,w*.25,48);add('camera',w*.50,100);add('studio-light',w*.19,70);add('display-shelf',w*.77,26,w*.27);add('plant',w-23,52);break
    case 'fulfillment':
      add('shelf',w*.33,26,w*.45);add('shelf',w*.81,27,w*.26);add('meeting-table',w*.54,82,w*.49,30);add('carton',w*.4,82,25,20,0,25);add('carton',w*.52,80,19,16,0,25);add('printer',w*.70,82,25,20,0,25);add('trolley',w-28,82);add('plant',w*.10,84);break
    case 'support-pods':
      for(const x of [w*.35,w*.65])for(const y of [h*.24,h*.65])add('partition',x,y);add('plant',w-21,h-22);break
    case 'command':
      add('screen',w/2,41,w*.62,30);add('rug',w/2,h*.62,w*.80,h*.48);add('meeting-table',w/2,h*.56,w*.72,47);add('monitor',w*.36,h*.55,24,14,0,25);add('monitor',w*.66,h*.56,24,14,0,25);add('cabinet',w*.13,35,44,22);add('notebook',w*.53,h*.58,15,17,0,26);add('cup',w*.25,h*.61,undefined,undefined,0,26);add('plant',23,h-25);add('plant',w-24,32);break
    case 'showroom':
      add('rug',w*.78,57,w*.33,76);add('display-shelf',w*.24,28,w*.34);add('clothes-rack',w*.78,33);add('plant',w-20,70);break
    case 'meeting':
      add('rug',w*.52,h*.57,w*.77,h*.6);add('meeting-table',w*.52,h*.57,w*.63,h*.28);add('screen',w*.61,15,w*.38);add('notebook',w*.42,h*.55,17,13,0,26);add('notebook',w*.61,h*.61,14,16,0,26);add('cup',w*.33,h*.53,undefined,undefined,0,26);add('cup',w*.70,h*.53,undefined,undefined,0,26);add('plant',27,h-27);add('plant',w-28,33);break
    case 'reception':
      add('counter',w*.51,h*.73,w*.53,38);add('monitor',w*.54,h*.71,22,12,0,29);add('rug',w*.19,h*.34,100,85);add('sofa',w*.19,h*.25,68,29);add('lamp',w*.29,h*.22,13,13);add('coffee-table',w*.18,h*.48,41,25);add('notebook',w*.18+8,h*.48,12,9,0,15);add('plant',w-23,37);add('plant',w-24,h-26);break
    case 'pantry':
      add('counter',w*.68,31,w*.55,34);add('coffee',w*.54,28,20,22,0,29);add('cup',w*.63,33,6,6,0,29);add('microwave',w*.83,28,24,21,0,29);add('sink',w*.91,36,16,15,0,29);add('rug',w*.63,h*.64,140,116);add('round-table',w*.63,h*.64);add('cup',w*.63-13,h*.64,7,7,0,25);add('plant',25,h-25);break
  }
  const result={...room,useTemplateFurniture:false,furniture:[...furniture,...(room.furniture??[])]}
  return {...result,seats:furnitureSeats(result)}
}

export function furnitureSeats(room:RoomPlacement):RoomSeat[]{
  return (room.furniture??[]).filter(item=>item.kind==='workstation'||item.kind==='chair').map(item=>({x:item.x,y:item.y,rotation:item.rotation,facing:item.rotation>=90&&item.rotation<270?'south':'north'}))
}
/** Resize the shell only: preserve furniture dimensions and local world positions. */
export function resizeRoomContents(room:RoomPlacement,frame:RoomPlacement['frame']):RoomPlacement{
  const furniture=room.furniture?.map(item=>fitFurniture({...item,x:item.x*room.frame.width/frame.width,y:item.y*room.frame.height/frame.height},frame))
  const resized={...room,frame,furniture}
  return room.useTemplateFurniture===false?{...resized,seats:furnitureSeats(resized)}:resized
}
