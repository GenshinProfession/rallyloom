const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process')
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'rallyloom-chat-members-'))
let preload=fs.readFileSync(path.join(__dirname,'fixtures/formal-preload.cjs'),'utf8')
preload=preload.replace("let conflictOnce=true", "let memberRetry=true;let conflictOnce=true")
preload=preload.replace(" let value={ok:true}", ` let value={ok:true}
 if(path==='/oa/chat/direct')return {ok:true,value:{id:'dm-test',name:'Alex Morgan',peerId:'alex',info:'私聊'}}
 if(path.includes('/members')){
   if(path.includes('restricted'))return {ok:false,error:'无权读取群成员'}
   return {ok:true,value:path.includes('room%3Adesign')?[{id:'self',name:'测试员工',presence:'online'}]:[{id:'self',name:'测试员工',presence:'online'},{id:'alex',name:'Alex Morgan',presence:'online',detail:'Product design'},{id:'jordan',name:'Jordan Lee',presence:'offline',detail:'Engineering'}]}
 }`)
preload=preload.replace("value=[{id:'general',name:'正式交流室',info:'授权范围'}]", "value=[{id:'general',name:'Product studio',info:'Design, build, ship together'},{id:'room:design',name:'Design team',roomId:'design',info:'房间群聊'},{id:'restricted',name:'Restricted group',info:'受限成员'}]")
fs.writeFileSync(path.join(fixture,'preload.cjs'),preload)
fs.copyFileSync(path.join(__dirname,'fixtures/chat-members-main.cjs'),path.join(fixture,'main.cjs'))
const env={...process.env,RALLY_TEST_FIXTURE:fixture,RALLY_TEST_DIST:path.resolve(__dirname,'../dist/index.html')};delete env.ELECTRON_RUN_AS_NODE
const run=spawnSync(require('electron'),['--user-data-dir='+path.join(fixture,'profile'),path.join(fixture,'main.cjs')],{env,timeout:40000,windowsHide:true,stdio:'ignore'})
const report=fs.existsSync(path.join(fixture,'result.txt'))?fs.readFileSync(path.join(fixture,'result.txt'),'utf8'):'No report'
console.log(report);console.log('Evidence: '+fixture);if(run.error||!report.startsWith('PASS'))process.exitCode=1
