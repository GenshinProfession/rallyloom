// Isolated provider fixture. Never connects to a company or writes live layouts.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process')
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'rallyloom-office-ui-'))
let preload=fs.readFileSync(path.join(__dirname,'fixtures/formal-preload.cjs'),'utf8')
preload=preload.replace("['office.view'", "['layout.edit','office.view'")
preload=preload.replace('rooms:[],assignments:{}', "rooms:[{id:'room-a',name:'测试办公室',template:'desk-grid',frame:{x:20,y:20,width:350,height:280}}],assignments:{}")
preload=preload.replace('notice:[],report:[]', "notice:[{id:'n',title:'测试公告',summary:'办公室公告应使用紧凑横幅',level:'info',occurredAt:new Date().toISOString()}],report:[]")
preload=preload.replace('logout:async()', "saveOfficeLayout:async(layout)=>{snapshot.layout=layout;require('electron').ipcRenderer.send('test-layout',layout);return {ok:true,value:joined}},logout:async()")
fs.writeFileSync(path.join(fixture,'preload.cjs'),preload)
fs.copyFileSync(path.join(__dirname,'fixtures/office-ui-main.cjs'),path.join(fixture,'main.cjs'))
const env={...process.env,RALLY_TEST_FIXTURE:fixture,RALLY_TEST_DIST:path.resolve(__dirname,'../dist/index.html')};delete env.ELECTRON_RUN_AS_NODE
const run=spawnSync(require('electron'),['--user-data-dir='+path.join(fixture,'profile'),path.join(fixture,'main.cjs')],{env,timeout:50000,windowsHide:true,stdio:'ignore'})
const report=fs.existsSync(path.join(fixture,'result.txt'))?fs.readFileSync(path.join(fixture,'result.txt'),'utf8'):'No report'
console.log(report);console.log('Evidence: '+fixture)
if(run.error||!report.startsWith('PASS'))process.exitCode=1
