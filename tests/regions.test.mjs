import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const root=new URL('../src/components/office/rooms/',import.meta.url)
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')
const source=name=>readFileSync(new URL(name,root),'utf8')
const geometry=url(source('region-geometry.ts'))
const {boundaryArea,boundaryContains,interiorPoint}=await import(geometry)
const {detectRegions}=await import(url(source('detect-regions.ts').replace("from './region-geometry'",`from '${geometry}'`)))
const wall=(x,y,a,b,id='w')=>({id,start:{x,y},end:{x:a,y:b},thickness:6,height:26,finish:'solid'})
const layout=walls=>({width:1000,height:700,rooms:[],wallSegments:walls})
const total=regions=>regions.reduce((sum,region)=>sum+boundaryArea(region),0)
test('user floor plan yields four independently closed regions including an L-shaped area',()=>{
 const regions=detectRegions(layout([wall(200,0,200,470,'a'),wall(0,470,200,470,'b'),wall(200,330,1000,330,'c'),wall(700,0,700,330,'d')]))
 assert.equal(regions.length,4);assert.equal(total(regions),700000);assert.ok(regions.some(region=>region.outer.length===6))
 for(const region of regions)assert.ok(boundaryContains(region,interiorPoint(region)))
})
test('crossings, T-junctions, overlaps and structural doors close regions; dangling walls do not',()=>{
 const vertical=wall(450,0,450,700,'v'),horizontal={...wall(0,330,1000,330,'h'),opening:{offset:.5,width:42}}
 const regions=detectRegions(layout([vertical,horizontal,wall(450,50,450,600,'duplicate'),wall(100,100,200,200,'loose')]))
 assert.equal(regions.length,4);assert.equal(total(regions),700000)
 assert.equal(detectRegions(layout([wall(100,0,100,500,'stub')])).length,1)
})
test('disconnected closed interior islands generate a room and a surrounding region with a hole',()=>{
 const regions=detectRegions(layout([wall(200,200,450,200,'a'),wall(450,200,450,450,'b'),wall(450,450,200,450,'c'),wall(200,450,200,200,'d')]))
 assert.equal(regions.length,2);assert.equal(total(regions),700000)
 const outside=regions.find(region=>region.holes.length);assert.ok(outside);assert.equal(boundaryContains(outside,{x:300,y:300}),false)
 for(const region of regions)assert.ok(boundaryContains(region,interiorPoint(region)))
})
test('arbitrary diagonal geometry preserves total floor area across nested and intersecting walls',()=>{
 const regions=detectRegions(layout([wall(0,0,1000,700,'diagonal'),wall(1000,0,0,700,'other')]))
 assert.equal(regions.length,4);assert.ok(Math.abs(total(regions)-700000)<.01)
})

