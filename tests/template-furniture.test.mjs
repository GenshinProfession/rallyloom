import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import ts from 'typescript'
const root=new URL('../src/components/office/rooms/',import.meta.url)
const url=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')
const source=name=>readFileSync(new URL(name,root),'utf8').replaceAll("from 'three'",`from '${import.meta.resolve('three')}'`)
const api=url(source('api.ts')),furniture=url(source('furniture.ts')),placed=url(source('placed-furniture.ts').replace("from './furniture'",`from '${furniture}'`))
const {materializeRoom,resizeRoomContents,furnitureSeats}=await import(url(source('template-furniture.ts').replace("from './placed-furniture'",`from '${placed}'`)))
const {furnitureFits,furnitureSize,FURNITURE}=await import(placed)
const templates=[]
for(const file of readdirSync(root).filter(name=>name.endsWith('.room.ts')))templates.push((await import(url(source(file).replace("from './api'",`from '${api}'`).replace("from './furniture'",`from '${furniture}'`)))).default)
test('every room preset materializes bounded independent catalog items without changing the source',()=>{
 for(const template of templates){
   const original={id:'room-'+template.id,name:template.id,template:template.id,frame:{x:0,y:0,width:350,height:280}}
   const result=materializeRoom(original,template)
   assert.equal(original.furniture,undefined);assert.equal(result.useTemplateFurniture,false)
   assert.equal(new Set(result.furniture.map(item=>item.id)).size,result.furniture.length)
   for(const item of result.furniture){assert.ok(FURNITURE[item.kind]);assert.ok(furnitureFits(item,result.frame),template.id+' '+item.kind)}
   assert.deepEqual(materializeRoom(result,template),result)
 }
})
test('changing only a wall boundary preserves individual dimensions and local world coordinates',()=>{
 const room=materializeRoom({id:'room',name:'office',template:'desk-grid',frame:{x:0,y:0,width:350,height:280}},templates.find(t=>t.id==='desk-grid'))
 const resized=resizeRoomContents(room,{...room.frame,width:500,height:400})
 for(let i=0;i<room.furniture.length;i++){
   const before=room.furniture[i],after=resized.furniture[i]
   assert.deepEqual(furnitureSize(after),furnitureSize(before));assert.ok(Math.abs(after.x*500-before.x*350)<.001);assert.ok(Math.abs(after.y*400-before.y*280)<.001)
 }
 assert.equal(resized.seats.length,room.seats.length)
})
test('empty walled room has no hidden furniture; chair direction follows the furniture',()=>{
 const shell=materializeRoom({id:'shell',name:'empty',template:'room-shell',frame:{x:0,y:0,width:300,height:240}},templates.find(t=>t.id==='room-shell'))
 assert.deepEqual(shell.furniture,[]);assert.deepEqual(shell.seats,[])
 const seats=furnitureSeats({...shell,furniture:[{id:'chair',kind:'chair',x:.5,y:.5,rotation:90}]})
 assert.equal(seats[0].rotation,90)
})

test('oversized or diagonally oversized furniture cannot be accepted as fitting a smaller room',()=>{
 const room={x:0,y:0,width:100,height:100}
 assert.equal(furnitureFits({id:'desk',kind:'desk',x:.5,y:.5,rotation:0,size:{width:150,depth:50}},room),false)
 assert.equal(furnitureFits({id:'desk',kind:'desk',x:.5,y:.5,rotation:45,size:{width:90,depth:90}},room),false)
})

