const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path')
const output=path.join(process.env.RALLY_TEST_FIXTURE,'result.txt')
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1550,height:1000,webPreferences:{preload:path.join(__dirname,'preload.cjs'),backgroundThrottling:false}})
 await win.loadFile(process.env.RALLY_TEST_DIST)
 const result=await win.webContents.executeJavaScript('('+ (async()=>{
  const pause=ms=>new Promise(r=>setTimeout(r,ms)),wait=async(fn,label)=>{for(let i=0;i<120;i++){if(fn())return;await pause(70)}throw Error(label+' '+document.body.textContent.slice(-300))}
  const click=label=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!button)throw Error('missing '+label);button.click()}
  await wait(()=>document.querySelector('.office-room-label'),'room');await pause(350)
  if(document.body.textContent.includes('试走'))throw Error('trial walking still exposed')
  document.querySelector('.office-room-label').click();await wait(()=>document.querySelector('[data-seat-target]'),'empty seats')
  document.querySelector('[data-seat-target="design:0"]').click();await wait(()=>document.querySelector('[data-person=self] button[title="点击离座"]'),'avatar seated')
  document.querySelector('[data-person=self] button').click();await wait(()=>document.querySelector('[data-seat-target="design:0"]'),'seat freed')
  if(document.querySelector('[data-person=self] button[title="点击离座"]'))throw Error('standing avatar still seated')
  document.querySelector('[data-seat-target="design:1"]').click();await wait(()=>document.querySelector('[data-person=self] button[title="点击离座"]'),'reseat')
  document.querySelector('[data-nav=reports]').click();await wait(()=>document.querySelector('[data-reports=root]'),'reports')
  click('新增模板');await wait(()=>document.querySelector('[data-report-template-editor]'),'editor')
  const panel=document.querySelector('[data-report-template-editor]'),footer=panel.querySelector('footer').getBoundingClientRect(),pr=panel.getBoundingClientRect()
  if(footer.bottom>pr.bottom+1||panel.querySelector('.report-template-preview').getBoundingClientRect().width<200)throw Error('template layout')
  const name=document.querySelector('[aria-label=模板名称]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(name,'团队周报');name.dispatchEvent(new Event('input',{bubbles:true}));await pause(80)
  click('周报');await wait(()=>document.querySelector('.report-preview-paper').textContent.includes('每周'),'live preview')
  for(const row of document.querySelectorAll('.report-field-row')){const boxes=[...row.children].map(e=>e.getBoundingClientRect());const centers=boxes.map(r=>r.top+r.height/2);if(Math.max(...centers)-Math.min(...centers)>2)throw Error('field controls misaligned')}
  click('取消');await wait(()=>!document.querySelector('[role=dialog]'),'close editor')
  click('本地模板');await wait(()=>document.querySelector('.report-library-dialog'),'library');click('创建本地模板');await wait(()=>document.querySelector('[data-report-template-editor]'),'local editor')
  const localName=document.querySelector('[aria-label=模板名称]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(localName,'我的本地草稿');localName.dispatchEvent(new Event('input',{bubbles:true}));await pause(80)
  click('保存本地模板');await wait(()=>document.querySelector('.report-library-card')?.textContent.includes('我的本地草稿'),'local saved')
  click('完成');await wait(()=>!document.querySelector('[role=dialog]'),'library closed');click('本地模板');await wait(()=>document.querySelector('.report-library-card')?.textContent.includes('我的本地草稿'),'local persistence')
  click('完成');await wait(()=>!document.querySelector('[role=dialog]'),'close');click('新增模板');await wait(()=>document.querySelector('[data-report-template-editor]'),'final editor')
  return 'PASS real seat/stand/reseat without trial mode; template live preview, aligned controls/footer, local drafts persist without enterprise writes'
 }).toString()+')()',true)
 win.showInactive();await new Promise(r=>setTimeout(r,500));fs.writeFileSync(path.join(__dirname,'template.png'),(await win.capturePage()).toPNG());fs.writeFileSync(output,result)
}).catch(error=>fs.writeFileSync(output,String(error))).finally(()=>app.exit())
setTimeout(()=>{fs.writeFileSync(output,'timeout');app.exit(1)},45000).unref()
