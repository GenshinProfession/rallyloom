const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path')
const output=path.join(process.env.RALLY_TEST_FIXTURE,'result.txt')
ipcMain.on('test-layout',(_event,layout)=>fs.writeFileSync(path.join(process.env.RALLY_TEST_FIXTURE,'layout.json'),JSON.stringify(layout)))
app.whenReady().then(async()=>{
 const shaderErrors=[]
 const win=new BrowserWindow({show:false,width:1500,height:1050,webPreferences:{preload:path.join(__dirname,'preload.cjs'),backgroundThrottling:false}})
 win.webContents.on('console-message',(_event,details)=>{if(/THREE.WebGLProgram|VALIDATE_STATUS|Shader Error/i.test(details.message??''))shaderErrors.push(details.message)})
 await win.loadFile(process.env.RALLY_TEST_DIST)
 const result=await win.webContents.executeJavaScript('('+ (async()=>{
  const pause=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,label)=>{for(let i=0;i<120;i++){const v=fn();if(v)return v;await pause(70)}throw Error(label+' '+document.body.textContent.slice(-1000))}
  const click=label=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!b)throw Error('missing '+label);b.click()}
  await wait(()=>document.querySelector('.office-header'),'office')
  if(document.querySelectorAll('.office-tools > button').length>3)throw Error('header still crowded')
  await wait(()=>document.querySelector('.office-announcement'),'banner')
  if(document.querySelector('.office-announcement').getBoundingClientRect().height>34)throw Error('banner too tall')
  if(!document.querySelector('[data-nav=notify]'))throw Error('notification sidebar missing')
  if(document.querySelector('.office-header .office-zoom'))throw Error('zoom still crowds header')
  click('编辑办公室');await wait(()=>document.querySelector('.office-asset-library'),'assets')
  click('对象属性');await pause(100)
  await wait(()=>document.querySelector('.office-room-label'),'3D room label');document.querySelector('.office-room-label').click()
  await wait(()=>document.querySelector('.office-wall-plan'),'room inspector')
  if(document.querySelector('.office-asset-library'))throw Error('assets stacked above properties')
  click('浅灰水磨石');await pause(80);click('暖白石英');await pause(80)
  document.querySelector('[aria-label="选择右侧墙"]').click();await pause(80)
  click('玻璃墙');await pause(80)
  if(document.querySelector('[aria-label="右侧墙材质"] [aria-pressed=true]').textContent!=='玻璃墙')throw Error('wall not updated')
  click('将出入口移到此墙');await wait(()=>document.querySelector('[aria-label="门的位置"]'),'door slider')
  click('居中');await pause(80)
  click('添加素材');await wait(()=>document.querySelector('.office-asset-library'),'assets switch')
  document.querySelector('.office-room-label').click();await wait(()=>document.querySelector('.office-wall-plan'),'scene selection inspector')
  if(document.querySelector('.office-asset-library'))throw Error('room selection failed to switch inspector')
  click('发布办公室');await wait(()=>document.querySelector('.office-header'),'published')
  return 'PASS compact toolbar/banner, notification navigation, selection inspector, floor/wall/door edits, checkbox sizing and provider layout publish'
 }).toString()+')()',true)
 const layout=JSON.parse(fs.readFileSync(path.join(__dirname,'layout.json'),'utf8')),room=layout.rooms[0]
 if(room.floorMaterial!=='quartz'||room.walls.east!=='glass'||room.door.side!=='east'||room.door.offset!==.5)throw Error('saved layout mismatch '+JSON.stringify(room))
 await win.webContents.executeJavaScript('('+ (async()=>{
   const pause=ms=>new Promise(r=>setTimeout(r,ms));
   [...document.querySelectorAll('button')].find(b=>b.textContent==='编辑办公室').click();await pause(1600);
   document.querySelector('.office-room-label').click();await pause(800);
   if(!document.querySelector('.office-wall-plan'))throw Error('room inspector not ready for screenshot');
 }).toString()+')()',true)
 win.showInactive();await new Promise(r=>setTimeout(r,650));
 fs.writeFileSync(path.join(__dirname,'editor.png'),(await win.capturePage()).toPNG())
 for(const zoom of [65,100,165]){
   await win.webContents.executeJavaScript(`(()=>{const input=document.querySelector('.office-editor-actions input[type=range]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'${zoom}');input.dispatchEvent(new Event('input',{bubbles:true}))})()`)
   await new Promise(r=>setTimeout(r,200));fs.writeFileSync(path.join(__dirname,'quartz-'+zoom+'.png'),(await win.capturePage()).toPNG())
 }
 if(shaderErrors.length)throw Error(shaderErrors.join('\n'))
 fs.writeFileSync(output,result+'; quartz rendered at 65/100/165 percent without shader errors')
}).catch(e=>fs.writeFileSync(output,String(e))).finally(()=>app.exit())
setTimeout(()=>{fs.writeFileSync(output,'timeout');app.exit(1)},45000).unref()
