// Synthetic provider only: full-page notifications and shared page chrome.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process')
const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'rallyloom-page-chrome-'))
let preload=fs.readFileSync(path.join(__dirname,'fixtures/formal-preload.cjs'),'utf8')
preload=preload.replace('notice:[],report:[]', String.raw`notice:[{id:'n1',title:'发布安排',summary:'通知正文测试\n第二段内容',level:'info',occurredAt:new Date().toISOString(),isRead:false,canDelete:true,sourceId:'fixture',externalNoticeId:'n1'},{id:'n2',title:'维护提醒',summary:'计划维护',level:'warning',occurredAt:new Date().toISOString(),isRead:false},{id:'n3',title:'历史公告',level:'info',occurredAt:new Date().toISOString(),isRead:true}],report:[]`)
preload=preload.replace("if(path==='/oa/reports/templates')", "if(path==='/oa/read/notice'){for(const notice of records.notice)if(body.ids.includes(notice.id))notice.isRead=true;value={ok:true}} else if(path==='/oa/reports/templates')")
fs.writeFileSync(path.join(fixture,'preload.cjs'),preload)
fs.copyFileSync(path.join(__dirname,'fixtures/page-chrome-main.cjs'),path.join(fixture,'main.cjs'))
const env={...process.env,RALLY_TEST_FIXTURE:fixture,RALLY_TEST_DIST:path.resolve(__dirname,'../dist/index.html')};delete env.ELECTRON_RUN_AS_NODE
const run=spawnSync(require('electron'),['--user-data-dir='+path.join(fixture,'profile'),path.join(fixture,'main.cjs')],{env,timeout:50000,windowsHide:true,stdio:'ignore'})
const report=fs.existsSync(path.join(fixture,'result.txt'))?fs.readFileSync(path.join(fixture,'result.txt'),'utf8'):'No report'
console.log(report);console.log('Evidence: '+fixture)
if(run.error||!report.startsWith('PASS'))process.exitCode=1
