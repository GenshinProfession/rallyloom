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
  await wait(()=>document.querySelector('.office-header'),'office');click('编辑办公室');await wait(()=>document.querySelector('.office-plan-toolbar'),'toolbar')
  for(const button of document.querySelectorAll('.office-plan-tools button')){const svg=button.querySelector('svg').getBoundingClientRect(),label=button.querySelector('span').getBoundingClientRect();if(Math.abs(svg.top+svg.height/2-label.top-label.height/2)>2||button.getBoundingClientRect().height>34)throw Error('stacked or oversized drawing button')}
  click('自由墙');await pause(600)
 }).toString()+')()',true)
 win.showInactive();win.webContents.debugger.attach('1.3')
 const frame=()=>win.webContents.executeJavaScript("(()=>{const r=document.querySelector('.office-resize-boundary[data-canvas=true]').getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height}})()")
 const r=await frame(),p=(x,y)=>({x:r.left+r.width*x,y:r.top+r.height*y})
 const mouse=async(type,point,pressed=false)=>win.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:type==='mouseMoved'?'none':'left',buttons:pressed?1:0,clickCount:type==='mouseMoved'?0:1})
 const click=async(point)=>{await mouse('mousePressed',point,true);await mouse('mouseReleased',point);await new Promise(r=>setTimeout(r,180))}
 const a=p(.18,.25),b=p(.55,.43),c=p(.78,.28),d=p(.78,.72)
 await mouse('mousePressed',a,true);await mouse('mouseMoved',b,true);await mouse('mouseReleased',b);await new Promise(r=>setTimeout(r,250))
 await click(b);await click(c);await click(d)
 await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await new Promise(r=>setTimeout(r,250))
 const endpoints=await win.webContents.executeJavaScript("(()=>{const get=name=>Number(document.querySelector('[aria-label=墙'+name+']').value);return {x:get('终点X'),y:get('终点Y')}})()")
 const handle=await win.webContents.executeJavaScript("(()=>{const r=document.querySelector('[data-wall-node=end]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()")
 await mouse('mousePressed',handle,true);await mouse('mouseMoved',{x:handle.x-45,y:handle.y-25},true);await mouse('mouseReleased',{x:handle.x-45,y:handle.y-25});await new Promise(r=>setTimeout(r,350))
 const changed=await win.webContents.executeJavaScript("Number(document.querySelector('[aria-label=墙终点X]').value)");if(changed===endpoints.x)throw Error('native endpoint drag did not move wall')
 const after=await win.webContents.executeJavaScript("({x:Number(document.querySelector('[aria-label=墙终点X]').value),y:Number(document.querySelector('[aria-label=墙终点Y]').value)})")
 const handle2=await win.webContents.executeJavaScript("(()=>{const r=document.querySelector('[data-wall-node=end]').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()")
 await mouse('mousePressed',handle2,true);await mouse('mouseMoved',{x:handle2.x-35,y:handle2.y},true);await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await mouse('mouseReleased',{x:handle2.x-35,y:handle2.y});await new Promise(r=>setTimeout(r,250))
 if(await win.webContents.executeJavaScript("Number(document.querySelector('[aria-label=墙终点X]').value)")!==after.x)throw Error('Escape committed endpoint edit')

 const body=await win.webContents.executeJavaScript("(()=>{const a=document.querySelector('[data-wall-node=start]').getBoundingClientRect(),b=document.querySelector('[data-wall-node=end]').getBoundingClientRect();return {x:(a.left+b.left+a.width)/2,y:(a.top+b.top+a.height)/2-10}})()")
 const startX=await win.webContents.executeJavaScript("Number(document.querySelector('[aria-label=墙起点X]').value)")
 await mouse('mousePressed',body,true);await mouse('mouseMoved',{x:body.x+24,y:body.y+12},true);await mouse('mouseReleased',{x:body.x+24,y:body.y+12});await new Promise(r=>setTimeout(r,400))
 if(await win.webContents.executeJavaScript("Number(document.querySelector('[aria-label=墙起点X]').value)")===startX)throw Error('native wall body drag failed')
 await win.webContents.executeJavaScript('('+ (async()=>{
  const pause=ms=>new Promise(r=>setTimeout(r,ms));document.querySelector('[aria-label=墙段门洞]').click();await pause(150)
  ;[...document.querySelectorAll('button')].find(button=>button.textContent==='通透玻璃').click();await pause(600)
 }).toString()+')()',true)
 fs.writeFileSync(path.join(__dirname,'free-walls.png'),(await win.capturePage()).toPNG())
 await win.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='发布办公室').click()")
 await new Promise(r=>setTimeout(r,600))
 if(!saved||saved.wallSegments?.length!==3)throw Error('continuous walls not persisted '+JSON.stringify(saved?.wallSegments))
 const walls=saved.wallSegments;if(walls[0].start.x===walls[0].end.x||walls[0].start.y===walls[0].end.y)throw Error('diagonal snapped to rectangle')
 if(walls[0].end.x!==walls[1].start.x||walls[0].end.y!==walls[1].start.y||walls[1].end.x!==walls[2].start.x||walls[1].end.y!==walls[2].start.y)throw Error('polyline disconnected')
 if(!walls[2].opening||walls[2].finish!=='glass')throw Error('wall opening or finish lost')
 if(saved.rooms.length!==1||Object.values(saved.rooms[0].walls).some(value=>value!=='open'))throw Error('free walls generated rectangular room splits')

 await win.webContents.executeJavaScript("[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='编辑办公室').click()")
 await new Promise(r=>setTimeout(r,500));const r2=await frame(),first=walls[0]
 const midpoint={x:r2.left+(first.start.x+first.end.x)/2/800*r2.width,y:r2.top+(first.start.y+first.end.y)/2/500*r2.height-10}
 await click(midpoint);await new Promise(r=>setTimeout(r,300))
 if(await win.webContents.executeJavaScript("Number(document.querySelector('[aria-label=墙起点X]')?.value)")!==first.start.x)throw Error('published wall could not be selected after reopening')
 win.setSize(1180,780);await new Promise(r=>setTimeout(r,350))
 await win.webContents.executeJavaScript("(()=>{for(const button of document.querySelectorAll('.office-plan-tools button')){const svg=button.querySelector('svg').getBoundingClientRect(),label=button.querySelector('span').getBoundingClientRect();if(Math.abs(svg.top+svg.height/2-label.top-label.height/2)>2)throw Error('toolbar wrapped labels at narrow size')}})()")
 fs.writeFileSync(path.join(__dirname,'free-walls-narrow.png'),(await win.capturePage()).toPNG())
 if(errors.length)throw Error(errors.join('\n'));fs.writeFileSync(output,'PASS diagonal drag, continuous corners, editable endpoint drag, Escape cancellation, glass wall opening, saved independent segments and aligned compact toolbar')
}).catch(error=>fs.writeFileSync(output,String(error)+'\n'+error.stack)).finally(()=>app.exit())
setTimeout(()=>{fs.writeFileSync(output,'timeout');app.exit(1)},60000).unref()
