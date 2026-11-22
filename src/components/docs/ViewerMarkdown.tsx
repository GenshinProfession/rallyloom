/* 文档中心 — Markdown / 富文本只读渲染
   办公桌面板（OfficeWorkPanel）与历史 markdown 文档共用。
   复用文档中心的排版样式（.doc-prose），保证与全页面阅读器一致。 */

import { useMemo } from 'react'
import type { DocFormat } from '@/lib/docs/types'
import { markdownToHtml } from '@/lib/docs/format'
import '@/components/docs/docs-editor.css'

export function ViewerMarkdown({ content, format = 'markdown' }: { content: string; format?: DocFormat }) {
  const html = useMemo(
    () => (format === 'rich' ? content : markdownToHtml(content ?? '')),
    [content, format],
  )
  return (
    <article
      className="doc-prose doc-viewer"
      data-doc-viewer={format}
      // 内容来自本项目文档库（可信来源），与全页面阅读器使用同一套渲染管线
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export default ViewerMarkdown
