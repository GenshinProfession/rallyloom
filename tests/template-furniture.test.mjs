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
