import type {FurniturePlacement,RoomPlacement,PlanPoint} from './api'
import {furnitureFits,furnitureSize} from './placed-furniture'
import {boundaryContains,ringContains,segmentsCross} from './region-geometry'
export function furnitureFootprint(item:FurniturePlacement,room:RoomPlacement):PlanPoint[]{
  const {width,depth}=furnitureSize(item),angle=item.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle)
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>({x:room.frame.x+item.x*room.frame.width+c*x*width/2-s*y*depth/2,y:room.frame.y+item.y*room.frame.height+s*x*width/2+c*y*depth/2}))
}
export function furnitureFitsRoom(item:FurniturePlacement,room:RoomPlacement){
  if(!room.boundary)return furnitureFits(item,room.frame)
  const corners=furnitureFootprint(item,room),boundary=room.boundary
  if(!corners.every(point=>boundaryContains(boundary,point)))return false
  for(let i=0;i<4;i++)for(const ring of [boundary.outer,...boundary.holes??[]])for(let j=0;j<ring.length;j++)if(segmentsCross(corners[i],corners[(i+1)%4],ring[j],ring[(j+1)%ring.length]))return false
  if(boundary.holes?.some(hole=>ringContains(corners,hole[0],false)))return false
  return true
}
