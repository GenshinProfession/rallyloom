export interface ReportField { id: string; label: string; type: 'text' | 'multiline' | 'number' | 'date' | 'select'; required?: boolean; options?: string[] }
export interface ReportTemplate { id: string; name: string; cadence: 'DAILY' | 'WEEKLY' | 'MONTHLY'; enabled: boolean; fields: ReportField[]; revision: number; canWrite?: boolean }
export interface ReportConfig { version: 1; timeZone: string; today: string; canConfigure: boolean; templates: ReportTemplate[] }
export type ReportAnswers = Record<string, string | number | null>
export interface ReportEntry { id: string; authorId: string; authorName: string; periodStart: string; periodEnd: string; status: 'DRAFT' | 'SUBMITTED'; revision: number; canEdit: boolean; answers: ReportAnswers; template: ReportTemplate }
export interface ReportPage { items: ReportEntry[]; nextCursor: number | null; periodStart: string; periodEnd: string }
export function validateReportTemplate(t: ReportTemplate) {
 if (!/^[a-zA-Z0-9_-]{1,80}$/.test(t.id) || typeof t.enabled !== 'boolean' || !Array.isArray(t.fields) || !t.name.trim() || t.name.length > 80 || !['DAILY','WEEKLY','MONTHLY'].includes(t.cadence) || !t.fields.length || t.fields.length > 30) throw new Error('请填写模板名称、周期和1至30个字段。')
 const ids = new Set<string>()
 for (const f of t.fields) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(f.id) || ids.has(f.id) || !f.label.trim() || f.label.length > 120 || !['text','multiline','number','date','select'].includes(f.type)) throw new Error('字段名称、编号或类型无效。')
  ids.add(f.id)
  if (f.type === 'select' && (!f.options?.length || f.options.length > 50 || f.options.some(o => !o.trim() || o.length > 120) || new Set(f.options).size !== f.options.length)) throw new Error('选项不能为空或重复。')
 }
 return t
}
export function validateReportAnswers(template: ReportTemplate, answers: ReportAnswers, submit: boolean) {
 for (const f of template.fields) {
  const v = answers[f.id]
  if (v === undefined || v === null || v === '') { if (submit && f.required) throw new Error(`请填写${f.label}。`); continue }
  if (f.type === 'number' ? typeof v !== 'number' || !Number.isFinite(v) : typeof v !== 'string' || v.length > 10000) throw new Error(`${f.label}格式无效。`)
  if (f.type === 'select' && !f.options?.includes(String(v))) throw new Error(`${f.label}不在选项范围。`)
  if (f.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || !Number.isFinite(Date.parse(String(v))))) throw new Error(`${f.label}日期无效。`)
 }
 for (const id of Object.keys(answers)) if (!template.fields.some(f => f.id === id)) throw new Error('模板已发生变化，请重新载入后核对内容。')
}

export function validateReportConfig(config: ReportConfig) {
 if (config.version !== 1 || typeof config.canConfigure !== 'boolean' || !Array.isArray(config.templates) || config.templates.length > 100 || new Set(config.templates.map(t => t.id)).size !== config.templates.length || !/^\d{4}-\d{2}-\d{2}$/.test(config.today)) throw new Error('企业返回了无效的汇报配置。')
 try { new Intl.DateTimeFormat('en-US',{timeZone:config.timeZone}).format(); if (new Date(config.today).toISOString().slice(0,10)!==config.today) throw new Error() } catch { throw new Error('企业返回的汇报时区或日期无效。') }
 for (const template of config.templates) { validateReportTemplate(template); if (!Number.isInteger(template.revision) || template.revision < 1 || typeof template.canWrite !== 'boolean') throw new Error('模板版本或填写权限无效。') }
 return config
}
