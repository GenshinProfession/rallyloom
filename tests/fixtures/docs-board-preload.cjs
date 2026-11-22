const {contextBridge}=require('electron')
const binding={baseUrl:'https://oa.example.com',display_name:'测试公司',installation_id:'test',workspace_id:'test',authorization:{issuer:'https://oa.example.com',client_id:'desktop',resource:'workspace'}}
contextBridge.exposeInMainWorld('rallyloom',{window:{minimize(){},toggleMaximize(){},close(){}},workspace:{
resume:async()=>({ok:true,value:null}),binding:async()=>({ok:true,value:null}),
discover:async()=>({ok:true,value:binding}),cancel:async()=>({ok:true}),
signIn:()=>new Promise(()=>{}),callback:async()=>({ok:false,error:'测试回调'}),forget:async()=>({ok:true})
}})
