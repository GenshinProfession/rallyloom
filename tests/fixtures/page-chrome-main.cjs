const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path')
const output=path.join(process.env.RALLY_TEST_FIXTURE,'result.txt')
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1500,height:1000,webPreferences:{preload:path.join(__dirname,'preload.cjs'),backgroundThrottling:false}})
 await win.loadFile(process.env.RALLY_TEST_DIST)
 const result=await win.webContents.executeJavaScript('('+ (async()=>{
  const pause=ms=>new Promise(r=>setTimeout(r,ms));const wait=async(fn,label)=>{for(let i=0;i<120;i++){const v=fn();if(v)return v;await pause(70)}throw Error(label)}
  const click=label=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);if(!b)throw Error('missing '+label);b.click()}
  const nav=async page=>{document.querySelector('[data-nav='+page+']').click();await wait(()=>document.querySelector('[data-workspace-header]'),'shared header '+page);await pause(250)}
  await wait(()=>document.querySelector('[data-nav=docs]'),'navigation')
  const heights=[]
  for(const page of ['docs','tasks','reports','chat','team','office','notify']){
    await nav(page)
    const header=document.querySelector('[data-workspace-header]'),r=header.getBoundingClientRect()
    heights.push([page,r.height])
    if(getComputedStyle(header).backgroundColor!=='rgb(255, 255, 255)')throw Error('header background '+page)
    for(const button of header.querySelectorAll('button'))if(Math.abs(button.getBoundingClientRect().height-(button.getAttribute('role')==='tab'?28:32))>1)throw Error('button size '+page+' '+button.textContent)
  }
  if(new Set(heights.map(x=>x[1])).size!==1)throw Error('header height drift '+JSON.stringify(heights))
  await wait(()=>document.querySelectorAll('[data-notice-id]').length===3,'notice rows')
  const root=document.querySelector('[data-notify=root]').getBoundingClientRect(),content=document.querySelector('.notice-content').getBoundingClientRect(),detail=document.querySelector('.notice-detail').getBoundingClientRect()
  if(Math.abs(root.right-innerWidth)>1||Math.abs(root.bottom-innerHeight)>1||detail.right<root.right-20||Math.abs(content.bottom-root.bottom)>1)throw Error('notification page does not fill content area')
  document.querySelector('[data-notice-id=n1]').click();await wait(()=>document.querySelector('.notice-body'),'detail')
  if(!document.querySelector('.notice-body').textContent.includes('第二段'))throw Error('detail lost body')
  await wait(()=>!document.querySelector('[data-notice-id=n1] [aria-label=未读]'),'mark read')
  const input=document.querySelector('[aria-label=搜索通知]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'维护');input.dispatchEvent(new Event('input',{bubbles:true}));await pause(100)
  if(document.querySelectorAll('[data-notice-id]').length!==1)throw Error('search did not filter')
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'');input.dispatchEvent(new Event('input',{bubbles:true}));await pause(100)
  click('全部已读');await wait(()=>document.querySelector('.workspace-page-description').textContent.includes('0 条未读'),'mark all');await wait(()=>document.querySelector('[data-nav=notify]').textContent.trim()==='通知中心','sidebar unread sync')
  await nav('docs');await wait(()=>document.querySelector('.doc-list-head'),'document list')
  const pane=document.querySelector('[data-doc-pane]');if(pane.querySelectorAll('header').length!==1||pane.querySelectorAll('[aria-label=全屏文档]').length!==1)throw Error('duplicate document toolbar')
  document.querySelector('[aria-label=全屏文档]').click();await wait(()=>document.querySelector('[data-fullscreen]'),'fullscreen list');document.querySelector('[aria-label=退出全屏]').click()
  return 'PASS shared header heights/styles across seven pages; full-area notification inbox/detail, search, read and mark-all; single document toolbar and fullscreen'
 }).toString()+')()',true)
 win.showInactive();await new Promise(r=>setTimeout(r,450));fs.writeFileSync(path.join(__dirname,'docs.png'),(await win.capturePage()).toPNG())
 await win.webContents.executeJavaScript("document.querySelector('[data-nav=notify]').click()")
 await new Promise(r=>setTimeout(r,500));await win.webContents.executeJavaScript("document.querySelector('[data-notice-id=n1]').click()")
 await new Promise(r=>setTimeout(r,250));fs.writeFileSync(path.join(__dirname,'notifications.png'),(await win.capturePage()).toPNG())
 fs.writeFileSync(output,result)
}).catch(e=>fs.writeFileSync(output,String(e))).finally(()=>app.exit())
setTimeout(()=>{fs.writeFileSync(output,'timeout');app.exit(1)},45000).unref()
