import type {PlanPoint as Point,RoomBoundary,RoomPlacement} from './api'
export const GEOMETRY_EPS=1e-5
export const cross=(a:Point,b:Point,c:Point)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)
export function onSegment(p:Point,a:Point,b:Point,tolerance=GEOMETRY_EPS){
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)
  return length>0&&Math.abs(cross(a,b,p))/length<=tolerance&&p.x>=Math.min(a.x,b.x)-tolerance&&p.x<=Math.max(a.x,b.x)+tolerance&&p.y>=Math.min(a.y,b.y)-tolerance&&p.y<=Math.max(a.y,b.y)+tolerance
}
export function ringArea(ring:readonly Point[]){return ring.reduce((sum,p,index)=>{const q=ring[(index+1)%ring.length];return sum+p.x*q.y-q.x*p.y},0)/2}
export function ringContains(ring:readonly Point[],p:Point,edge=true){
  let inside=false
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const a=ring[j],b=ring[i]
    if(onSegment(p,a,b))return edge
    if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside
  }
  return inside
}
export function boundaryContains(boundary:RoomBoundary,p:Point,edge=true){return ringContains(boundary.outer,p,edge)&&!(boundary.holes??[]).some(hole=>ringContains(hole,p,!edge))}
export function roomContains(room:RoomPlacement,p:Point){return room.boundary?boundaryContains(room.boundary,p):p.x>=room.frame.x&&p.x<=room.frame.x+room.frame.width&&p.y>=room.frame.y&&p.y<=room.frame.y+room.frame.height}
export function boundaryArea(boundary:RoomBoundary){return Math.abs(ringArea(boundary.outer))-(boundary.holes??[]).reduce((area,hole)=>area+Math.abs(ringArea(hole)),0)}
export function boundaryFrame(boundary:RoomBoundary){const x=Math.min(...boundary.outer.map(p=>p.x)),y=Math.min(...boundary.outer.map(p=>p.y));return{x,y,width:Math.max(...boundary.outer.map(p=>p.x))-x,height:Math.max(...boundary.outer.map(p=>p.y))-y}}
export function interiorPoint(boundary:RoomBoundary):Point{
  const ys=[...new Set([boundary.outer,...boundary.holes??[]].flatMap(ring=>ring.map(p=>p.y)))].sort((a,b)=>a-b)
  let best:Point|undefined,score=-Infinity
  for(let row=1;row<ys.length;row++){
    const y=(ys[row-1]+ys[row])/2,xs:number[]=[]
    for(const ring of [boundary.outer,...boundary.holes??[]])for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];if((a.y>y)!==(b.y>y))xs.push(a.x+(y-a.y)*(b.x-a.x)/(b.y-a.y))}
    xs.sort((a,b)=>a-b)
    for(let i=1;i<xs.length;i+=2){const width=xs[i]-xs[i-1],quality=Math.min(width,ys[row]-ys[row-1]);if(quality>score){score=quality;best={x:(xs[i]+xs[i-1])/2,y}}}
  }
  return best??boundary.outer[0]
}
export function segmentsCross(a:Point,b:Point,c:Point,d:Point){return cross(a,b,c)*cross(a,b,d)<-GEOMETRY_EPS&&cross(c,d,a)*cross(c,d,b)<-GEOMETRY_EPS}
export function regionLabelPoint(room:RoomPlacement):Point{
  if(!room.boundary)return{x:room.frame.x+12,y:room.frame.y+5}
  const boundary=room.boundary,f=room.frame,anchor=interiorPoint(boundary)
  const xs=[...new Set([f.x+20,...boundary.outer.map(p=>p.x+20),anchor.x])].sort((a,b)=>a-b)
  const ys=[...new Set([f.y+55,...boundary.outer.map(p=>p.y+55),f.y+f.height*.25,f.y+f.height*.5,anchor.y])].sort((a,b)=>a-b)
  const occupied=(room.furniture??[]).map(item=>({x:f.x+item.x*f.width,y:f.y+item.y*f.height}))
  for(const y of ys)for(const x of xs){const p={x,y};if(boundaryContains(boundary,p,false)&&boundaryContains(boundary,{x:x+95,y},false)&&!occupied.some(item=>item.x>=x-25&&item.x<=x+135&&Math.abs(item.y-y)<60))return p}
  return anchor
}
export function boundarySignature(boundary:RoomBoundary){
  const key=(ring:readonly Point[])=>{const values=ring.map(p=>`${p.x.toFixed(4)},${p.y.toFixed(4)}`);const candidates=[values,[...values].reverse()].map(list=>{let start=0;for(let i=1;i<list.length;i++)if(list[i]<list[start])start=i;return [...list.slice(start),...list.slice(0,start)].join(';')});return candidates.sort()[0]}
  return key(boundary.outer)+'|'+(boundary.holes??[]).map(key).sort().join('|')
}
