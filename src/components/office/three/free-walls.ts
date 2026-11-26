import * as THREE from 'three'
import {WALL_HEIGHT} from '../rooms/api'
import type {WallSegment} from '../rooms/api'
import type {ModelKit} from './model'
import {wallLength} from '../rooms/free-walls'

export function buildFreeWall(wall:WallSegment,model:ModelKit){
  const group=new THREE.Group(),length=wallLength(wall)
  const ranges=wall.opening?[[0,wall.opening.offset*length-wall.opening.width/2],[wall.opening.offset*length+wall.opening.width/2,length]]:[[0,length]]
  group.userData.wallId=wall.id
  for(const [start,end]of ranges){
    const width=end-start;if(width<=0)continue
    const body=model.box(group,(start+end)/2-length/2,0,0,width,WALL_HEIGHT,wall.thickness,wall.finish==='glass'?'#a9c6c6':'#515d59')
    if(wall.finish==='glass'){body.material= new THREE.MeshStandardMaterial({color:'#b6d2d1',transparent:true,opacity:.3,roughness:.15,depthWrite:false})}
    model.box(group,(start+end)/2-length/2,WALL_HEIGHT,0,width,1,wall.thickness+.5,'#7f8e87')
    model.box(group,(start+end)/2-length/2,0,wall.thickness/2,width,2,.7,'#d4dfd8')
  }
  group.position.set((wall.start.x+wall.end.x)/2,0,(wall.start.y+wall.end.y)/2)
  group.rotation.y=-Math.atan2(wall.end.y-wall.start.y,wall.end.x-wall.start.x)
  return group
}
