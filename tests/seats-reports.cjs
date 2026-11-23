const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process')
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'rallyloom-seats-reports-'))
let preload=fs.readFileSync(path.join(__dirname,'fixtures/formal-preload.cjs'),'utf8')
preload=preload.replace('rooms:[],assignments:{}',"rooms:[{id:'design',name:'Design studio',template:'desk-grid',frame:{x:20,y:20,width:350,height:280}}],assignments:{}")
preload=preload.replace('reporting:{version:1}', 'reporting:{version:1},seating:{version:1}')
preload=preload.replace('let conflictOnce=true','let seats=[];let conflictOnce=true')
preload=preload.replace(' let value={ok:true}', ` let value={ok:true}
 if(path==='/oa/office/seats')return {ok:true,value:seats}
 if(path==='/oa/office/seats/self'){if(body.memberId)throw Error('client forged identity');seats=[{memberId:'self',roomId:body.roomId,seatIndex:body.seatIndex,seated:body.seated}];return {ok:true,value:seats}}`)
fs.writeFileSync(path.join(fixture,'preload.cjs'),preload)
fs.copyFileSync(path.join(__dirname,'fixtures/seats-reports-main.cjs'),path.join(fixture,'main.cjs'))
const env={...process.env,RALLY_TEST_FIXTURE:fixture,RALLY_TEST_DIST:path.resolve(__dirname,'../dist/index.html')};delete env.ELECTRON_RUN_AS_NODE
const run=spawnSync(require('electron'),['--user-data-dir='+path.join(fixture,'profile'),path.join(fixture,'main.cjs')],{env,timeout:50000,windowsHide:true,stdio:'ignore'})
const report=fs.existsSync(path.join(fixture,'result.txt'))?fs.readFileSync(path.join(fixture,'result.txt'),'utf8'):'No report'
console.log(report);console.log('Evidence: '+fixture);if(run.error||!report.startsWith('PASS'))process.exitCode=1
