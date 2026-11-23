import type {OfficeLayout,PlanPoint as Point,RoomBoundary} from './api'
import {cross,onSegment,ringArea,ringContains} from './region-geometry'

/** Node the planar wall graph, remove bridges, and walk bounded half-edge faces. Doors remain structural edges. */
export function detectRegions(layout:OfficeLayout):RoomBoundary[]{
  const {width:w,height:h}=layout
  const border=[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}]
  const segments=[...border.map((start,i)=>({start,end:border[(i+1)%4]})),...(layout.wallSegments??[])]
  const cuts=segments.map(segment=>[segment.start,segment.end])
  for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
    const {start:a,end:b}=segments[i],{start:c,end:d}=segments[j]
    const rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,det=rx*sy-ry*sx
    if(Math.abs(det)>1e-8){
      const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/det,u=((c.x-a.x)*ry-(c.y-a.y)*rx)/det
      if(t>=-1e-8&&t<=1+1e-8&&u>=-1e-8&&u<=1+1e-8){const p={x:a.x+t*rx,y:a.y+t*ry};cuts[i].push(p);cuts[j].push(p)}
    }else if(Math.abs(cross(a,b,c))<1e-5){for(const p of [a,b,c,d]){if(onSegment(p,a,b))cuts[i].push(p);if(onSegment(p,c,d))cuts[j].push(p)}}
  }
  const points:Point[]=[],index=new Map<string,number>(),edges=new Set<string>(),adj:number[][]=[]
  const node=(p:Point)=>{const x=Math.round(p.x*1e5)/1e5,y=Math.round(p.y*1e5)/1e5,key=x+','+y;let id=index.get(key);if(id===undefined){id=points.length;points.push({x,y});index.set(key,id);adj.push([])}return id}
  cuts.forEach((list,i)=>{
    const a=segments[i].start,b=segments[i].end
    list.sort((p,q)=>(p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y)-(q.x-a.x)*(b.x-a.x)-(q.y-a.y)*(b.y-a.y))
    for(let j=1;j<list.length;j++){const u=node(list[j-1]),v=node(list[j]);if(u===v)continue;const key=u<v?u+':'+v:v+':'+u;if(edges.has(key))continue;edges.add(key);adj[u].push(v);adj[v].push(u)}
  })
  if(points.length>12000)throw Error('墙体交点过多，请简化布局。')
  const visited=new Set<number>(),order:number[]=[],low:number[]=[],bridges=new Set<string>();let clock=0
  // Iterative Tarjan avoids stack exhaustion on long wall chains.
  for(let root=0;root<points.length;root++){
    if(visited.has(root))continue
    const stack=[{u:root,parent:-1,next:0}];visited.add(root);order[root]=low[root]=clock++
    while(stack.length){const frame=stack[stack.length-1],{u,parent}=frame
      if(frame.next<adj[u].length){const v=adj[u][frame.next++];if(v===parent)continue;if(!visited.has(v)){visited.add(v);order[v]=low[v]=clock++;stack.push({u:v,parent:u,next:0})}else low[u]=Math.min(low[u],order[v])}
      else{stack.pop();if(parent>=0){low[parent]=Math.min(low[parent],low[u]);if(low[u]>order[parent])bridges.add(parent<u?parent+':'+u:u+':'+parent)}}
    }
  }
  const neighbors=adj.map((list,u)=>list.filter(v=>!bridges.has(u<v?u+':'+v:v+':'+u)).sort((a,b)=>Math.atan2(points[a].y-points[u].y,points[a].x-points[u].x)-Math.atan2(points[b].y-points[u].y,points[b].x-points[u].x)))
  const walked=new Set<string>(),rings:Point[][]=[]
  for(let a=0;a<points.length;a++)for(const b of neighbors[a]){
    if(walked.has(a+':'+b))continue
    let u=a,v=b;const ring:Point[]=[]
    do{walked.add(u+':'+v);ring.push(points[u]);const list=neighbors[v],next=list[(list.indexOf(u)-1+list.length)%list.length];u=v;v=next}while((u!==a||v!==b)&&ring.length<=edges.size*2)
    // Strip collinear vertices introduced at T junctions or overlapping runs.
    let clean=ring,changed=true
    while(changed&&clean.length>3){changed=false;clean=clean.filter((p,i,all)=>{const keep=Math.abs(cross(all[(i+all.length-1)%all.length],p,all[(i+1)%all.length]))>1e-6;if(!keep)changed=true;return keep})}
    if(clean.length>256)throw Error('单个区域边界超过256个顶点，请简化墙体。')
    if(clean.length>=3&&ringArea(clean)>1e-3)rings.push(clean)
    if(rings.length>80)throw Error('封闭区域超过 80 个，请简化墙体。')
  }
  const parent=rings.map((ring,i)=>{
    let candidate=-1,area=Infinity
    for(let j=0;j<rings.length;j++){if(i===j)continue;const outer=rings[j],size=ringArea(outer);if(size<=ringArea(ring)+1e-4||size>=area)continue;if(ring.every(p=>ringContains(outer,p))&&ring.some(p=>ringContains(outer,p,false))){candidate=j;area=size}}
    return candidate
  })
  const regions=rings.map((outer,i)=>({outer,holes:rings.filter((_,j)=>parent[j]===i)}))
  if(regions.some(region=>region.holes.length>32))throw Error('单个区域内洞超过32个，请简化布局。')
  return regions.sort((a,b)=>Math.min(...a.outer.map(p=>p.y))-Math.min(...b.outer.map(p=>p.y))||Math.min(...a.outer.map(p=>p.x))-Math.min(...b.outer.map(p=>p.x)))
}
