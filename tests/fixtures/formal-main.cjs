const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path')
const output=path.join(process.env.RALLY_TEST_FIXTURE,'result.txt')
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1500,height:1000,webPreferences:{preload:path.join(__dirname,'preload.cjs'),backgroundThrottling:false}})
 await win.loadFile(process.env.RALLY_TEST_DIST)
 const result=await win.webContents.executeJavaScript('('+ (async()=>{
 const pause=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,label)=>{for(let i=0;i<100;i++){if(fn())return;await pause(60)}throw Error(label+' '+document.body.textContent.slice(-1600))}
 const nav=(page)=>document.querySelector('[data-nav='+page+']').click()
 await wait(()=>document.querySelector('[data-nav=tasks]'),'formal task nav')
 if(document.body.textContent.includes('所有者'))throw Error('demo role name leaked into formal sidebar')
 if(!document.body.textContent.includes('平台超管') && !document.body.textContent.includes('员工'))throw Error('provider role name missing')
 if(!document.querySelector('button[title="平台总部"]')&&!document.querySelector('button[title="研发分公司"]'))throw Error('provider region name missing');
 nav('tasks');await wait(()=>document.querySelector('[data-task-row]'),'formal tasks')
 if(!document.body.textContent.includes('企业自定义流程'))throw Error('provider board ignored')
 const toolbar=document.querySelector('[data-task-toolbar]');const controls=[...toolbar.querySelectorAll('button')];if(controls.some(b=>Math.abs(b.getBoundingClientRect().height-(b.getAttribute('role')==='tab'?28:32))>1))throw Error('toolbar heights are inconsistent');for(const label of ['刷新','看板设置','新建任务']){const b=controls.find(b=>b.textContent===label);if(b&&!b.querySelector('svg'))throw Error('toolbar action missing icon: '+label)}

 document.querySelector('[data-task-row]').click();await wait(()=>document.querySelector('[role=dialog]'),'task detail')
 document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await pause(100)
 if(document.querySelector('[data-nav=team]')){nav('team');await wait(()=>document.querySelector('[data-team-directory]'),'read-only team directory');const headings=[...document.querySelectorAll('th')].map(t=>t.textContent);if(headings.includes('邮箱')||headings.includes('公司')||headings.includes('工作区角色')||headings.includes('账号角色')||headings.includes('管理'))throw Error('empty or local role columns shown');if(!headings.includes('角色'))throw Error('provider role missing');for(const label of ['设置角色','角色映射','房间工作看板','移出工作区'])if(document.body.textContent.includes(label))throw Error('directory still manages identity: '+label);
 }
 const navIcons=['tasks','reports','docs'].map(id=>document.querySelector('[data-nav='+id+'] svg').innerHTML);if(new Set(navIcons).size!==3)throw Error('navigation icons are indistinguishable');

 nav('docs');await wait(()=>document.querySelector('[data-doc-row]'),'formal docs');document.querySelector('[data-doc-row]').click();await wait(()=>document.querySelector('[data-doc-reader]'),'formal reader')
 document.querySelector('[data-doc-new-folder]').click();await wait(()=>document.querySelector('[aria-label="新文件夹名称"]'),'folder dialog');const folderName=document.querySelector('[aria-label="新文件夹名称"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(folderName,'资料归档');folderName.dispatchEvent(new Event('input',{bubbles:true}));await pause(80);[...document.querySelectorAll('button')].find(b=>b.textContent==='创建文件夹').click();await wait(()=>document.querySelector('[data-doc-folder="资料归档"]'),'persisted folder');if([...document.querySelectorAll('[data-doc-row]')].some(b=>b.textContent.includes('资料归档')))throw Error('folder rendered as document');document.querySelector('[data-doc-new]').click();await wait(()=>document.querySelector('[aria-label="文件夹路径"]'),'new doc location');if(document.querySelector('[aria-label="文件夹路径"]').value!=='资料归档')throw Error('new document did not inherit selected folder');
 nav('chat');await wait(()=>document.body.textContent.includes('正式交流室'),'formal chat')
 nav('reports');await wait(()=>[...document.querySelectorAll('[data-reports] aside button')].some(b=>b.textContent.includes('测试员工')),'generic provider report');[...document.querySelectorAll('[data-reports] aside button')].find(b=>b.textContent.includes('测试员工')).click();await wait(()=>document.querySelector('textarea[aria-label="工作汇报正文"]'),'report page')
 if(!document.body.textContent.includes('研发交付日志')||!document.body.textContent.includes('关闭工单数')||!document.body.textContent.includes('Europe/Paris'))throw Error('enterprise report definition ignored')
 if(document.body.textContent.includes('店铺')||document.body.textContent.includes('Mira 运营'))throw Error('business-specific report leaked')
 const field=document.querySelector('textarea[aria-label="工作汇报正文"]')
 if(field.disabled!==Boolean(document.body.textContent.includes('当前为查看模式')))throw Error('report writing authority')
 if(!field.disabled){
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'通用企业日志');field.dispatchEvent(new Event('input',{bubbles:true}));await pause(100);[...document.querySelectorAll('button')].find(b=>b.textContent==='提交汇报').click();await wait(()=>document.body.textContent.includes('版本冲突'),'report conflict');if(document.querySelector('textarea[aria-label="工作汇报正文"]').value!=='通用企业日志')throw Error('conflict destroyed draft');[...document.querySelectorAll('button')].find(b=>b.textContent==='提交汇报').click();await wait(()=>document.body.textContent.includes('已提交'),'generic report submitted');document.querySelector('[data-reports] aside button').click();await wait(()=>document.querySelector('textarea[aria-label="工作汇报正文"]')?.disabled,'submitted report immutable')
 }
 else {
  [...document.querySelectorAll('button')].find(b=>b.textContent==='模板设置').click();await wait(()=>document.querySelector('input[aria-label="模板名称"]'),'report template editor');const name=document.querySelector('input[aria-label="模板名称"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(name,'企业交接记录');name.dispatchEvent(new Event('input',{bubbles:true}));await pause(100);[...document.querySelectorAll('button')].find(b=>b.textContent==='保存模板').click();await wait(()=>!document.querySelector('[role=dialog]'),'template saved');if(!document.body.textContent.includes('企业交接记录'))throw Error('template configuration not refreshed')
 }
 nav('docs');await wait(()=>document.querySelector('[data-doc-folder="资料归档"]'),'empty folder after navigation');
 nav('tasks');await wait(()=>document.querySelector('[data-task-toolbar]'),'final toolbar');
 return 'PASS formal provider board, task details, documents, chat and report role boundary'
 }).toString()+')()',true)
 fs.writeFileSync(path.join(__dirname,'toolbar.png'),(await win.capturePage({x:0,y:32,width:1500,height:110})).toPNG())
 fs.writeFileSync(output,result)
}).catch(e=>fs.writeFileSync(output,String(e))).finally(()=>app.exit())
setTimeout(()=>{fs.writeFileSync(output,'timeout');app.exit(1)},40000).unref()
