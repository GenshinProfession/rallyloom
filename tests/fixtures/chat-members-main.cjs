const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path')
const output=path.join(process.env.RALLY_TEST_FIXTURE,'result.txt')
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1600,height:1000,webPreferences:{preload:path.join(__dirname,'preload.cjs'),backgroundThrottling:false}})
 await win.loadFile(process.env.RALLY_TEST_DIST)
 const result=await win.webContents.executeJavaScript('('+ (async()=>{
  const pause=ms=>new Promise(r=>setTimeout(r,ms)),wait=async(fn,label)=>{for(let i=0;i<100;i++){if(fn())return;await pause(60)}throw Error(label)}
  await wait(()=>document.querySelector('[data-nav=chat]'),'navigation');document.querySelector('[data-nav=chat]').click()
  await wait(()=>document.querySelector('.chat-thread-header p')?.textContent.includes('3 位成员'),'authorized roster count')
  document.querySelector('[aria-label=查看群成员]').click();await wait(()=>document.querySelectorAll('[data-chat-member]').length===3,'members panel')
  if(!document.querySelector('[data-chat-member=alex]')||document.querySelector('[data-chat-member=managed]'))throw Error('roster inferred from directory')
  const search=document.querySelector('[aria-label=搜索群成员]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'Jordan');search.dispatchEvent(new Event('input',{bubbles:true}));await pause(100)
  if(document.querySelectorAll('[data-chat-member]').length!==1)throw Error('member search')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(search,'');search.dispatchEvent(new Event('input',{bubbles:true}));await pause(100)
  document.querySelector('[aria-label="私聊 Alex Morgan"]').click();await wait(()=>document.querySelector('[data-chat-channel=dm-test]'),'direct conversation')
  document.querySelector('[data-conversation="room:design"]').click();await wait(()=>document.querySelector('.chat-thread-header p')?.textContent.includes('1 位成员'),'room scope')
  document.querySelector('[data-conversation=restricted]').click();await wait(()=>document.querySelector('.chat-thread-header p')?.textContent.includes('暂不可用'),'denial')
  document.querySelector('[aria-label=查看群成员]').click();await wait(()=>document.querySelector('.chat-member-failure'),'retry state');if(document.querySelectorAll('[data-chat-member]').length)throw Error('unauthorized fallback')
  document.querySelector('[data-conversation=general]').click();await wait(()=>document.querySelector('.chat-thread-header p')?.textContent.includes('3 位成员'),'back to group');document.querySelector('[aria-label=查看群成员]').click();await pause(200)
  return 'PASS provider-owned full roster, counts, presence, search, private conversation, room scope and denied-roster retry without directory fallback'
 }).toString()+')()',true)
 win.showInactive();await new Promise(r=>setTimeout(r,400));fs.writeFileSync(path.join(__dirname,'chat.png'),(await win.capturePage()).toPNG());fs.writeFileSync(output,result)
}).catch(error=>fs.writeFileSync(output,String(error))).finally(()=>app.exit())
setTimeout(()=>{fs.writeFileSync(output,'timeout');app.exit(1)},35000).unref()
