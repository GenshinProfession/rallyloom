const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process')
for(const role of ['platform','employee','tenant_admin']){
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'rallyloom-formal-'))
 fs.copyFileSync(path.join(__dirname,'fixtures','formal-preload.cjs'),path.join(fixture,'preload.cjs'))
 fs.copyFileSync(path.join(__dirname,'fixtures','formal-main.cjs'),path.join(fixture,'main.cjs'))
 const env={...process.env,RALLY_TEST_FIXTURE:fixture,RALLY_TEST_DIST:path.resolve(__dirname,'../dist/index.html'),RALLY_TEST_ROLE:role};delete env.ELECTRON_RUN_AS_NODE
 const run=spawnSync(require('electron'),['--user-data-dir='+path.join(fixture,'profile'),path.join(fixture,'main.cjs')],{env,timeout:45000,windowsHide:true,stdio:'ignore'})
 const report=fs.existsSync(path.join(fixture,'result.txt'))?fs.readFileSync(path.join(fixture,'result.txt'),'utf8'):'No report'
 console.log(role+': '+report)
 console.log('Evidence: '+path.join(fixture,'toolbar.png'))
 if(run.error||!report.startsWith('PASS')){process.exitCode=1;break}
}
