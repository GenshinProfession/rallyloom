import type {OfficeLayout,WallSegment,PlanPoint as Point} from './api'

/** Repair visually touching legacy endpoints in the draft, including wall-body T contacts. */
export function normalizeWallConnections(layout:OfficeLayout):readonly WallSegment[]{
  let walls=[...layout.wallSegments??[]]
  for(let pass=0;pass<3;pass++){
    const points=walls.flatMap(wall=>[wall.start,wall.end]),parent=points.map((_,i)=>i)
    const root=(value:number):number=>{let node=value;while(parent[node]!==node)node=parent[node];while(parent[value]!==value){const next=parent[value];parent[value]=node;value=next}return node}
    for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)<=6){const a=root(i),b=root(j);if(a!==b)parent[b]=a}
    const groups=new Map<number,number[]>()
    points.forEach((_,i)=>{const id=root(i);groups.set(id,[...groups.get(id)??[],i])})
    const resolved=new Map<number,Point>()
    for(const [id,members]of groups){
      let point={x:members.reduce((sum,i)=>sum+points[i].x,0)/members.length,y:members.reduce((sum,i)=>sum+points[i].y,0)/members.length}
      if(point.x<8)point.x=0;else if(layout.width-point.x<8)point.x=layout.width
      if(point.y<8)point.y=0;else if(layout.height-point.y<8)point.y=layout.height
      let distance=8,best=point
      walls.forEach((wall,index)=>{
        if(members.some(member=>Math.floor(member/2)===index))return
        const dx=wall.end.x-wall.start.x,dy=wall.end.y-wall.start.y,squared=dx*dx+dy*dy;if(!squared)return
        const t=((point.x-wall.start.x)*dx+(point.y-wall.start.y)*dy)/squared;if(t<0||t>1)return
        const candidate={x:wall.start.x+t*dx,y:wall.start.y+t*dy},gap=Math.hypot(candidate.x-point.x,candidate.y-point.y)
        if(gap<distance){best=candidate;distance=gap}
      })
      resolved.set(id,{x:Math.round(best.x*1e5)/1e5,y:Math.round(best.y*1e5)/1e5})
    }
    const next=walls.map((wall,index)=>({...wall,start:resolved.get(root(index*2))!,end:resolved.get(root(index*2+1))!}))
    const changed=next.some((wall,i)=>Math.hypot(wall.start.x-walls[i].start.x,wall.start.y-walls[i].start.y)>1e-5||Math.hypot(wall.end.x-walls[i].end.x,wall.end.y-walls[i].end.y)>1e-5)
    walls=next;if(!changed)break
  }
  return walls
}
