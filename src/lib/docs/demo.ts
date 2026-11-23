/* DemoDocClient — 文档中心演示源（按租户保存在本机）
   种子=企业公共文档（类钉钉知识库）：制度规范 / 入职引导 / 运营标准 空间，
   含 hr 系统外部推送样例（origin 'sync'）。 */

import { documentUrl, type DocAttachment, type DocClient, type DocDraft, type DocRecord } from './types'

const DAY = 86_400_000
const now = Date.now()
const iso = (days: number) => new Date(now - days * DAY).toISOString()

const SEED: DocRecord[] = [
  {
    id: 'd1', sourceId: 'rallyloom', externalDocId: 'DOC-HB-32',
    title: '员工手册 V3.2', space: '制度规范', format: 'markdown', ownerName: '人事行政', updatedAt: iso(6), origin: 'local',
    folderPath: ['人事制度', '员工手册'],
    attrs: { 版本: 'V3.2' },
    content: [
      '# 员工手册 V3.2',
      '',
      '> 本手册为演示文档，真实环境由云端按《接入规范》`doc.upsert` 推送承接。',
      '',
      '## 考勤',
      '',
      '- 工作日 9:30 – 18:30，弹性 30 分钟；',
      '- 请假在「团队管理 → 成员」查看在岗状态，无需线下审批单；',
      '- 连续加班 3 天，第 4 天可申请调休。',
      '',
      '## 报销',
      '',
      '1. 差旅报销：行程结束 5 个工作日内提交；',
      '2. 单笔 ¥2,000 以上附审批人姓名；',
      '3. 所有票据走电子档案，纸质票拍照上传。',
      '',
      '## 差旅',
      '',
      '| 城市 | 住宿标准/晚 | 说明 |',
      '| --- | --- | --- |',
      '| 一线 | ¥450 | 含税发票 |',
      '| 二线 | ¥350 | 连住 3 晚可议价 |',
      '',
      '```text',
      '有问题先在交流室 #general 提问，人事会在 2 小时内回复。',
      '```',
    ].join('\n'),
  },
  {
    id: 'd2', sourceId: 'rallyloom', externalDocId: 'DOC-SOP-11',
    title: '大促作战 SOP', space: '运营标准', format: 'markdown', ownerName: '运营指挥台', updatedAt: iso(2), origin: 'local',
    folderPath: ['店铺运营', '活动执行'],
    attrs: { 适用: '全员运营', 阶段: '预热→复盘' },
    content: [
      '# 大促作战 SOP',
      '',
      '## 一、预热期（T-14 ~ T-1）',
      '',
      '- **选品**：主推款确认后 24h 内录入任务看板并指派到人；',
      '- **素材**：视觉组出主图与详情页，任务卡打 `P0` 优先级；',
      '- **库存**：履约组与仓储确认安全库存，任务看板「渠道 / 仓库」字段必填。',
      '',
      '## 二、爆发期（T 日）',
      '',
      '1. 指挥台每 2 小时同步 GMV 到「老板办公台」外置看板；',
      '2. 客服首响超 5 分钟，值班主管在交流室 @值班组；',
      '3. 爆仓预警触发时，按 WMS 公告执行临时拣货通道预案。',
      '',
      '## 三、复盘期（T+3）',
      '',
      '- 复盘会材料统一放本空间「复盘」标签下；',
      '- 逾期未闭环的任务在看板「已完成」列验收前不得清板。',
    ].join('\n'),
  },
  {
    id: 'd3', sourceId: 'rallyloom', externalDocId: 'DOC-VIS-07',
    title: '品牌视觉规范速查', space: '运营标准', format: 'markdown', ownerName: '商品视觉', updatedAt: iso(9), origin: 'local',
    folderPath: ['素材与品牌'],
    attrs: { 适用: '设计/运营' },
    content: [
      '# 品牌视觉规范速查',
      '',
      '- **主色** 钢蓝 `#3f72b5`；强调色仅用于数字与状态；',
      '- **字体**：界面用 Inter / Noto Sans SC，物料禁用三种以上字体；',
      '- **间距**：卡片 8px 网格，列表行高不小于 32px；',
      '- **图片**：主图白底，比例 1:1，长边 ≥ 1200px。',
      '',
      '详见完整规范请联系视觉组。',
    ].join('\n'),
  },
  {
    id: 'd4', sourceId: 'rallyloom', externalDocId: 'DOC-ONB-03',
    title: '新员工入职指引', space: '入职引导', format: 'markdown', ownerName: '人事行政', updatedAt: iso(20), origin: 'local',
    attrs: { 阅读: '入职首日' },
    content: [
      '# 新员工入职指引',
      '',
      '1. 用公司账号登录 Rallyloom（外部身份源自动同步你的资料）；',
      '2. 在「办公室」找到自己的工位，头像亮起即为在线；',
      '3. 日常工作沟通走「交流室」，任务认领看「任务看板」；',
      '4. 制度类问题先查本空间，再在 #general 提问。',
    ].join('\n'),
  },
  {
    id: 'd5', sourceId: 'rallyloom', externalDocId: 'DOC-KF-11',
    title: '客服话术精选 V11', space: '运营标准', format: 'markdown', ownerName: '售后客服', updatedAt: iso(4), origin: 'local',
    folderPath: ['售后服务', '客服话术'],
    attrs: { 适用: '客服组' },
    content: [
      '# 客服话术精选 V11',
      '',
      '## 开场',
      '',
      '您好，我是 Rallyloom 旗舰店客服，很高兴为您服务～',
      '',
      '## 催发货',
      '',
      '- 查单 → 告知预计发出时间 → 超时主动补偿 5 元无门槛券；',
      '- 爆仓期间引用 WMS 公告口径，不做时间承诺。',
      '',
      '## 退款',
      '',
      '收到，帮您登记退款申请，1 个工作日内原路退回，请留意到账通知。',
    ].join('\n'),
  },
  {
    id: 'd6', sourceId: 'hr', externalDocId: 'HR-LEAVE-2026',
    title: '2026 年假与调休政策', space: '制度规范', format: 'link', ownerName: '人事行政', updatedAt: iso(1.2), origin: 'sync',
    folderPath: ['人事制度', '假勤政策'],
    attrs: { 来源: 'HR 系统' },
    url: 'https://hr.rallyloom-demo.invalid/policies/leave-2026',
  },
]

