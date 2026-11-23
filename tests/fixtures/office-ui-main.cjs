const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path')
const output=path.join(process.env.RALLY_TEST_FIXTURE,'result.txt')
ipcMain.on('test-layout',(_event,layout)=>fs.writeFileSync(path.join(process.env.RALLY_TEST_FIXTURE,'layout.json'),JSON.stringify(layout)))
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1500,height:1050,webPreferences:{preload:path.join(__dirname,'preload.cjs'),backgroundThrottling:false}})
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
  const select=document.querySelector('.office-editor-sidebar select')
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,'room-a');select.dispatchEvent(new Event('change',{bubbles:true}))
  await wait(()=>document.querySelector('.office-wall-plan'),'room inspector')
  if(document.querySelector('.office-asset-library'))throw Error('assets stacked above properties')
  const checkbox=document.querySelector('.office-editor-sidebar input[type=checkbox]')
  if(checkbox.getBoundingClientRect().width>20)throw Error('stretched checkbox')
  click('灰白地砖');await pause(80)
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
 if(room.floorMaterial!=='tile'||room.walls.east!=='glass'||room.door.side!=='east'||room.door.offset!==.5)throw Error('saved layout mismatch '+JSON.stringify(room))
 await win.webContents.executeJavaScript('('+ (async()=>{
   const pause=ms=>new Promise(r=>setTimeout(r,ms));
   [...document.querySelectorAll('button')].find(b=>b.textContent==='编辑办公室').click();await pause(1600);
   document.querySelector('.office-room-label').click();await pause(800);
   if(!document.querySelector('.office-wall-plan'))throw Error('room inspector not ready for screenshot');
 }).toString()+')()',true)
 win.showInactive();await new Promise(r=>setTimeout(r,650));
 fs.writeFileSync(path.join(__dirname,'editor.png'),(await win.capturePage()).toPNG())
 fs.writeFileSync(output,result)
}).catch(e=>fs.writeFileSync(output,String(e))).finally(()=>app.exit())
setTimeout(()=>{fs.writeFileSync(output,'timeout');app.exit(1)},45000).unref()
