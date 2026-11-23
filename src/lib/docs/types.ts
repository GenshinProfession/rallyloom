/* 文档中心 — 契约类型
   类钉钉文档中心：Rallyloom 内置富文本编辑器与阅读器，文档数据本身由
   云端/外部系统按《接入规范》`doc.upsert` / `doc.remove` 推送承接（agent-skill v1.7）。
   「对方提供存储的数据库格式」= DocRecord 字段 + source 幂等锚点。 */

export type DocFormat = 'rich' | 'markdown' | 'link'

/** 文章内附件（正文中间或文末，类型不限：图片/PDF/表格/压缩包/代码包…）
 *  演示环境用 data: URL 内联保存；正式部署由云端返回带时效的 https 地址。 */
export interface DocAttachment {
  id: string
  name: string
  size: number
  mime: string
  url: string
}

export interface DocRecord {
  /** Omitted for legacy documents; folders persist even when empty. */
  entryType?: 'document' | 'folder'
  revision?: number
  canEdit?: boolean
  canDelete?: boolean
  id: string
  /** 幂等锚点：source_id + external_doc_id 重推原地刷新 */
  sourceId: string
  externalDocId: string
  title: string
  /** 知识库/空间（钉钉的「知识库」语义；中性容器，自由命名） */
  space: string
  /** Ordered folder names, relative to the knowledge base. */
  folderPath?: readonly string[]
  format: DocFormat
  /** 正文：format='rich' 时为富文本 HTML，format='markdown' 时为 markdown 源文 */
  content?: string
  /** 文内附件清单（从正文附件节点汇总，便于外部系统与阅读器展示） */
  attachments?: readonly DocAttachment[]
  /** 外链文档（format='link' 时必填） */
  url?: string
  ownerName?: string
  /** ISO 时间 */
  updatedAt: string
  /** 自由属性 → 列表标签徽章 */
  attrs?: Record<string, string>
  origin: 'local' | 'sync'
}

export interface DocClient {
  supportsFolders?: boolean
  kind: 'demo-local' | 'oa-rest'
  label: string
  list(): Promise<DocRecord[]>
  create(draft: DocDraft): Promise<DocRecord>
  update(id: string, draft: DocDraft): Promise<DocRecord>
  remove(id: string): Promise<void>
  subscribe(cb: (records: DocRecord[]) => void): () => void
}

export type DocDraft = Pick<
  DocRecord,
  'entryType' | 'title' | 'space' | 'folderPath' | 'format' | 'content' | 'url' | 'attachments'
> & { revision?: number }

export function documentUrl(value: string | undefined) {
  try {
    const url = new URL(value?.trim() ?? '')
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export interface DocColumn {
  key: string
  label: string
}

/** 动态列：attrs 高频键自动出列（多维表格同款哲学，最多 4 列） */
export function docAttrColumns(records: readonly DocRecord[], maxCols = 4): DocColumn[] {
  const counts = new Map<string, number>()
  for (const doc of records) for (const key of Object.keys(doc.attrs ?? {})) counts.set(key, (counts.get(key) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxCols).map(([key]) => ({ key, label: key }))
}

export function docTime(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 附件体积的人类可读写法 */
export function fileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? Math.round(value) : value.toFixed(1)} ${units[index]}`
}

/** Attachments are downloads, never executable navigation URLs. */
export function attachmentUrl(value: string) {
  if (/^data:[a-zA-Z0-9.+/-]+;base64,[a-zA-Z0-9+/=\r\n]+$/.test(value)) return value
  return documentUrl(value)
}
