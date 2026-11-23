const {contextBridge}=require('electron')
const employee=process.env.RALLY_TEST_ROLE==='employee'
const self={id:'self',connectorId:'synthetic',idpId:'synthetic-self',displayName:'测试员工',role:'member',roleId:employee?'employee':'platform_admin',roleName:employee?'员工':'平台超管',attrs:{},externalGroups:[],presence:'online',officeAssignable:true}
const permissions=['office.view','tasks.use','docs.use','chat.use','notify.view','reports.use',...(employee?['reports.write']:['tasks.coordinate','notify.publish','team.view','reports.configure','members.role'])]
const binding={baseUrl:'https://oa.example.com',display_name:'测试公司',installation_id:'test',workspace_id:'test',api_version:'v1',authorization:{issuer:'https://oa.example.com',client_id:'desktop',resource:'workspace'}}
const snapshot={tenant:{id:'test',name:'测试公司'},team:employee?[self]:[self,{...self,id:'managed',displayName:'可管理成员',memberActions:{roleOptions:[{id:'employee',label:'员工'}],canResetRole:true,canRemove:true}}],policy:{},datasource:{kind:'oa-rest'},layout:{width:800,height:500,rooms:[],assignments:{}},dataSlots:{},collaboration:{version:1,reporting:{version:1},documents:{folders:true},scopes:[{id:'division-rd',label:'研发事业部'}]}}
const joined={binding,memberId:'self',permissions,snapshot}
const board={revision:1,defaultStatus:'custom',statuses:[{id:'custom',label:'企业自定义流程',dot:'#123456',category:'pending'}],fields:[]}
const records={task:[{id:'task',title:'正式任务',status:'custom',attrs:{},updatedAt:new Date().toISOString(),origin:'local',sourceId:'mira',externalTaskId:'task',revision:1,createdBy:'self',canEdit:true,canManage:true,canDelete:true}],doc:[{id:'doc',title:'正式文档',space:'知识库',format:'rich',content:'<p>正式内容</p>',updatedAt:new Date().toISOString(),origin:'local',sourceId:'mira',externalDocId:'doc',revision:1,canEdit:true}],notice:[],report:[]}
let reportTemplate={id:'engineering-log',name:'研发交付日志',cadence:'DAILY',enabled:true,revision:1,canWrite:employee,fields:[{id:'delivery',label:'交付内容',type:'multiline',required:true},{id:'tickets',label:'关闭工单数',type:'number'}]}
let conflictOnce=true
const reportEntries=[{id:'10',authorId:'self',authorName:'测试员工',periodStart:'2026-11-23',periodEnd:'2026-11-23',status:'DRAFT',canEdit:employee,revision:1,template:reportTemplate,answers:{delivery:'本周交付',tickets:3}}]
contextBridge.exposeInMainWorld('rallyloom',{window:{},workspace:{resume:async()=>({ok:true,value:joined}),binding:async()=>({ok:true,value:binding}),logout:async()=>({ok:true}),oa:async(method,path,body)=>{
 let value={ok:true}
 if(path==='/oa/reports/templates')value={version:1,timeZone:'Europe/Paris',today:'2026-11-23',canConfigure:!employee,templates:[reportTemplate]}
 else if(path.startsWith('/oa/reports/templates/')&&method==='PUT'){if(employee)return {ok:false,code:'FORBIDDEN',error:'No permission'};reportTemplate={...body,revision:body.revision+1,canWrite:false};value=reportTemplate}
 else if(path.startsWith('/oa/reports/entries?'))value={items:reportEntries,nextCursor:null,periodStart:'2026-11-23',periodEnd:'2026-11-23'}
 else if(path.startsWith('/oa/reports/entries/')&&method==='PUT'){
  if(!employee)return {ok:false,code:'FORBIDDEN',error:'No permission'}
  if(conflictOnce){conflictOnce=false;return {ok:false,code:'CONFLICT',error:'版本冲突，请重新载入'}}
  reportEntries[0]={...reportEntries[0],answers:body.answers,status:body.submit?'SUBMITTED':'DRAFT',revision:2,canEdit:!body.submit};value={id:'10',revision:2,status:reportEntries[0].status}
 }
 else if(path==='/oa/task-board')value=board
 else if(path.startsWith('/oa/records/')){const kind=path.split('/')[3].split('?')[0];if(method==='GET')value={items:records[kind],nextCursor:null};else if(method==='POST'){value={...body,id:'created',revision:1,authorId:'self',ownerName:'测试员工',canEdit:true};records[kind].push(value)}else value={...body,id:'task',revision:2}}
 else if(path==='/oa/chat/channels')value=[{id:'general',name:'正式交流室',info:'授权范围'}]
 else if(path.includes('/messages')||path.startsWith('/oa/unread/'))value=[]
 else if(path.endsWith('/mentions'))value={people:[],allowAll:false}
 return {ok:true,value}
}}})
