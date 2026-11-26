export interface ReportColumn { id: string; label: string; type: 'text' | 'number'; required?: boolean }
export interface ReportField { id: string; label: string; section?: string; type: 'text' | 'multiline' | 'number' | 'date' | 'select' | 'table'; required?: boolean; options?: string[]; columns?: ReportColumn[]; minRows?: number; maxRows?: number; initialRows?: Record<string, string | number | null>[] }
export interface ReportTemplate { id: string; name: string; cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY'; enabled: boolean; fields: ReportField[]; revision: number; canWrite?: boolean; writeWindowOpen?: boolean; submissionWindow?: { days: ['SATURDAY','SUNDAY']; reportPeriod: 'PREVIOUS_WEEK' } }
export interface ReportConfig { version: 1; timeZone: string; today: string; canConfigure: boolean; templates: ReportTemplate[] }
export type ReportTableRow = Record<string, string | number | null>
export type ReportAnswers = Record<string, string | number | ReportTableRow[] | null>
export interface ReportEntry { id: string; authorId: string; authorName: string; periodStart: string; periodEnd: string; status: 'DRAFT' | 'SUBMITTED'; revision: number; canEdit: boolean; answers: ReportAnswers; template: ReportTemplate }
export interface ReportPage { items: ReportEntry[]; nextCursor: number | null; periodStart: string; periodEnd: string }
export function validateReportTemplate(t: ReportTemplate) {
 if (!/^[a-zA-Z0-9_-]{1,80}$/.test(t.id) || typeof t.enabled !== 'boolean' || !Array.isArray(t.fields) || !t.name.trim() || t.name.length > 80 || !['DAILY','WEEKLY','MONTHLY'].includes(t.cadence) || !t.fields.length || t.fields.length > 30) throw new Error('请填写模板名称、周期和1至30个字段。')
 const ids = new Set<string>()
 for (const f of t.fields) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(f.id) || ids.has(f.id) || !f.label.trim() || f.label.length > 120 || f.section !== undefined && (typeof f.section !== 'string' || f.section.length > 80) || !['text','multiline','number','date','select','table'].includes(f.type)) throw new Error('字段名称、编号或类型无效。')
  ids.add(f.id)
  if (f.type === 'select' && (!f.options?.length || f.options.length > 50 || f.options.some(o => !o.trim() || o.length > 120) || new Set(f.options).size !== f.options.length)) throw new Error('选项不能为空或重复。')
  if (f.type === 'table') {
   if (!f.columns?.length || f.columns.length > 20 || !Number.isInteger(f.minRows ?? 0) || !Number.isInteger(f.maxRows ?? 50) || (f.minRows ?? 0) < 0 || (f.minRows ?? 0) > 100 || (f.maxRows ?? 50) < 1 || (f.maxRows ?? 50) > 100 || (f.minRows ?? 0) > (f.maxRows ?? 50)) throw new Error('重复表格列或行数范围无效。')
   const columnIds = new Set<string>()
   for (const column of f.columns) { if (!/^[a-zA-Z0-9_-]{1,80}$/.test(column.id) || columnIds.has(column.id) || !column.label.trim() || column.label.length > 80 || !['text','number'].includes(column.type)) throw new Error('表格列名称、编号或类型无效。'); columnIds.add(column.id) }
   if ((f.initialRows?.length ?? 0) > (f.maxRows ?? 50)) throw new Error('表格预置行超过上限。')
  }
 }
 return t
}
export function validateReportAnswers(template: ReportTemplate, answers: ReportAnswers, submit: boolean) {
 for (const f of template.fields) {
  const v = answers[f.id]
  if (v === undefined || v === null || v === '') { if (submit && f.type === 'table' && (f.minRows ?? 0) > 0) throw new Error(`${f.label}的行数不符合要求。`); if (submit && f.required) throw new Error(`请填写${f.label}。`); continue }
  if (f.type === 'table') {
   if (!Array.isArray(v) || v.length > (f.maxRows ?? 50) || v.length < (f.minRows ?? 0) || submit && f.required && v.length === 0) throw new Error(`${f.label}的行数不符合要求。`)
   const allowed = new Set(f.columns?.map(column => column.id) ?? [])
   for (const row of v) {
    if (!row || typeof row !== 'object' || Object.keys(row).some(id => !allowed.has(id))) throw new Error(`${f.label}包含无效列。`)
    for (const column of f.columns ?? []) {
     const cell = row[column.id]
     if (cell === undefined || cell === null || cell === '') { if (submit && column.required) throw new Error(`请填写${column.label}。`); continue }
     if (column.type === 'number' ? typeof cell !== 'number' || !Number.isFinite(cell) : typeof cell !== 'string' || cell.length > 2000) throw new Error(`${column.label}格式无效。`)
    }
   }
   continue
  }
  if (f.type === 'number' ? typeof v !== 'number' || !Number.isFinite(v) : typeof v !== 'string' || v.length > 10000) throw new Error(`${f.label}格式无效。`)
  if (f.type === 'select' && !f.options?.includes(String(v))) throw new Error(`${f.label}不在选项范围。`)
  if (f.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || !Number.isFinite(Date.parse(String(v))))) throw new Error(`${f.label}日期无效。`)
 }
 for (const id of Object.keys(answers)) if (!template.fields.some(f => f.id === id)) throw new Error('模板已发生变化，请重新载入后核对内容。')
}

export function validateReportConfig(config: ReportConfig) {
 if (config.version !== 1 || typeof config.canConfigure !== 'boolean' || !Array.isArray(config.templates) || config.templates.length > 100 || new Set(config.templates.map(t => t.id)).size !== config.templates.length || !/^\d{4}-\d{2}-\d{2}$/.test(config.today)) throw new Error('企业返回了无效的汇报配置。')
 try { new Intl.DateTimeFormat('en-US',{timeZone:config.timeZone}).format(); if (new Date(config.today).toISOString().slice(0,10)!==config.today) throw new Error() } catch { throw new Error('企业返回的汇报时区或日期无效。') }
 for (const template of config.templates) {
  validateReportTemplate(template)
  if (!Number.isInteger(template.revision) || template.revision < 1 || typeof template.canWrite !== 'boolean') throw new Error('模板版本或填写权限无效。')
  if (template.submissionWindow && (template.cadence !== 'WEEKLY' || template.submissionWindow.reportPeriod !== 'PREVIOUS_WEEK' || template.submissionWindow.days.join(',') !== 'SATURDAY,SUNDAY' || typeof template.writeWindowOpen !== 'boolean')) throw new Error('企业返回了无效的周报填写周期。')
 }
 return config
}
