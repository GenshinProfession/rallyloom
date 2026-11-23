import type { OfficeLayout, WallSegment } from './api'
type Point=WallSegment['start']
export const wallLength=(wall:Pick<WallSegment,'start'|'end'>)=>Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y)
export function replaceWallSegment(walls:readonly WallSegment[],wall:WallSegment):WallSegment[]{
  const previous=walls.find(item=>item.id===wall.id)
  const joint=(point:Point)=>previous&&point.x===previous.start.x&&point.y===previous.start.y?wall.start:previous&&point.x===previous.end.x&&point.y===previous.end.y?wall.end:point
  return walls.map(item=>{
    if(item.id===wall.id)return wall
    const start=joint(item.start),end=joint(item.end)
    return start===item.start&&end===item.end?item:{...item,start,end}
  })
}
export function validateWallSegments(layout:OfficeLayout){
  if(!Array.isArray(layout.wallSegments??[])||(layout.wallSegments?.length??0)>240)throw Error('最多可绘制 240 段墙。')
  const ids=new Set<string>()
  for(const wall of layout.wallSegments??[]){
    if(!/^[A-Za-z0-9_-]{1,128}$/.test(wall.id)||ids.has(wall.id))throw Error('墙段标识重复或为空。');ids.add(wall.id)
    for(const p of [wall.start,wall.end])if(!p||![p.x,p.y].every(Number.isFinite)||p.x<0||p.y<0||p.x>layout.width||p.y>layout.height)throw Error('墙段端点超出画布。')
    if(wallLength(wall)<12||!Number.isFinite(wall.thickness)||wall.thickness<2||wall.thickness>24||!Number.isFinite(wall.height)||wall.height<8||wall.height>100||!['solid','glass'].includes(wall.finish))throw Error('墙段长度、厚度、高度或材质无效。')
    const door=wall.opening,length=wallLength(wall)
    if(door&&(![door.width,door.offset].every(Number.isFinite)||door.width<12||door.offset*length-door.width/2<6||door.offset*length+door.width/2>length-6))throw Error('门洞两侧至少各保留 6 的墙体。')
  }
}
export function snapWallPoint(point:Point,layout:OfficeLayout,origin?:Point,shift=false):Point{
  let next={x:Math.max(0,Math.min(layout.width,Math.round(point.x))),y:Math.max(0,Math.min(layout.height,Math.round(point.y)))}
  if(origin&&shift){const dx=next.x-origin.x,dy=next.y-origin.y,angle=Math.round(Math.atan2(dy,dx)/(Math.PI/4))*Math.PI/4,length=Math.hypot(dx,dy);next={x:origin.x+Math.cos(angle)*length,y:origin.y+Math.sin(angle)*length}}
  const endpoints=(layout.wallSegments??[]).flatMap(wall=>[wall.start,wall.end])
  const nearest=endpoints.filter(p=>!origin||Math.hypot(p.x-origin.x,p.y-origin.y)>1).sort((a,b)=>Math.hypot(a.x-next.x,a.y-next.y)-Math.hypot(b.x-next.x,b.y-next.y))[0]
  if(nearest&&Math.hypot(nearest.x-next.x,nearest.y-next.y)<10)next={...nearest}
  return {x:Math.max(0,Math.min(layout.width,Math.round(next.x))),y:Math.max(0,Math.min(layout.height,Math.round(next.y)))}
}
