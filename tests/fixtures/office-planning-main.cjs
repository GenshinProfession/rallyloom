const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path')
const output=path.join(process.env.RALLY_TEST_FIXTURE,'result.txt');let saved
ipcMain.on('test-layout',(_event,layout)=>{saved=layout})
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1600,height:1050,webPreferences:{preload:path.join(__dirname,'preload.cjs'),backgroundThrottling:false}})
 const errors=[];win.webContents.on('console-message',(_event,details)=>{if(/THREE.WebGLProgram|Shader Error/i.test(details.message??''))errors.push(details.message)})
 await win.loadFile(process.env.RALLY_TEST_DIST)
 await win.webContents.executeJavaScript('('+ (async()=>{
  const pause=ms=>new Promise(r=>setTimeout(r,ms)),wait=async(fn,label)=>{for(let i=0;i<120;i++){if(fn())return;await pause(70)}throw Error(label+' '+document.body.textContent.slice(-300))}
  const click=label=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!button)throw Error('missing '+label);button.click()}
  await wait(()=>document.querySelector('.office-header'),'office')
  if(document.querySelector('[data-general-quick]')||document.querySelector('[data-room-quick]')||document.body.textContent.includes('参考户型'))throw Error('redundant shortcuts')
  click('编辑办公室');await wait(()=>document.querySelector('.office-asset-library'),'assets');if(document.querySelector('.office-asset-card[aria-label=空区域]'))throw Error('open area retained')
  click('划分隔墙');await pause(500)
 }).toString()+')()',true)
 win.showInactive();win.webContents.debugger.attach('1.3')
 const r=await win.webContents.executeJavaScript("(()=>{const r=document.querySelector('.office-resize-boundary[data-canvas=true]').getBoundingClientRect();return {x:r.left+r.width*.5,y:r.top+r.height*.25,end:r.top+r.height*.75}})()")
 const mouse=async(type,x,y,button='left',pressed=false)=>win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':button,buttons:pressed?1:0,clickCount:type==='mouseMoved'?0:1})
 await mouse('mousePressed',r.x,r.y,'left',true);await mouse('mouseMoved',r.x,r.end,'left',true);await mouse('mouseReleased',r.x,r.end);await new Promise(r=>setTimeout(r,350))
 const cancelPoint=await win.webContents.executeJavaScript("(()=>{const r=document.querySelector('.office-resize-boundary[data-canvas=true]').getBoundingClientRect();return {x:r.left+r.width*.25,y:r.top+r.height*.25,end:r.top+r.height*.75}})()")
 await mouse('mousePressed',cancelPoint.x,cancelPoint.y,'left',true);await mouse('mouseMoved',cancelPoint.x,cancelPoint.end,'left',true)
 await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await mouse('mouseReleased',cancelPoint.x,cancelPoint.end)
 await new Promise(r=>setTimeout(r,100))
 if(await win.webContents.executeJavaScript("document.querySelectorAll('.office-room-label').length!==2 || document.querySelector('.office-partition-guide').style.display!=='none'"))throw Error('Escape committed a partition')
 await win.webContents.executeJavaScript('('+ (async()=>{
  const pause=ms=>new Promise(r=>setTimeout(r,ms)),wait=async(fn,label)=>{for(let i=0;i<100;i++){if(fn())return;await pause(70)}throw Error(label+' '+document.body.textContent.slice(-300))}
  const click=label=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!button)throw Error('missing '+label);button.click()}
  await wait(()=>document.querySelectorAll('.office-room-label').length===2,'partition')
  window.__secondRoom=[...document.querySelectorAll('.office-room-label')].find(e=>e.textContent.includes('2')).dataset.room
  click('选择');click('添加素材');await pause(100);click('家具');await pause(100);document.querySelector('.office-asset-card[aria-label=办公工位]').click();await wait(()=>document.querySelector('[aria-label=家具宽度]'),'workstation')
  click('添加素材');await pause(100);click('家具');await pause(100);document.querySelector('.office-asset-card[aria-label=办公工位]').click();await pause(150)
  click('发布办公室');await wait(()=>document.querySelector('.office-header'),'published')
  document.querySelector('[data-room="'+window.__secondRoom+'"]').click();await wait(()=>document.querySelector('[data-seat-target$=":1"]'),'second seat')
  const seat=document.querySelector('[data-seat-target$=":1"]'),r=seat.getBoundingClientRect();seat.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.top+10}))
  await wait(()=>document.querySelector('[role=menu]'),'context');const assign=[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.includes('分配此工位'));if(!assign)throw Error('missing assign action');assign.click()
  await wait(()=>document.querySelector('.office-seat-picker'),'seat picker');[...document.querySelectorAll('.office-seat-picker-list button')].find(button=>button.querySelector('strong')?.textContent==='可管理成员').click();await pause(80);click('确认分配');await wait(()=>!document.querySelector('.office-seat-picker'),'assigned')
 }).toString()+')()',true)
 if(saved.seatAssignments?.managed!==1||saved.assignments.managed!==saved.rooms[1].id)throw Error('exact seat assignment lost')
 await win.webContents.executeJavaScript('('+ (async()=>{
  const pause=ms=>new Promise(r=>setTimeout(r,ms)),wait=async(fn,label)=>{for(let i=0;i<100;i++){if(fn())return;await pause(70)}throw Error(label)}
  const seat=document.querySelector('[data-seat-target$=":0"]'),r=seat.getBoundingClientRect();seat.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:r.left+10,clientY:r.top+10}))
  await wait(()=>document.querySelector('[role=menu]'),'second menu');[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.includes('分配此工位')).click()
  await wait(()=>document.querySelector('.office-seat-picker'),'self picker');[...document.querySelectorAll('.office-seat-picker-list button')].find(button=>button.querySelector('strong')?.textContent==='测试员工').click();await pause(100)
  ;[...document.querySelectorAll('button')].find(button=>button.textContent==='确认分配').click();await wait(()=>document.querySelector('.office-seat-lock'),'my seat lock')
  document.querySelector('.office-seat-lock').click();await wait(()=>document.querySelector('.office-viewport[data-seat-locked=true]'),'locked');await pause(600)
  if(document.querySelector('.office-seat-lock').getAttribute('aria-pressed')!=='true')throw Error('lock did not toggle')
 }).toString()+')()',true)
 if(saved.seatAssignments?.self!==0||saved.seatAssignments?.managed!==1)throw Error('second allocation displaced first')
 fs.writeFileSync(path.join(__dirname,'office-context.png'),(await win.capturePage()).toPNG())
 await win.webContents.executeJavaScript('('+ (async()=>{
   const pause=ms=>new Promise(r=>setTimeout(r,ms)),wait=async(fn,label)=>{for(let i=0;i<100;i++){if(fn())return;await pause(70)}throw Error(label)}
   const click=label=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!button)throw Error('missing '+label);button.click()}
   click('编辑办公室');await wait(()=>document.querySelector('.office-asset-library'),'preset editor');document.querySelector('[data-room=shell]').click();await pause(100);click('添加素材');await pause(100);document.querySelector('.office-asset-card[aria-label=办公区]').click();await wait(()=>document.querySelector('.office-object-list'),'preset materialized')
   if(document.querySelectorAll('.office-room-label').length!==2 || document.querySelectorAll('.office-object-list button').length!==8)throw Error('template inserted overlapping room instead of filling shell')
   click('取消编辑');await wait(()=>document.querySelector('.office-header'),'cancel')
 }).toString()+')()',true)


 await win.webContents.executeJavaScript('('+ (async()=>{
  const pause=ms=>new Promise(r=>setTimeout(r,ms)),wait=async(fn,label)=>{for(let i=0;i<100;i++){if(fn())return;await pause(70)}throw Error(label)}
  const click=label=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!button)throw Error('missing '+label);button.click()}
  document.querySelector('[data-nav=tasks]').click();await wait(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='看板设置'),'settings button');click('看板设置');await wait(()=>document.querySelector('.board-settings-dialog'),'settings')
  const dialog=document.querySelector('.board-settings-dialog');if(dialog.querySelector('input[type=radio]')||dialog.querySelector('select'))throw Error('native controls retained')
  click('添加状态列');await pause(150);if(dialog.querySelectorAll('.board-setting-card').length!==2)throw Error('add status')
  dialog.querySelector('[role=combobox]').click();await wait(()=>document.querySelector('[role=listbox]'),'custom select');[...document.querySelectorAll('[role=option]')].find(e=>e.textContent==='进行中').click();await pause(100)
  const fieldTab=[...document.querySelectorAll('[role=tab]')].find(e=>e.textContent.includes('自定义字段'));fieldTab.click();await pause(100);click('添加字段');await pause(100);if(!dialog.querySelector('[aria-label=字段名称]'))throw Error('field tab')
  const footer=dialog.querySelector('footer').getBoundingClientRect(),bounds=dialog.getBoundingClientRect();if(footer.bottom>bounds.bottom+1||footer.bottom>innerHeight)throw Error('footer clipped')
 }).toString()+')()',true)
 fs.writeFileSync(path.join(__dirname,'board-settings.png'),(await win.capturePage()).toPNG())
 if(errors.length)throw Error(errors.join('\n'));fs.writeFileSync(output,'PASS native partition drawing; no open-area asset or redundant chat entries; exact right-click seat assignment persists; modern board settings controls and footer')
}).catch(error=>fs.writeFileSync(output,String(error)+'\n'+error.stack)).finally(()=>app.exit())
setTimeout(()=>{fs.writeFileSync(output,'timeout');app.exit(1)},60000).unref()