function normalizeAttachments(input: readonly DocAttachment[] | undefined): DocAttachment[] {
  return (input ?? [])
    .filter((file) => Boolean(file?.name?.trim()) && typeof file?.url === 'string' && file.url.length > 0)
    .map((file) => ({
      id: file.id || crypto.randomUUID(),
      name: file.name.trim(),
      size: Number.isFinite(file.size) ? Math.max(0, Math.round(file.size)) : 0,
      mime: file.mime || 'application/octet-stream',
      url: file.url,
    }))
}

function normalizeDraft(draft: DocDraft): DocDraft {
  const title = draft.title.trim()
  const space = draft.space.trim()
  const folderPath = (draft.folderPath ?? []).map((name) => name.trim()).filter(Boolean)
  if (!title || !space) throw new Error('请填写文档标题和知识库。')
  if ([space, ...folderPath].some((name) => name.includes('/'))) throw new Error('知识库或文件夹名称不能包含斜杠。')
  if (draft.entryType === 'folder') { if (title.includes('/') || title.includes('\\') || title.length>100 || folderPath.length>=10) throw new Error('文件夹名称或层级无效。'); return {entryType:'folder',title,space,folderPath,format:'markdown',content:''} }
  if (draft.format === 'rich') {
    return { title, space, folderPath, format: 'rich', content: draft.content ?? '', attachments: normalizeAttachments(draft.attachments) }
  }
  if (draft.format === 'markdown') {
    return { title, space, folderPath, format: 'markdown', content: draft.content ?? '' }
  }
  const url = documentUrl(draft.url)
  if (!url) throw new Error('请输入有效的 HTTP 或 HTTPS 链接。')
  return { title, space, folderPath, format: draft.format, url }
}

export class DemoDocClient implements DocClient {
  readonly kind = 'demo-local' as const
  readonly label = '演示文档源'
  readonly supportsFolders = true
  private readonly storageKey: string
  private listeners = new Set<(records: DocRecord[]) => void>()

  constructor(tenantId: string, private readonly actor?: string) {
    this.storageKey = `rallyloom:demo:docs:${tenantId}`
  }

  private read(): DocRecord[] {
    const value = localStorage.getItem(this.storageKey)
    return value === null ? structuredClone(SEED) : JSON.parse(value)
  }

  private save(records: DocRecord[]) {
    localStorage.setItem(this.storageKey, JSON.stringify(records))
    for (const listener of this.listeners) listener(structuredClone(records))
  }

  async list() { return this.read() }

  async create(draft: DocDraft) {
    if (draft.entryType === 'folder' && this.read().some(r => r.entryType === 'folder' && r.space === draft.space && r.title === draft.title.trim() && JSON.stringify(r.folderPath??[]) === JSON.stringify(draft.folderPath??[]))) throw new Error('此位置已有同名文件夹。')
    const id = crypto.randomUUID()
    const doc: DocRecord = { ...normalizeDraft(draft), id, sourceId: 'rallyloom', externalDocId: id,
      ownerName: this.actor, updatedAt: new Date().toISOString(), origin: 'local' }
    this.save([doc, ...this.read()])
    return doc
  }

  async update(id: string, draft: DocDraft) {
    const records = this.read()
    const index = this.editableIndex(records, id)
    const { content, url, ...metadata } = records[index]
    const doc: DocRecord = { ...metadata, ...normalizeDraft(draft), updatedAt: new Date().toISOString() }
    records[index] = doc
    this.save(records)
    return doc
  }

  async remove(id: string) {
    const records = this.read()
    const index=this.editableIndex(records,id),folder=records[index];if(folder.entryType==='folder'){const prefix=[...(folder.folderPath??[]),folder.title];if(records.some(r=>r.id!==id&&r.space===folder.space&&prefix.every((name,i)=>r.folderPath?.[i]===name)))throw new Error('请先移出文件夹中的文档或子文件夹。')}
    records.splice(index, 1)
    this.save(records)
  }

  private editableIndex(records: readonly DocRecord[], id: string) {
    const index = records.findIndex((doc) => doc.id === id)
    if (index < 0) throw new Error('文档已不存在。')
    if (records[index].origin !== 'local') throw new Error('请在来源系统修改这篇文档。')
    return index
  }

  subscribe(cb: (records: DocRecord[]) => void) {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }
}
