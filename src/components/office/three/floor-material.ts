import { MeshStandardMaterial } from 'three'
import type { FloorMaterial } from '../rooms/api'

/** World-space procedural detail: room resizing and camera zoom never stretch a bitmap. */
export function createFloorMaterial(kind: FloorMaterial, color: string) {
  const material = new MeshStandardMaterial({ color, roughness: kind === 'quartz' ? .34 : kind === 'tile' ? .48 : .78, metalness: 0 })
  material.customProgramCacheKey = () => 'office-floor-v2-' + kind
  material.onBeforeCompile = shader => {
    shader.vertexShader = 'varying vec2 officeFloorPosition;\n' + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nofficeFloorPosition = (modelMatrix * vec4(transformed, 1.0)).xz;')
    shader.fragmentShader = `varying vec2 officeFloorPosition;
float floorHash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float floorNoise(vec2 p) {
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(floorHash(i),floorHash(i+vec2(1,0)),f.x),mix(floorHash(i+vec2(0,1)),floorHash(i+vec2(1,1)),f.x),f.y);
}
float floorDetail(vec2 p) { return mix(.5, floorNoise(p), 1.0-smoothstep(.35,1.4,max(fwidth(p.x),fwidth(p.y)))); }
float floorJoint(vec2 p, float width) {
  vec2 distanceToEdge=min(fract(p),1.0-fract(p));
  vec2 aa=max(fwidth(p),vec2(.0001));
  vec2 edge=1.0-smoothstep(vec2(width),vec2(width)+aa,distanceToEdge);
  return max(edge.x,edge.y);
}
` + shader.fragmentShader
    const pattern: Record<FloorMaterial, string> = {
      quartz: `vec2 tile=officeFloorPosition/48.0;
        float grain=floorDetail(officeFloorPosition*1.5);
        float vein=smoothstep(.69,.83,floorNoise(officeFloorPosition/28.0+floorNoise(officeFloorPosition/53.0)*2.0));
        float variation=floorHash(floor(tile))*.018;
        float stone=1.0-variation-(grain-.5)*.036-vein*.025;
        diffuseColor.rgb*=stone*(1.0-floorJoint(tile,.0035)*.075);`,
      terrazzo: `vec2 tile=officeFloorPosition/52.0;
        float chips=smoothstep(.66,.84,floorDetail(officeFloorPosition*.85));
        diffuseColor.rgb*=1.0-chips*.20-(floorDetail(officeFloorPosition*2.0)-.5)*.05-floorJoint(tile,.0025)*.07;`,
      tile: `vec2 tile=officeFloorPosition/48.0;
        diffuseColor.rgb*=1.0-floorHash(floor(tile))*.025-floorJoint(tile,.004)*.11-(floorDetail(officeFloorPosition*.7)-.5)*.02;`,
      wood: `vec2 plank=vec2(officeFloorPosition.x/90.0,officeFloorPosition.y/13.0);
        plank.x+=mod(floor(plank.y),3.0)/3.0;
        float grain=floorDetail(vec2(officeFloorPosition.x*.07,officeFloorPosition.y*1.5));
        diffuseColor.rgb*=.97+grain*.08-floorHash(floor(plank))*.055-floorJoint(plank,.005)*.12;`,
      concrete: `diffuseColor.rgb*=.96+floorNoise(officeFloorPosition/20.0)*.045+(floorDetail(officeFloorPosition*.8)-.5)*.025;`,
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + pattern[kind])
  }
  return material
}
