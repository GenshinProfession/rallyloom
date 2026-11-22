import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
const moduleUrl = (source) => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString('base64')
const typesUrl = moduleUrl(readFileSync(new URL('../src/lib/tasks/types.ts', import.meta.url), 'utf8'))
const { validateBoard, canMoveTask, validateTaskPatch } = await import(typesUrl)
const demoSource = readFileSync(new URL('../src/lib/tasks/demo.ts', import.meta.url), 'utf8').replace(/import \{ MEMBERS \} from [^\n]+/, 'const MEMBERS = []').replace("from './types'", `from '${typesUrl}'`)
const { DemoTaskClient } = await import(moduleUrl(demoSource))
const board = { defaultStatus: 'new', statuses: [{ id: 'new', label: '新需求', dot: '#aaaaaa', transitions: ['review'] }, { id: 'review', label: '业务审核', dot: '#336699', transitions: [] }], fields: [{ id: 'fee', label: '预算', type: 'number', required: true }, { id: 'area', label: '地区', type: 'select', options: ['华东', '华南'] }] }
test('enterprise state IDs, names, fields and transitions are preserved', () => {
  assert.equal(validateBoard(board), board)
  assert.equal(canMoveTask(board, 'new', 'review'), true)
  assert.equal(canMoveTask(board, 'review', 'new'), false)
  assert.equal(canMoveTask(board, 'new', 'done'), false)
  assert.equal(canMoveTask(board, 'review', 'review'), true)
  assert.throws(() => validateBoard({ ...board, defaultStatus: 'todo' }))
  assert.throws(() => validateBoard({ ...board, statuses: [...board.statuses, board.statuses[0]] }))
  assert.throws(() => validateBoard({ ...board, fields: [...board.fields, board.fields[0]] }))
})
test('configured required fields, numeric values and options are validated', () => {
  assert.throws(() => validateTaskPatch(board, { attrs: {} }))
  assert.throws(() => validateTaskPatch(board, { attrs: { fee: 'oops' } }))
  assert.throws(() => validateTaskPatch(board, { attrs: { fee: '20', area: 'wrong' } }))
  assert.doesNotThrow(() => validateTaskPatch(board, { status: 'review', attrs: { fee: '20', area: '华东' } }))
})
test('cross-column and within-column order persist, invalid moves preserve data', async () => {
  const client = new DemoTaskClient()
  const original = await client.list()
  const source = original.find((task) => task.status === 'todo')
  const target = original.find((task) => task.status === 'doing')
  let rows = await client.move(source.id, { status: 'doing', beforeId: target.id })
  assert.equal(rows.find((task) => task.id === source.id).status, 'doing')
  assert.equal(rows.indexOf(rows.find((task) => task.id === source.id)) + 1, rows.indexOf(rows.find((task) => task.id === target.id)))
  rows = await client.move(source.id, { status: 'doing', beforeId: null })
  assert.equal(rows.filter((task) => task.status === 'doing').at(-1).id, source.id)
  await assert.rejects(client.move(source.id, { status: 'not-defined', beforeId: null }))
  assert.deepEqual(await client.list(), rows)
  await client.update(source.id, { reviewPending: true })
  await assert.rejects(client.move(source.id, { status: 'done', beforeId: null }))
})
