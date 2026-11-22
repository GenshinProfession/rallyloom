/* 文档中心 — 正文格式转换
   演示源里既有历史 markdown 文档，也有新编辑的富文本（HTML）。
   阅读器与编辑器统一走「先转 HTML 再交给 TipTap」的管线，避免两套渲染。 */

import { marked } from 'marked'
import type { DocRecord } from './types'

marked.setOptions({ gfm: true, breaks: true })

/** markdown → HTML（历史文档、外部系统按 content_format=markdown 推送时使用） */
export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return ''
  const output = marked.parse(markdown, { async: false })
  return typeof output === 'string' ? output : ''
}

/** 文档正文 → HTML（阅读器/编辑器的唯一入口） */
export function docHtml(doc: Pick<DocRecord, 'format' | 'content'>): string {
  if (doc.format === 'link') return ''
  const content = doc.content ?? ''
  return doc.format === 'rich' ? content : markdownToHtml(content)
}

/** HTML → 纯文本（摘要、字数、搜索） */
export function htmlToText(html: string): string {
  if (!html.trim()) return ''
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return (parsed.body.textContent ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 字数统计：中文字符按字，西文按词 */
export function textStats(text: string) {
  const cjk = text.match(/[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff]/g)?.length ?? 0
  const latin = text.match(/[A-Za-z0-9]+(?:['-][A-Za-z0-9]+)*/g)?.length ?? 0
  const words = cjk + latin
  return { chars: text.replace(/\s/g, '').length, words, readMinutes: Math.max(1, Math.round(words / 320)) }
}

/** 列表摘要 */
export function docExcerpt(doc: Pick<DocRecord, 'format' | 'content' | 'url'>, max = 120): string {
  const text = doc.format === 'link' ? (doc.url ?? '') : htmlToText(docHtml(doc))
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

/** 文档内附件（富文本里以 attachment 节点内联，文末汇总展示） */
export function docAttachments(doc: Pick<DocRecord, 'attachments'>) {
  return doc.attachments ?? []
}
