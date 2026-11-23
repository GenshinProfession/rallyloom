import * as THREE from 'three'
import type {RoomPlacement} from '../rooms/api'
export function roomFloorGeometry(room:RoomPlacement){
  if(!room.boundary)return new THREE.PlaneGeometry(room.frame.width,room.frame.height).translate(room.frame.width/2,-room.frame.height/2,0)
  const points=(ring:readonly {x:number;y:number}[])=>ring.map(p=>new THREE.Vector2(p.x-room.frame.x,-(p.y-room.frame.y)))
  const shape=new THREE.Shape(points(room.boundary.outer))
  for(const hole of room.boundary.holes??[])shape.holes.push(new THREE.Path(points(hole)))
  return new THREE.ShapeGeometry(shape)
}
