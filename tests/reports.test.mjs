import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const js=ts.transpileModule(readFileSync(new URL('../src/lib/reports/types.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText
const {validateReportTemplate,validateReportAnswers,validateReportConfig}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'))
const template={id:'support',name:'服务交接',cadence:'WEEKLY',enabled:true,revision:1,fields:[{id:'handover',label:'交接说明',type:'multiline',required:true},{id:'count',label:'处理数量',type:'number'},{id:'result',label:'结果',type:'select',options:['完成','待处理']}]}
test('another enterprise renders its own template without commerce fields',()=>{assert.equal(validateReportTemplate(template).name,'服务交接');assert.doesNotThrow(()=>validateReportAnswers(template,{handover:'已交接',count:0,result:'完成'},true))})
test('draft permits missing required fields; submit validates configured fields',()=>{assert.doesNotThrow(()=>validateReportAnswers(template,{},false));assert.throws(()=>validateReportAnswers(template,{},true),/交接说明/);assert.throws(()=>validateReportAnswers(template,{handover:'a',count:'3'},true),/格式无效/);assert.throws(()=>validateReportAnswers(template,{handover:'a',result:'forged'},true),/范围/)})
test('duplicate fields and stale fields fail visibly instead of being dropped',()=>{assert.throws(()=>validateReportTemplate({...template,fields:[template.fields[0],template.fields[0]]}));assert.throws(()=>validateReportAnswers(template,{handover:'a',removed:'preserve this'},false),/变化/)})

test('provider config rejects unsupported versions and invalid timezone',()=>{const config={version:1,timeZone:'Europe/Paris',today:'2026-11-23',canConfigure:false,templates:[{...template,canWrite:true}]};assert.doesNotThrow(()=>validateReportConfig(config));assert.throws(()=>validateReportConfig({...config,version:99}));assert.throws(()=>validateReportConfig({...config,timeZone:'fake/zone'}));assert.throws(()=>validateReportConfig({...config,templates:[{...template,canWrite:'true'}]}))})
