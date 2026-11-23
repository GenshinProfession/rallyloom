const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process')
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'rallyloom-office-planning-'))
let preload=fs.readFileSync(path.join(__dirname,'fixtures/formal-preload.cjs'),'utf8')
preload=preload.replace("['office.view'", "['layout.edit','office.view'")
preload=preload.replace('rooms:[],assignments:{}',"rooms:[{id:'shell',name:'Office',template:'room-shell',frame:{x:0,y:0,width:800,height:500},seats:[]}],assignments:{}")
preload=preload.replace('reporting:{version:1}', 'reporting:{version:1},seating:{version:1}')
preload=preload.replace(' let value={ok:true}'," let value={ok:true};if(path==='/oa/office/seats')return {ok:true,value:[]}")
preload=preload.replace('logout:async()',"saveOfficeLayout:async(layout)=>{snapshot.layout=layout;require('electron').ipcRenderer.send('test-layout',layout);return {ok:true,value:joined}},logout:async()")
fs.writeFileSync(path.join(fixture,'preload.cjs'),preload)
fs.copyFileSync(path.join(__dirname,'fixtures/office-planning-main.cjs'),path.join(fixture,'main.cjs'))
const env={...process.env,RALLY_TEST_FIXTURE:fixture,RALLY_TEST_DIST:path.resolve(__dirname,'../dist/index.html')};delete env.ELECTRON_RUN_AS_NODE
const run=spawnSync(require('electron'),['--user-data-dir='+path.join(fixture,'profile'),path.join(fixture,'main.cjs')],{env,timeout:65000,windowsHide:true,stdio:'ignore'})
const report=fs.existsSync(path.join(fixture,'result.txt'))?fs.readFileSync(path.join(fixture,'result.txt'),'utf8'):'No report'
console.log(report);console.log('Evidence: '+fixture);if(run.error||!report.startsWith('PASS'))process.exitCode=1
