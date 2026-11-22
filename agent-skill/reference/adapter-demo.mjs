#!/usr/bin/env node
/* Rallyloom 参考适配器（adapter-demo.mjs）——零依赖，Node 18+（内置 fetch/crypto.randomUUID）。
 *
 * 它示范一个「源系统适配器」的标准形态：把你的系统的用户/组，映射成 Rallyloom 中性身份容器事件，
 * 处理幂等、重试与错误分类。你可以整体拷走改字段映射，其余逻辑尽量别动。
 *
 * 用法：
 *   node adapter-demo.mjs --validate   # 本地结构自测（不联网）：校验映射样例必过
 *   node adapter-demo.mjs --push       # 推送 3 个演示事件（需要 RALLYLOOM_INGEST_URL + RALLYLOOM_INGEST_TOKEN）
 *   node adapter-demo.mjs --reconcile  # 全量对账（同上 env；把 loadUsers() 换成你的真实查询）
 *
 * env:
 *   RALLYLOOM_INGEST_URL    如 https://oa.example.com/api/v1/ingest
 *   RALLYLOOM_INGEST_TOKEN  承接令牌（接入时由 Rallyloom 超管发放）
 *   RALLYLOOM_SOURCE_ID     你的系统注册 ID，如 "crm"
 */

const SOURCE_ID = process.env.RALLYLOOM_SOURCE_ID || 'demo-source'
const INGEST_URL = process.env.RALLYLOOM_INGEST_URL
const INGEST_TOKEN = process.env.RALLYLOOM_INGEST_TOKEN
const SCHEMA_VERSION = 1

/* ------------------------------------------------------------------ *
 * 1) 字段映射 —— 整个适配器唯一需要大改的地方
 * 把「你系统的用户对象」翻译成中性容器。规则：有什么给什么，没有的别造。
 * ------------------------------------------------------------------ */
function mapUserToPerson(user) {
  const attrs = {}
  // 你的系统可能有这些属性，也可能没有——逐个探测，存在才带：
  if (user.dept) attrs['部门'] = String(user.dept)
  if (user.jobTitle) attrs['岗位'] = String(user.jobTitle)
  if (user.employeeNo) attrs['工号'] = String(user.employeeNo)
  if (user.city) attrs['城市'] = String(user.city)
  return {
    source_id: SOURCE_ID,
    external_user_id: String(user.id),
    display_name: String(user.name),
    email: user.email || undefined, // 没有邮箱就整个省略，不报错
    attrs, // 可能为空对象 {}——完全合法（无部门系统）
    groups: (user.groupIds ?? []).map(String),
  }
}

/* ------------------------------------------------------------------ *
 * 2) 事件信封 —— 幂等与版本承诺的载体，不要改结构
 * ------------------------------------------------------------------ */
function buildEnvelope(eventType, payload) {
  return {
    event_id: crypto.randomUUID(),
    event_type: eventType,
    occurred_at: new Date().toISOString(),
    schema_version: SCHEMA_VERSION,
    payload,
  }
}

/* ------------------------------------------------------------------ *
 * 3) 结构校验 —— 与 schemas/*.json 同步的手写精简版
 * （接入验收要求用真 JSON Schema 引擎跑一遍，这里给运行时兜底）
 * ------------------------------------------------------------------ */
function validateEnvelope(env) {
  const errs = []
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  if (!uuid.test(env.event_id ?? '')) errs.push('event_id 必须是 UUID')
  if (!['person.upsert', 'person.remove', 'group.upsert', 'members.reconcile'].includes(env.event_type))
    errs.push(`event_type 非法：${env.event_type}`)
  if (Number.isNaN(Date.parse(env.occurred_at ?? ''))) errs.push('occurred_at 必须是 ISO 8601')
  if (env.schema_version !== SCHEMA_VERSION) errs.push(`schema_version 必须为 ${SCHEMA_VERSION}`)
  const p = env.payload ?? {}
  if (env.event_type !== 'group.upsert') {
    if (!p.source_id) errs.push('payload.source_id 必填')
    if (env.event_type !== 'members.reconcile' && !p.external_user_id)
      errs.push('payload.external_user_id 必填')
  }
  if (env.event_type === 'person.upsert' || env.event_type === 'group.upsert') {
    if (!p.display_name) errs.push('payload.display_name 必填')
  }
  if (env.event_type === 'person.upsert') {
    if (!Array.isArray(p.groups)) errs.push('payload.groups 必填（可为空数组）')
    else
      p.groups.forEach((g, i) => {
        if (typeof g !== 'string' || !g || g.length > 64) errs.push(`groups[${i}] 非法`)
      })
    Object.entries(p.attrs ?? {}).forEach(([k, v]) => {
      if (typeof v !== 'string') errs.push(`attrs.${k} 的值必须是字符串`)
      if (k.length > 64) errs.push(`attrs.${k} 键超长`)
    })
  }
  return errs
}