const materializedModule=url(source('template-furniture.ts').replace("from './placed-furniture'",`from '${placed}'`))
const {partitionRoom}=await import(url(source('partition-room.ts').replace("from './placed-furniture'",`from '${placed}'`).replace("from './template-furniture'",`from '${materializedModule}'`)))
const {seatOrder}=await import(url(source('seat-order.ts')))
test('partitions share an exact boundary and preserve furniture positions, sizes and seat directions',()=>{
 const room={id:'r',name:'Office',template:'room-shell',frame:{x:30,y:20,width:600,height:400},useTemplateFurniture:false,furniture:[{id:'left',kind:'workstation',x:.2,y:.5,rotation:90},{id:'right',kind:'sofa',x:.8,y:.5,rotation:0}]}
 const [left,right]=partitionRoom(room,'vertical',330,'new')
 assert.equal(left.frame.x+left.frame.width,right.frame.x);assert.equal(left.frame.width+right.frame.width,room.frame.width)
 assert.equal(left.furniture[0].id,'left');assert.equal(right.furniture[0].id,'right');assert.equal(left.seats[0].rotation,90)
 assert.equal(left.furniture[0].x*left.frame.width+left.frame.x,room.furniture[0].x*room.frame.width+room.frame.x)
 assert.equal(right.furniture[0].x*right.frame.width+right.frame.x,room.furniture[1].x*room.frame.width+room.frame.x)
 assert.equal(left.walls.east,'solid');assert.equal(right.walls.west,'solid');assert.equal(left.door.side,'west');assert.equal(right.door.side,'west')
 assert.equal(room.furniture.length,2)
 assert.throws(()=>partitionRoom(room,'vertical',100,'new'))
 assert.throws(()=>partitionRoom(room,'vertical',150,'new'),/家具/)
 const parts=partitionRoom({...room,furniture:[]},'horizontal',220,'lower');assert.equal(parts[0].frame.y+parts[0].frame.height,parts[1].frame.y)
})
test('explicit seat reservation fills only vacant indexes for legacy members',()=>{
 const result=seatOrder([{id:'old'},{id:'pinned'},{id:'last'}],3,{pinned:0})
 assert.deepEqual(result.map(member=>member?.id),['pinned','old','last'])
 assert.deepEqual(seatOrder([{id:'one'}],0,{one:2}),[])
})

const {validateWallSegments,snapWallPoint,wallLength,replaceWallSegment}=await import(url(source('free-walls.ts')))
test('free walls retain arbitrary endpoints and opening clearance, bounded by the office',()=>{
 const wall={id:'a',start:{x:50,y:40},end:{x:300,y:220},height:26,thickness:6,finish:'glass',opening:{offset:.5,width:42}}
 const layout={width:800,height:500,rooms:[],wallSegments:[wall]};validateWallSegments(layout)
 assert.ok(wallLength(wall)>300)
 for(const next of [{...wall,end:{x:801,y:220}},{...wall,height:0},{...wall,thickness:25},{...wall,end:wall.start},{...wall,opening:{offset:0,width:42}}])assert.throws(()=>validateWallSegments({...layout,wallSegments:[next]}))
 assert.throws(()=>validateWallSegments({...layout,wallSegments:[wall,wall]}))
 assert.throws(()=>validateWallSegments({...layout,wallSegments:Array.from({length:241},(_,i)=>({...wall,id:String(i)}))}))
 assert.deepEqual(snapWallPoint({x:304,y:222},layout),wall.end)
 const free=snapWallPoint({x:213,y:117},layout,{x:50,y:40},false);assert.deepEqual(free,{x:213,y:117})
 const aligned=snapWallPoint({x:213,y:117},layout,{x:50,y:40},true);assert.equal(aligned.x-50,aligned.y-40)
 assert.deepEqual(snapWallPoint({x:-5,y:800},layout),{x:0,y:500})
})

test('moving a shared wall joint preserves neighboring connections without changing unrelated walls',()=>{
 const first={id:'a',start:{x:10,y:10},end:{x:100,y:50},height:26,thickness:6,finish:'solid'}
 const next={...first,id:'b',start:first.end,end:{x:180,y:150}}
 const other={...first,id:'c',start:{x:300,y:200},end:{x:400,y:300}}
 const result=replaceWallSegment([first,next,other],{...first,end:{x:120,y:60}})
 assert.deepEqual(result[0].end,result[1].start);assert.deepEqual(result[1].end,next.end);assert.equal(result[2],other)
 assert.deepEqual(first.end,{x:100,y:50});assert.deepEqual(next.start,{x:100,y:50})
})
