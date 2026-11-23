import type { OfficeLayout, WallSegment } from './api'
import {onSegment} from './region-geometry'
type Point=WallSegment['start']
export const wallLength=(wall:Pick<WallSegment,'start'|'end'>)=>Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y)
export function replaceWallSegment(walls:readonly WallSegment[],wall:WallSegment):WallSegment[]{
  const previous=walls.find(item=>item.id===wall.id)
  const joint=(point:Point)=>{
    if(!previous||!onSegment(point,previous.start,previous.end,1e-4))return point
    const dx=previous.end.x-previous.start.x,dy=previous.end.y-previous.start.y,squared=dx*dx+dy*dy
    const t=squared?((point.x-previous.start.x)*dx+(point.y-previous.start.y)*dy)/squared:0
    return{x:wall.start.x+t*(wall.end.x-wall.start.x),y:wall.start.y+t*(wall.end.y-wall.start.y)}
  }
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
  else if(origin){if(Math.abs(next.x-origin.x)<8&&Math.abs(next.y-origin.y)>12)next.x=origin.x;else if(Math.abs(next.y-origin.y)<8&&Math.abs(next.x-origin.x)>12)next.y=origin.y}
  const endpoints=(layout.wallSegments??[]).flatMap(wall=>[wall.start,wall.end])
  const nearest=endpoints.filter(p=>!origin||Math.hypot(p.x-origin.x,p.y-origin.y)>1).sort((a,b)=>Math.hypot(a.x-next.x,a.y-next.y)-Math.hypot(b.x-next.x,b.y-next.y))[0]
  if(nearest&&Math.hypot(nearest.x-next.x,nearest.y-next.y)<10)next={...nearest}
  else{
    const border=[{x:0,y:0},{x:layout.width,y:0},{x:layout.width,y:layout.height},{x:0,y:layout.height}]
    const segments=[...(layout.wallSegments??[]),...border.map((start,index)=>({start,end:border[(index+1)%4]}))],target={...next}
    let distance=10;const close:typeof segments=[]
    for(const segment of segments){const {start,end}=segment,dx=end.x-start.x,dy=end.y-start.y,squared=dx*dx+dy*dy;if(!squared)continue;const t=Math.max(0,Math.min(1,((target.x-start.x)*dx+(target.y-start.y)*dy)/squared)),candidate={x:start.x+t*dx,y:start.y+t*dy},gap=Math.hypot(target.x-candidate.x,target.y-candidate.y);if(gap<14)close.push(segment);if(gap<distance&&(!origin||Math.hypot(candidate.x-origin.x,candidate.y-origin.y)>1)){distance=gap;next=candidate}}
    // Prefer an actual nearby graph intersection over either wall's projection.
    let intersectionDistance=10
    for(let i=0;i<close.length;i++)for(let j=i+1;j<close.length;j++){
      const a=close[i].start,b=close[i].end,c=close[j].start,d=close[j].end,rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,det=rx*sy-ry*sx
      if(Math.abs(det)<1e-8)continue
      const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/det,u=((c.x-a.x)*ry-(c.y-a.y)*rx)/det
      if(t<0||t>1||u<0||u>1)continue
      const p={x:a.x+t*rx,y:a.y+t*ry},gap=Math.hypot(target.x-p.x,target.y-p.y)
      if(gap<intersectionDistance&&(!origin||Math.hypot(p.x-origin.x,p.y-origin.y)>1)){intersectionDistance=gap;next=p}
    }
  }

  return {x:Math.max(0,Math.min(layout.width,Math.round(next.x*1e5)/1e5)),y:Math.max(0,Math.min(layout.height,Math.round(next.y*1e5)/1e5))}
}
