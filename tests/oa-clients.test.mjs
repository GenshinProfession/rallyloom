import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const url = (source) => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')
const types = url(readFileSync(new URL('../src/lib/tasks/types.ts', import.meta.url), 'utf8'))
const source = readFileSync(new URL('../src/lib/oa/clients.ts', import.meta.url), 'utf8').replace("import { workspaceValue } from '@/lib/store/workspace-binding'", "const workspaceValue = (result) => { if (!result.ok) throw new Error(result.error); return result.value }").replace("from '@/lib/tasks/types'", `from '${types}'`)
const { OaTaskClient, OaDocClient, OaChatClient, OaNoticeClient } = await import(url(source))
const board = { defaultStatus: 'review', statuses: [{ id: 'review', label: '企业审核', dot: '#123456' }], fields: [{ id: 'budget', label: '预算', type: 'number' }] }
let requests = []
globalThis.window = { rallyloom: { workspace: { oa: async (method, path, body, scope) => { requests.push({ method, path, body, scope }); if (path === '/oa/task-board') return { ok: true, value: board }; if (path.includes('/records/task?')) return { ok: true, value: { items: [{ id: 'a', revision: 7, sortOrder: 2 }, { id: 'b', revision: 4, sortOrder: 1 }], nextCursor: null } }; if (path.includes('/records/doc?')) return { ok: true, value: { items: [{ id: 'doc-a', revision: 3 }], nextCursor: null } }; return { ok: true, value: { id: 'a', revision: 8 } } } } } }
test('formal task configuration is fetched from Mira, scope and revision travel on writes', async () => {
  requests = []; const client = new OaTaskClient('42'); const rows = await client.list()
  assert.equal(client.board.statuses[0].label, '企业审核'); assert.deepEqual(rows.map((r) => r.id), ['b', 'a'])
  await client.move('a', { status: 'review', beforeId: 'b' })
  const request = requests.find((r) => r.path.includes('/move'))
  assert.equal(request.body.revision, 7); assert.equal(request.scope, '42'); assert.equal(request.body.beforeId, 'b')
})
test('document edits include the last server revision, deletion is explicit', async () => {
  requests = []; const client = new OaDocClient(); await client.list(); await client.update('doc-a', { title: '文档', format: 'rich', space: '知识库' })
  assert.equal(requests.find((r) => r.method === 'PATCH').body.revision, 3)
  await client.update('doc-a', { title: '旧草稿', format: 'rich', space: '知识库', revision: 1 }); assert.equal(requests.filter((r) => r.method === 'PATCH').at(-1).body.revision, 1)
})
test('backend denials do not fall back to demo data', async () => {
  const previous = window.rallyloom.workspace.oa; window.rallyloom.workspace.oa = async () => ({ ok: false, error: '无权限', code: 'FORBIDDEN' })
  await assert.rejects(new OaTaskClient().list(), /无权限/); await assert.rejects(new OaChatClient().channels(), /无权限/)
  window.rallyloom.workspace.oa = previous
})

test('writes update the live document view immediately instead of waiting for polling', async () => {
  requests=[];const client=new OaDocClient();let received=[];const unsubscribe=client.subscribe((rows)=>{received=rows});
  await client.create({title:'新文档',space:'知识库',format:'rich'});assert.equal(received[0].id,'a');unsubscribe();
})

test('notification read writes immediately notify all views; rejected writes preserve unread state', async () => {
  const previous=window.rallyloom.workspace.oa
  let reject=false,received=[],events=0
  window.rallyloom.workspace.oa=async(method,path)=>path.includes('/records/notice?')?{ok:true,value:{items:[{id:'notice-a',isRead:false}],nextCursor:null}}:reject?{ok:false,error:'拒绝写入'}:{ok:true,value:{}}
  const client=new OaNoticeClient(),unsubscribe=client.subscribe(rows=>{received=rows;events++})
  try {
    await client.list();await client.markRead(['notice-a'])
    assert.equal(events,1);assert.equal(received[0].isRead,true)
    await client.list();reject=true
    await assert.rejects(client.markRead(['notice-a']),/拒绝写入/)
    assert.equal(events,1)
  } finally {unsubscribe();window.rallyloom.workspace.oa=previous}
})

test('group roster is channel-scoped and rejects malformed provider data instead of using the directory', async () => {
  const previous=window.rallyloom.workspace.oa;let endpoint
  try {
    window.rallyloom.workspace.oa=async(method,path)=>{endpoint=path;return {ok:true,value:[{id:'self',name:'本人',presence:'online'}]}}
    const client=new OaChatClient();assert.equal((await client.participants('room:design'))[0].id,'self');assert.equal(endpoint,'/oa/chat/channels/room%3Adesign/members')
    window.rallyloom.workspace.oa=async()=>({ok:true,value:{people:[]}})
    await assert.rejects(client.participants('room:design'),/无效的群成员/)
  } finally {window.rallyloom.workspace.oa=previous}
})
