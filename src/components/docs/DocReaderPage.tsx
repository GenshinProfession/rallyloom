import type { ReactNode } from 'react'
/* 文档中心 — 全页面阅读器
   只读 TipTap 渲染（与编辑器同一套 node/mark），代码块带语法高亮与复制，
   正文中的附件卡片可直接下载，右侧为文档大纲。 */

import { useEffect, useMemo, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import {
  ArrowLeft, Check, ChevronRight, Copy, Download, ExternalLink, FileText, PencilLine, Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { attachmentUrl, docTime, documentUrl, fileSize, type DocRecord } from '@/lib/docs/types'
import { docHtml, textStats } from '@/lib/docs/format'
import { attachmentKind } from './editor/attachment-node'
import { docExtensions } from './editor/extensions'
import './docs-editor.css'

interface OutlineItem { level: number; text: string }

function cancelOutline(editor: Editor | null) {
  if (!editor) return [] as OutlineItem[]
  const items: OutlineItem[] = []
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'heading') {
      const text = node.textContent.trim()
      if (text) items.push({ level: Number(node.attrs.level ?? 1), text })
    }
    return true
  })
  return items
}

function LinkDocView({ doc }: { doc: DocRecord }) {
  const [copy, setCopy] = useState<'idle' | 'done' | 'error'>('idle')
  const url = documentUrl(doc.url)
  return (
    <div className="doc-link-card">
      <div className="doc-link-icon"><ExternalLink className="size-4" strokeWidth={1.7} /></div>
      <p className="doc-link-title">外部文档</p>
      <p className="doc-link-url">{doc.url}</p>
      {url ? (
        <div className="doc-link-actions">
          <Button asChild size="sm"><a href={url} target="_blank" rel="noreferrer"><ExternalLink /> 打开文档</a></Button>
          <Button type="button" size="sm" variant="outline" onClick={async () => {
            try { await navigator.clipboard.writeText(url); setCopy('done') } catch { setCopy('error') }
          }}>
            {copy === 'done' ? <Check className="text-emerald-600" /> : <Copy />}{copy === 'done' ? '已复制链接' : '复制链接'}
          </Button>
        </div>
      ) : <p className="doc-link-invalid">当前文档链接无效。</p>}
      {copy === 'error' && <p role="status" className="doc-link-invalid">无法复制，可选中上方链接手动复制。</p>}
    </div>
  )
}

export interface DocReaderPageProps {
  doc: DocRecord
  canEdit: boolean
  onEdit: () => void
  onDelete: () => void
  toolbarActions?: ReactNode
  onBack: () => void
}