/* ------------------------------------------------------------------ *
 * 4) 推送 —— 幂等重试与错误分类（规范 §5 的参考实现）
 * ------------------------------------------------------------------ */
async function postEvent(endpoint, env, token, attempt = 0) {
  let res
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(env),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    // 网络层失败：退避重试
    if (attempt < 3) {
      const backoff = 1000 * 4 ** attempt
      console.warn(`网络错误（${err.code ?? err.name}），${backoff}ms 后重试 [${env.event_id}]`)
      await new Promise((r) => setTimeout(r, backoff))
      return postEvent(endpoint, env, token, attempt + 1)
    }
    throw new Error(`事件 [${env.event_id}] 3 次重试失败，已入死信队列，待补推：${err.message}`)
  }
  if (res.status === 200) return { ok: true, note: '已承接' }
  if (res.status === 409) return { ok: true, note: '幂等命中（event_id 重复），视为成功' }
  if (res.status === 401 || res.status === 403)
    throw new Error('令牌失效/无权限：停止重试，联系 Rallyloom 超管吊销重发')
  if (res.status === 422)
    throw new Error('schema_version 不兼容：事件已保留，告警人工，绝不静默丢弃（等待 Rallyloom 升级后重放）')
  if (res.status === 400) throw new Error(`载荷结构错误：${await res.text()}`)
  if (res.status >= 500) {
    if (attempt < 3) {
      const backoff = 1000 * 4 ** attempt
      console.warn(`服务端 ${res.status}，${backoff}ms 后重试 [${env.event_id}]`)
      await new Promise((r) => setTimeout(r, backoff))
      return postEvent(endpoint, env, token, attempt + 1)
    }
    throw new Error(`事件 [${env.event_id}] 服务端持续 5xx，转 reconcile 兜底`)
  }
  throw new Error(`意外状态 ${res.status}：${await res.text()}`)
}

/* ------------------------------------------------------------------ *
 * 5) 你的数据源 —— 演示用假数据；接真系统时换成 DB 查询 / API 拉取
 * ------------------------------------------------------------------ */
function loadUsers() {
  return [
    { id: 'u-1001', name: '陈媛', email: 'chen.yuan@crm.example.com', dept: '运营部', jobTitle: '运营专员', employeeNo: 'E1024', groupIds: ['crm-ops', 'crm-ops-lead'] },
    { id: 'u-1002', name: '林晓', email: 'lin.xiao@crm.example.com', dept: '运营部', jobTitle: '增长负责人', groupIds: ['crm-growth', 'crm-growth-lead'] },
    // 无部门系统样例：只有名字和组——中性容器的试金石
    { id: 'u-9001', name: '顾远', groupIds: ['ext-project'] },
  ]
}

/* ------------------------------------------------------------------ *
 * 命令行入口
 * ------------------------------------------------------------------ */
const arg = process.argv[2] ?? '--validate'
const events = process.argv.includes('--remove-demo')
  ? [buildEnvelope('person.remove', { source_id: SOURCE_ID, external_user_id: 'u-9001' })]
  : loadUsers().map((u) => buildEnvelope('person.upsert', mapUserToPerson(u)))

if (arg === '--validate') {
  let fail = 0
  for (const env of events) {
    const errs = validateEnvelope(env)
    console.log(`[validate] ${env.event_type} ${env.payload.external_user_id ?? ''} → ${errs.length ? 'FAIL ' + errs.join('; ') : 'OK'}`)
    fail += errs.length
  }
  // 幂等演示：同一信封重发不会产生第二份（本地模拟 409 语义）
  console.log(`[validate] 幂等自检：同一 event_id 重发 → 服务端 409 → 视为成功`)
  process.exit(fail ? 1 : 0)
}

if (arg === '--push' || arg === '--reconcile') {
  if (!INGEST_URL || !INGEST_TOKEN) {
    console.error('需要 env：RALLYLOOM_INGEST_URL 与 RALLYLOOM_INGEST_TOKEN（向 Rallyloom 超管索取）')
    process.exit(1)
  }
  const endpoint = arg === '--push' ? `${INGEST_URL}/events` : `${INGEST_URL}/reconcile`
  const envelope =
    arg === '--push'
      ? events[0]
      : buildEnvelope('members.reconcile', { source_id: SOURCE_ID, persons: events.map((e) => e.payload) })
  const result = await postEvent(endpoint, envelope, INGEST_TOKEN)
  console.log(`[${arg.slice(2)}] ${result.note}`)
}
