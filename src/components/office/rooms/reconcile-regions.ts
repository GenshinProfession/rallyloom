import type {LayoutState} from '@/lib/store/types'
import type {RoomBoundary,RoomPlacement,PlanPoint} from './api'
import {detectRegions} from './detect-regions'
import {boundaryContains,boundaryFrame,boundarySignature,interiorPoint,roomContains} from './region-geometry'
import {furnitureSeats} from './template-furniture'
import {seatOrder} from './seat-order'
import {normalizeWallConnections} from './normalize-walls'
import {validateWallSegments} from './free-walls'

export function hasFreeRegions(layout:LayoutState){return !!layout.wallSegments?.length||layout.rooms.some(room=>room.boundary)}
const roomBoundary=(room:RoomPlacement):RoomBoundary=>room.boundary??{outer:[{x:room.frame.x,y:room.frame.y},{x:room.frame.x+room.frame.width,y:room.frame.y},{x:room.frame.x+room.frame.width,y:room.frame.y+room.frame.height},{x:room.frame.x,y:room.frame.y+room.frame.height}]}
function overlapScore(a:RoomBoundary,b:RoomBoundary){
  const f=boundaryFrame(a),g=boundaryFrame(b),x=Math.max(f.x,g.x),y=Math.max(f.y,g.y),width=Math.min(f.x+f.width,g.x+g.width)-x,height=Math.min(f.y+f.height,g.y+g.height)-y
  if(width<=0||height<=0)return 0
  let count=0;for(let row=0;row<9;row++)for(let col=0;col<9;col++){const p={x:x+(col+.5)*width/9,y:y+(row+.5)*height/9};if(boundaryContains(a,p,false)&&boundaryContains(b,p,false))count++}
  return count*width*height/81
}
/** Runs in the draft only. Room IDs/names survive exact geometry and best-overlap matches. */
export function reconcileRegions(layout:LayoutState,createId=()=>crypto.randomUUID()):LayoutState{
  if(!hasFreeRegions(layout))return layout
  // Existing preset rooms keep their architecture until the user explicitly opens their walls.
  if(layout.rooms.some(room=>!room.boundary&&room.template!=='empty'&&(['north','east','south','west']as const).some(side=>room.walls?.[side]!=='open')))return layout
  layout={...layout,wallSegments:normalizeWallConnections(layout)}
  validateWallSegments(layout)
  const regions=detectRegions(layout),old=layout.rooms
  const matching=new Map<number,RoomPlacement>(),used=new Set<string>()
  regions.forEach((boundary,index)=>{const signature=boundarySignature(boundary),room=old.find(room=>!used.has(room.id)&&boundarySignature(roomBoundary(room))===signature);if(room){matching.set(index,room);used.add(room.id)}})
  const candidates=regions.flatMap((boundary,index)=>matching.has(index)?[]:old.filter(room=>!used.has(room.id)).map(room=>({index,room,score:overlapScore(boundary,roomBoundary(room))}))).filter(pair=>pair.score>0).sort((a,b)=>b.score-a.score)
  for(const pair of candidates)if(!matching.has(pair.index)&&!used.has(pair.room.id)){matching.set(pair.index,pair.room);used.add(pair.room.id)}
  const names=new Set(old.map(room=>room.name));let nextName=1
  const rooms:RoomPlacement[]=regions.map((boundary,index)=>{
    const matched=matching.get(index),point=interiorPoint(boundary),source=matched??old.find(room=>roomContains(room,point))
    let name=matched?.name
    if(!name||['开放办公区','办公室','空白房间'].includes(name)){while(names.has('区域 '+nextName))nextName++;name='区域 '+nextName++;names.add(name)}
    return {...source,id:matched?.id??createId(),name,template:'room-shell',frame:boundaryFrame(boundary),boundary,door:undefined,
      walls:{north:'open',east:'open',south:'open',west:'open'},useTemplateFurniture:false,
      floorMaterial:source?.floorMaterial??'quartz',floor:source?.floor??'#eeebe3',furniture:[],seats:[]}
  })
  const findRoom=(point:PlanPoint,preferred?:string)=>rooms.find(room=>room.id===preferred&&roomContains(room,point))??rooms.find(room=>roomContains(room,point))
  for(const source of old)for(const item of source.furniture??[]){
    const point={x:source.frame.x+item.x*source.frame.width,y:source.frame.y+item.y*source.frame.height},target=findRoom(point,source.id)
    if(!target)throw Error('有家具未落在识别区域内，请检查墙体边界。')
    target.furniture=[...target.furniture??[],{...item,x:(point.x-target.frame.x)/target.frame.width,y:(point.y-target.frame.y)/target.frame.height}]
  }
  for(const room of rooms){if((room.furniture?.length??0)>60)throw Error('合并后的区域家具超过 60 件，请先调整家具。');room.seats=furnitureSeats(room)}
  const assignments:Record<string,string>={},seatAssignments:Record<string,number>={}
  for(const source of old){
    const members=Object.keys(layout.assignments).filter(id=>layout.assignments[id]===source.id).map(id=>({id}))
    const stations=(source.furniture??[]).filter(item=>item.kind==='workstation'||item.kind==='chair')
    for(const [index,member]of seatOrder(members,source.seats?.length??0,layout.seatAssignments).entries()){
      if(!member)continue
      const station=stations[index],seat=source.seats?.[index];if(!seat)continue
      const point={x:source.frame.x+seat.x*source.frame.width,y:source.frame.y+seat.y*source.frame.height},target=findRoom(point,source.id)
      if(!target)continue
      const targetStations=(target.furniture??[]).filter(item=>item.kind==='workstation'||item.kind==='chair'),newIndex=targetStations.findIndex(item=>item.id===station?.id)
      if(newIndex>=0){assignments[member.id]=target.id;seatAssignments[member.id]=newIndex}
    }
  }
  const mapRoom=(id:string)=>rooms.find(room=>room.id===id)?.id??(()=>{const source=old.find(room=>room.id===id);return source?findRoom(interiorPoint(roomBoundary(source)))?.id:undefined})()
  for(const room of rooms)if(room.workbench?.linkedRoomIds)room.workbench={...room.workbench,linkedRoomIds:[...new Set(room.workbench.linkedRoomIds.flatMap(id=>{const mapped=mapRoom(id);return mapped?[mapped]:[]}))]}
  return {...layout,rooms,assignments,seatAssignments,unitsPerMeter:layout.unitsPerMeter??50}
}
