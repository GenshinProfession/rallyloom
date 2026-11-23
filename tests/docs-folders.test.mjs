import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
const data=source=>'data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')
const types=data(readFileSync(new URL('../src/lib/docs/types.ts',import.meta.url),'utf8'))
const source=readFileSync(new URL('../src/lib/docs/demo.ts',import.meta.url),'utf8').replace("from './types'",`from '${types}'`)
const {DemoDocClient}=await import(data(source))
const store=new Map();globalThis.localStorage={getItem:key=>store.get(key)??null,setItem:(k,v)=>store.set(k,v)}
test('empty folders persist across client reload and duplicate names are rejected',async()=>{const c=new DemoDocClient('folders','Synthetic');const folder={entryType:'folder',title:'资料',space:'测试库',folderPath:[],format:'markdown',content:''};const saved=await c.create(folder);assert.equal((await new DemoDocClient('folders').list()).find(r=>r.id===saved.id).entryType,'folder');await assert.rejects(c.create(folder),/同名/);const child=await c.create({...folder,title:'子目录',folderPath:['资料']});await assert.rejects(c.remove(saved.id),/先移出/);await c.remove(child.id);await c.remove(saved.id);assert.ok(!(await c.list()).some(r=>r.id===saved.id))})