const furniture=url(source('furniture.ts').replace("from 'three'",`from '${import.meta.resolve('three')}'`))
const placed=url(source('placed-furniture.ts').replace("from 'three'",`from '${import.meta.resolve('three')}'`).replace("from './furniture'",`from '${furniture}'`))
const materialized=url(source('template-furniture.ts').replace("from './placed-furniture'",`from '${placed}'`))
const order=url(source('seat-order.ts'))
const detected=url(source('detect-regions.ts').replace("from './region-geometry'",`from '${geometry}'`))
const freeWalls=url(source('free-walls.ts').replace("from './region-geometry'",`from '${geometry}'`)),normalized=url(source('normalize-walls.ts'))
const {reconcileRegions}=await import(url(source('reconcile-regions.ts').replace("from './detect-regions'",`from '${detected}'`).replace("from './region-geometry'",`from '${geometry}'`).replace("from './template-furniture'",`from '${materialized}'`).replace("from './seat-order'",`from '${order}'`).replace("from './normalize-walls'",`from '${normalized}'`).replace("from './free-walls'",`from '${freeWalls}'`)))
const {furnitureFitsRoom}=await import(url(source('furniture-region.ts').replace("from './placed-furniture'",`from '${placed}'`).replace("from './region-geometry'",`from '${geometry}'`)))
test('split, rename, move and merge preserve furniture world positions and member-to-station assignments',()=>{
 const items=[{id:'left-desk',kind:'workstation',rotation:0,x:.12,y:.2,size:{width:58,depth:80,height:40}},{id:'right-desk',kind:'workstation',rotation:0,x:.7,y:.2,size:{width:58,depth:80,height:40}}]
 const initial={...layout([wall(400,0,400,700,'split')]),assignments:{alice:'open',bob:'open'},seatAssignments:{alice:0,bob:1},rooms:[{id:'open',name:'研发',template:'room-shell',frame:{x:0,y:0,width:1000,height:700},walls:{north:'open',east:'open',south:'open',west:'open'},useTemplateFurniture:false,furniture:items,seats:items.map(item=>({x:item.x,y:item.y,rotation:0}))}]}
 let nextId=0;const result=reconcileRegions(initial,()=>`region-${++nextId}`)
 assert.equal(result.rooms.length,2);assert.notEqual(result.assignments.alice,result.assignments.bob)
 for(const room of result.rooms)for(const item of room.furniture){const before=items.find(value=>value.id===item.id);assert.ok(Math.abs(room.frame.x+item.x*room.frame.width-before.x*1000)<1e-6);assert.ok(furnitureFitsRoom(item,room));assert.deepEqual(item.size,before.size)}
 const left=result.rooms.find(room=>room.id===result.assignments.alice);left.name='会议室'
 const adjusted=reconcileRegions({...result,wallSegments:[wall(450,0,450,700,'split')]})
 assert.equal(adjusted.rooms.find(room=>room.id===left.id).name,'会议室');assert.equal(adjusted.assignments.alice,left.id)
 const merged=reconcileRegions({...adjusted,wallSegments:[]});assert.equal(merged.rooms.length,1);assert.equal(merged.rooms[0].furniture.length,2);assert.equal(Object.keys(merged.assignments).length,2);assert.equal(new Set(Object.values(merged.seatAssignments)).size,2)
 assert.equal(initial.rooms[0].furniture[0].x,.12)
})
test('furniture containment uses the actual concave boundary and holes, not its bounding rectangle',()=>{
 const boundary={outer:[{x:0,y:0},{x:500,y:0},{x:500,y:200},{x:200,y:200},{x:200,y:500},{x:0,y:500}]}
 const room={id:'l',name:'L',template:'room-shell',frame:{x:0,y:0,width:500,height:500},boundary}
 const item={id:'sofa',kind:'sofa',rotation:0,x:.2,y:.6,size:{width:50,depth:40,height:30}}
 assert.equal(furnitureFitsRoom(item,room),true);assert.equal(furnitureFitsRoom({...item,x:.7,y:.7},room),false)
 assert.equal(furnitureFitsRoom({...item,x:.4,y:.4,size:{width:100,depth:100}},room),false)
 const holeRoom={...room,boundary:{outer:[{x:0,y:0},{x:500,y:0},{x:500,y:500},{x:0,y:500}],holes:[[{x:200,y:200},{x:300,y:200},{x:300,y:300},{x:200,y:300}]]}}
 assert.equal(furnitureFitsRoom({...item,x:.5,y:.5,size:{width:200,depth:200}},holeRoom),false)
})

const THREE=await import('three')
const {roomFloorGeometry}=await import(url(readFileSync(new URL('../src/components/office/three/region-floor.ts',import.meta.url),'utf8').replace("from 'three'",`from '${import.meta.resolve('three')}'`)))
test('rendered floor triangles and ray picking respect holes rather than the enclosing rectangle',()=>{
 const room={id:'hole',name:'Ring',template:'room-shell',frame:{x:0,y:0,width:500,height:500},boundary:{outer:[{x:0,y:0},{x:500,y:0},{x:500,y:500},{x:0,y:500}],holes:[[{x:200,y:200},{x:300,y:200},{x:300,y:300},{x:200,y:300}]]}}
 const geometry=roomFloorGeometry(room),mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());mesh.rotation.x=-Math.PI/2;mesh.updateMatrixWorld(true)
 const ray=new THREE.Raycaster(new THREE.Vector3(250,100,250),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(mesh).length,0)
 ray.ray.origin.set(100,100,100);assert.ok(ray.intersectObject(mesh).length>0);geometry.dispose();mesh.material.dispose()
})

test('visually touching legacy wall gaps are repaired in the draft before recognizing the user plan',()=>{
 const input={...layout([wall(202,3,202,470,'a'),wall(2,469,201,469,'b'),wall(204,330,998,330,'c'),wall(700,2,700,328,'d')]),assignments:{},rooms:[{id:'open',name:'开放办公区',template:'room-shell',frame:{x:0,y:0,width:1000,height:700},walls:{north:'open',east:'open',south:'open',west:'open'},furniture:[],seats:[],useTemplateFurniture:false}]}
 const result=reconcileRegions(input)
 assert.equal(result.rooms.length,4);assert.equal(result.wallSegments[0].start.y,0);assert.ok(Math.abs(total(result.rooms.map(room=>room.boundary))-700000)<.1)
 assert.equal(input.wallSegments[0].start.y,3)
})
