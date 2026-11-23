const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path')
const output=path.join(process.env.RALLY_TEST_FIXTURE,'result.txt');let saved
ipcMain.on('test-layout',(_event,layout)=>{saved=layout})
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1600,height:1050,webPreferences:{preload:path.join(__dirname,'preload.cjs'),backgroundThrottling:false}})
 const errors=[];win.webContents.on('console-message',(_event,details)=>{if(/THREE.WebGLProgram|Shader Error/i.test(details.message??''))errors.push(details.message)})
 await win.loadFile(process.env.RALLY_TEST_DIST)
 const result=await win.webContents.executeJavaScript('('+ (async()=>{
  const pause=ms=>new Promise(r=>setTimeout(r,ms)),wait=async(fn,label)=>{for(let i=0;i<140;i++){if(fn())return;await pause(70)}throw Error(label+' '+document.body.textContent.slice(-500))}
  const click=label=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!button)throw Error('missing '+label);button.click()}
  const value=async(label,value)=>{const input=document.querySelector('[aria-label="'+label+'"]');if(!input)throw Error('missing input '+label);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,String(value));input.dispatchEvent(new Event('input',{bubbles:true}));await pause(100);input.focus();input.blur();await pause(100)}
  await wait(()=>document.querySelector('.office-header'),'office');click('编辑办公室');await wait(()=>document.querySelector('.office-asset-library'),'assets')
  click('家具');await pause(200);if(document.querySelectorAll('.office-asset-card').length<28)throw Error('incomplete furniture catalog')
  for(const name of ['办公工位','办公椅','会议桌','摄影机','摄影补光灯','水槽','微波炉','样品展示架','衣物展示架','打印机','运输推车'])if(!document.querySelector('.office-asset-card[aria-label="'+name+'"]'))throw Error('missing catalog item '+name)
  document.querySelector('.office-room-label[data-room=design]').click();await wait(()=>document.querySelector('.office-object-list'),'materialized objects')
  if(document.querySelectorAll('.office-object-list button').length!==8)throw Error('template furniture not materialized')
  if(document.querySelector('.office-resize-grip svg'))throw Error('large resize arrow retained')
  document.querySelector('.office-object-list button').click();await wait(()=>document.querySelector('[aria-label=家具宽度]'),'item inspector')
  await value('家具宽度',66);await value('家具高度',44);click('旋转90°');await pause(150)
  await value('家具X位置',95)
  const selected=document.querySelector('[data-selected-furniture]');await wait(()=>document.querySelector('[data-selected-furniture]'),'selected outline')
  window.__selectedId=selected.dataset.selectedFurniture
  window.__originalX=Number(document.querySelector('[aria-label=家具X位置]').value)
  const r=selected.getBoundingClientRect();window.__drag={x:r.left+r.width/2,y:r.top+r.height/2}
  return 'ready'
 }).toString()+')()',true)
 if(result!=='ready')throw Error(result)
 win.showInactive();await new Promise(r=>setTimeout(r,600));win.webContents.debugger.attach('1.3')
 const d=await win.webContents.executeJavaScript(`(()=>{const r=document.querySelector('[data-selected-furniture]').getBoundingClientRect();return {x:r.left+r.width*.5,y:r.top+r.height*.5}})()`)
 const mouse=async(type,x,y,pressed=false)=>win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x,y,button:type==='mouseMoved'?'none':'left',buttons:pressed?1:0,clickCount:type==='mouseMoved'?0:1})
 await mouse('mouseMoved',d.x,d.y);await mouse('mousePressed',d.x,d.y,true);await mouse('mouseMoved',d.x+10,d.y+4,true);await new Promise(r=>setTimeout(r,150));await mouse('mouseMoved',d.x+35,d.y+14,true);await mouse('mouseReleased',d.x+35,d.y+14);await new Promise(r=>setTimeout(r,350))
 const final=await win.webContents.executeJavaScript('('+ (async()=>{
  const pause=ms=>new Promise(r=>setTimeout(r,ms)),wait=async(fn,label)=>{for(let i=0;i<100;i++){if(fn())return;await pause(60)}throw Error(label)}
  const click=label=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label)?.click()
  if(!document.querySelector('[aria-label=家具X位置]')||Number(document.querySelector('[aria-label=家具X位置]').value)===window.__originalX)throw Error('native drag failed to move independent template furniture '+document.querySelector('.office-inspector-heading')?.textContent)
  document.querySelector('.office-room-label[data-room=shell]').click();await pause(100);click('添加素材');await pause(80);click('家具');await pause(150)
  document.querySelector('.office-asset-card[aria-label=沙发]').click();await wait(()=>document.querySelector('[aria-label=家具宽度]'),'add sofa')
  const input=document.querySelector('[aria-label=家具宽度]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'88');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();input.blur();await pause(150)
  click('旋转90°');await pause(150);click('发布办公室');await wait(()=>document.querySelector('.office-header'),'publish')
  return 'PASS complete catalog, legacy template materialization, independent dimensions and native 3D drag, empty walled room furnished and saved'
 }).toString()+')()',true)
 if(!saved)throw Error('layout not saved');const room=saved.rooms.find(r=>r.id==='design'),item=room.furniture.find(f=>f.id===room.id+'-preset-0')
 if(room.useTemplateFurniture!==false||item.size.width!==66||item.size.height!==44||item.rotation!==90)throw Error('independent properties lost '+JSON.stringify(item))
 const shell=saved.rooms.find(r=>r.id==='shell');if(shell.template!=='room-shell'||shell.furniture[0].kind!=='sofa')throw Error('empty room save')
 await win.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(b=>b.textContent==='编辑办公室').click()")
 await new Promise(r=>setTimeout(r,1000));await win.webContents.executeJavaScript("document.querySelector('.office-room-label[data-room=design]').click()")
 await new Promise(r=>setTimeout(r,400));fs.writeFileSync(path.join(__dirname,'editor.png'),(await win.capturePage()).toPNG())
 if(errors.length)throw Error(errors.join('\n'));fs.writeFileSync(output,final)
}).catch(error=>fs.writeFileSync(output,String(error))).finally(()=>app.exit())
setTimeout(()=>{fs.writeFileSync(output,'timeout');app.exit(1)},55000).unref()
