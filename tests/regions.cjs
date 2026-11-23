const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process')
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'rallyloom-regions-'))
let preload=fs.readFileSync(path.join(__dirname,'fixtures/formal-preload.cjs'),'utf8')
preload=preload.replace("['office.view'", "['layout.edit','office.view'")
preload=preload.replace('rooms:[],assignments:{}',"rooms:[{id:'open',name:'开放办公区',template:'room-shell',frame:{x:0,y:0,width:1000,height:700},walls:{north:'open',east:'open',south:'open',west:'open'},useTemplateFurniture:false,furniture:[{id:'desk-left',kind:'workstation',x:.1,y:.2,rotation:0,size:{width:58,depth:80,height:40}},{id:'desk-lower',kind:'workstation',x:.6,y:.8,rotation:0,size:{width:58,depth:80,height:40}}],seats:[{x:.1,y:.2},{x:.6,y:.8}]}],assignments:{self:'open',managed:'open'},seatAssignments:{self:1,managed:0},wallSegments:[{id:'a',start:{x:200,y:0},end:{x:200,y:470},thickness:6,height:26,finish:'solid'},{id:'b',start:{x:0,y:470},end:{x:200,y:470},thickness:6,height:26,finish:'solid'},{id:'c',start:{x:200,y:330},end:{x:1000,y:330},thickness:6,height:26,finish:'solid'},{id:'d',start:{x:700,y:0},end:{x:700,y:330},thickness:6,height:26,finish:'solid'}]")
preload=preload.replace('reporting:{version:1}', 'reporting:{version:1},seating:{version:1}')
preload=preload.replace(' let value={ok:true}'," let value={ok:true};if(path==='/oa/office/seats')return {ok:true,value:[]}")
preload=preload.replace('logout:async()',"saveOfficeLayout:async(layout)=>{snapshot.layout=layout;require('electron').ipcRenderer.send('test-layout',layout);return {ok:true,value:joined}},logout:async()")
preload=preload.replace('width:800,height:500,rooms:','width:1000,height:700,rooms:')
fs.writeFileSync(path.join(fixture,'preload.cjs'),preload)
fs.copyFileSync(path.join(__dirname,'fixtures/regions-main.cjs'),path.join(fixture,'main.cjs'))
const env={...process.env,RALLY_TEST_FIXTURE:fixture,RALLY_TEST_DIST:path.resolve(__dirname,'../dist/index.html')};delete env.ELECTRON_RUN_AS_NODE
const run=spawnSync(require('electron'),['--user-data-dir='+path.join(fixture,'profile'),path.join(fixture,'main.cjs')],{env,timeout:65000,windowsHide:true,stdio:'ignore'})
const report=fs.existsSync(path.join(fixture,'result.txt'))?fs.readFileSync(path.join(fixture,'result.txt'),'utf8'):'No report'
console.log(report);console.log('Evidence: '+fixture);if(run.error||!report.startsWith('PASS'))process.exitCode=1