export function DocReaderPage({ doc, canEdit, onEdit, onDelete, onBack, toolbarActions }: DocReaderPageProps) {
  const html = useMemo(() => docHtml(doc), [doc])
  const stats = useMemo(() => textStats(doc.format === 'link' ? (doc.url ?? '') : html.replace(/<[^>]+>/g, ' ')), [doc, html])
  const [outline, setOutline] = useState<OutlineItem[]>([])

  const editor = useEditor({
    extensions: docExtensions(),
    content: html,
    editable: false,
    editorProps: { attributes: { class: 'doc-prose', spellcheck: 'false' } },
  }, [doc.id, html])

  useEffect(() => {
    if (editor) setOutline(cancelOutline(editor))
  }, [editor])

  const path = [doc.space, ...(doc.folderPath ?? [])]

  return (
    <div className="doc-page" data-doc-reader="true">
      <header className="doc-page-top">
        <button type="button" className="doc-back ui-press" onClick={onBack} data-doc-back="true">
          <ArrowLeft className="size-3.5" strokeWidth={1.8} />
          文档中心
        </button>
        <nav aria-label="文档路径" className="doc-breadcrumb">
          {path.map((part, index) => (
            <span key={`${part}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="size-3" aria-hidden />}
              {part}
            </span>
          ))}
          <ChevronRight className="size-3" aria-hidden />
          <span className="truncate text-foreground/70">{doc.title}</span>
        </nav>
        <span className="ml-auto flex items-center gap-1.5">
          {doc.origin === 'sync' && (
            <Badge variant="secondary" className="h-[18px] bg-indigo-50 px-1.5 text-[10px] text-indigo-700">外部 · {doc.sourceId}</Badge>
          )}
          {Object.entries(doc.attrs ?? {}).slice(0, 3).map(([key, value]) => (
            <Badge key={key} variant="secondary" className="h-[18px] px-1.5 text-[10px] text-muted-foreground">{key} · {value}</Badge>
          ))}
        </span>
        {canEdit && doc.origin === 'local' && (
          <div className="flex items-center gap-1">
            <Button type="button" size="sm" variant="outline" className="h-7" onClick={onEdit} data-doc-edit="true">
              <PencilLine /> 编辑
            </Button>
            <Button type="button" size="icon" variant="ghost" className="size-7 text-muted-foreground hover:text-destructive"
              aria-label="删除文档" title="删除文档" onClick={onDelete} data-doc-delete="true">
              <Trash2 />
            </Button>
          </div>
        )}
        {toolbarActions}
      </header>

      <div className="doc-page-body doc-reader-body">
        <main className="doc-reader-main" role="article">
          <div className="doc-paper doc-reader-paper">
          <h1 className="doc-reader-title">{doc.title}</h1>
          <p className="doc-reader-meta">
            <span>{doc.ownerName ?? '未署名'}</span>
            <span aria-hidden>·</span>
            <span className="tabular">更新于 {docTime(doc.updatedAt)}</span>
            <span aria-hidden>·</span>
            <span className="tabular">{stats.words} 字</span>
            <span aria-hidden>·</span>
            <span>约 {stats.readMinutes} 分钟</span>
            {(doc.attachments?.length ?? 0) > 0 && <><span aria-hidden>·</span><span>{doc.attachments?.length} 个附件</span></>}
          </p>

          {doc.format === 'link'
            ? <LinkDocView doc={doc} />
            : <EditorContent editor={editor} className="doc-reader-content" />}

          {doc.attachments && doc.attachments.length > 0 && (
            <section className="doc-attach-list" aria-label="文档附件">
              <h2 className="doc-section-title">附件 <span>{doc.attachments.length}</span></h2>
              <ul>
                {doc.attachments.map((file) => {
                  const kind = attachmentKind(file.mime, file.name)
                  return (
                    <li key={file.id || file.name} className="doc-attach-item">
                      <span className={`doc-attach-icon ${kind.tone}`} aria-hidden><kind.Icon className="size-4" strokeWidth={1.7} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="doc-attach-name" title={file.name}>{file.name}</span>
                        <span className="doc-attach-meta">{kind.label} · {fileSize(file.size)}</span>
                      </span>
                      <a className="doc-attach-action ui-press" href={attachmentUrl(file.url) ?? undefined} download={file.name}>
                        <Download className="size-3.5" strokeWidth={1.7} /> 下载
                      </a>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
          </div>
        </main>

        <aside className="doc-outline" aria-label="文档大纲">
          <p className="doc-outline-title">大纲</p>
          {outline.length === 0
            ? <p className="doc-outline-empty"><FileText className="size-3.5" strokeWidth={1.7} /> 本文暂无标题</p>
            : <ol>
              {outline.map((item, index) => (
                <li key={`${index}-${item.text}`}>
                  <button type="button" className={`doc-outline-item level-${item.level} ui-press`}
                    onClick={() => {
                      const blocks = editor?.view.dom.querySelectorAll('h1, h2, h3')
                      blocks?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }}>
                    {item.text}
                  </button>
                </li>
              ))}
            </ol>}
        </aside>
      </div>
    </div>
  )
}

export default DocReaderPage
