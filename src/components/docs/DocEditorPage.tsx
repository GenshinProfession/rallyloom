/* 文档中心 — 全页面富文本编辑器（类钉钉文档）
   新建与编辑都进入独立页面（不再用弹窗）。能力：
   · 标题/正文、粗斜下删高亮行内代码、有序/无序/待办、引用、代码块（语言+复制）、表格、链接、图片
   · 正文中间插入任意类型附件（卡片化，可下载/移除）
   · `/` 唤起插入菜单；Ctrl+S 保存、Ctrl+Alt+1/2/3 标题、Ctrl+Shift+7/8 列表、Ctrl+K 链接
   · 右侧大纲目录 + 字数统计，左侧为一页到底的 A4 文档流 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor, JSONContent } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import {
  ArrowLeft, Check, ChevronRight, FileText, FolderInput, ImagePlus, Loader2, Paperclip, Save,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { DocDraft, DocRecord } from '@/lib/docs/types'
import { fileSize } from '@/lib/docs/types'
import { docHtml, textStats } from '@/lib/docs/format'
import { DocToolbar } from './DocToolbar'
import { docExtensions } from './editor/extensions'
import './docs-editor.css'

const MAX_FILE = 2 * 1024 * 1024

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('读取文件失败，请重试。'))
    reader.readAsDataURL(file)
  })
}

function collectAttachments(json: JSONContent) {
  const found: { id: string; name: string; size: number; mime: string; url: string }[] = []
  const walk = (node: JSONContent) => {
    if (node.type === 'attachment' && node.attrs) {
      found.push({
        id: String(node.attrs.id ?? ''),
        name: String(node.attrs.name ?? '附件'),
        size: Number(node.attrs.size ?? 0),
        mime: String(node.attrs.mime ?? 'application/octet-stream'),
        url: String(node.attrs.url ?? ''),
      })
    }
    node.content?.forEach(walk)
  }
  walk(json)
  return found
}

interface OutlineItem { level: number; text: string; pos: number }

function outlineOf(editor: Editor): OutlineItem[] {
  const items: OutlineItem[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return true
    const text = node.textContent.trim()
    if (text) items.push({ level: Number(node.attrs.level ?? 1), text, pos })
    return true
  })
  return items
}

interface SlashItem {
  id: string
  label: string
  hint: string
  keywords: string
  icon: LucideIcon
  run: (editor: Editor) => void
}

interface SlashState {
  open: boolean
  query: string
  from: number
  to: number
  left: number
  top: number
  active: number
}

const CLOSED_SLASH: SlashState = { open: false, query: '', from: 0, to: 0, left: 0, top: 0, active: 0 }

export interface DocEditorPageProps {
  doc: DocRecord | null
  records: readonly DocRecord[]
  location: readonly string[]
  onSave: (draft: DocDraft) => Promise<void>
  onCancel: () => void
}

export function DocEditorPage({ doc, records, location, onSave, onCancel }: DocEditorPageProps) {
  const spaces = Array.from(new Set(records.map((item) => item.space))).filter(Boolean)
  const defaultSpace = location[0] ?? spaces[0] ?? '制度规范'

  const [title, setTitle] = useState(doc?.title ?? '')
  const [space, setSpace] = useState(doc?.space ?? defaultSpace)
  const [folder, setFolder] = useState((doc?.folderPath ?? location.slice(1)).join(' / '))
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [stats, setStats] = useState({ chars: 0, words: 0, readMinutes: 1 })
  const [attachmentCount, setAttachmentCount] = useState(0)
  const [slash, setSlash] = useState<SlashState>(CLOSED_SLASH)

  const editorRef = useRef<Editor | null>(null)
  const slashRef = useRef<SlashState>(CLOSED_SLASH)
  const imageInput = useRef<HTMLInputElement | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)

  const updateSlash = useCallback((next: SlashState) => {
    slashRef.current = next
    setSlash(next)
  }, [])

  const refreshMeta = useCallback((instance: Editor) => {
    setOutline(outlineOf(instance))
    setStats(textStats(instance.getText()))
    setAttachmentCount(collectAttachments(instance.getJSON()).length)
  }, [])

  const refreshSlash = useCallback((instance: Editor) => {
    const { $from } = instance.state.selection
    if (!$from.parent.isTextblock) {
      if (slashRef.current.open) updateSlash(CLOSED_SLASH)
      return
    }
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\0')
    const match = /^\/([^\s]*)$/.exec(textBefore)
    if (!match) {
      if (slashRef.current.open) updateSlash(CLOSED_SLASH)
      return
    }
    const coords = instance.view.coordsAtPos($from.pos)
    updateSlash({
      open: true,
      query: match[1],
      from: $from.pos - textBefore.length,
      to: $from.pos,
      left: Math.min(coords.left, window.innerWidth - 300),
      top: Math.min(coords.bottom + 6, window.innerHeight - 340),
      active: 0,
    })
  }, [updateSlash])

  const saveRef = useRef<(() => void) | null>(null)
  const slashActionRef = useRef<{ run: (index: number) => void; move: (delta: number) => void; close: () => void }>({
    run: () => {}, move: () => {}, close: () => {},
  })

  const SaveShortcut = Extension.create({
    name: 'docSaveShortcut',
    addKeyboardShortcuts() {
      return { 'Mod-s': () => { saveRef.current?.(); return true } }
    },
  })

  const editor = useEditor({
    extensions: [...docExtensions({ placeholder: '输入正文，或输入 / 唤起插入菜单…' }), SaveShortcut],
    content: doc ? docHtml(doc) : '',
    editorProps: {
      attributes: { class: 'doc-prose', spellcheck: 'false' },
      handleKeyDown: (_view, event) => {
        const state = slashRef.current
        if (!state.open) return false
        if (event.key === 'ArrowDown') { slashActionRef.current.move(1); return true }
        if (event.key === 'ArrowUp') { slashActionRef.current.move(-1); return true }
        if (event.key === 'Enter') { slashActionRef.current.run(state.active); return true }
        if (event.key === 'Escape') { slashActionRef.current.close(); return true }
        return false
      },
    },
    onUpdate: ({ editor: instance }) => {
      setDirty(true)
      refreshMeta(instance)
      refreshSlash(instance)
    },
    onSelectionUpdate: ({ editor: instance }) => { refreshSlash(instance) },
  }, [])

  useEffect(() => {
    editorRef.current = editor
    if (editor) refreshMeta(editor)
  }, [editor, refreshMeta])

  useEffect(() => () => { editorRef.current = null }, [])

  const slashItems: SlashItem[] = [
    { id: 'h1', label: '一级标题', hint: '大标题', keywords: 'heading h1 标题', icon: FileText, run: (i) => { i.chain().focus().setHeading({ level: 1 }).run() } },
    { id: 'h2', label: '二级标题', hint: '章节标题', keywords: 'heading h2 标题', icon: FileText, run: (i) => { i.chain().focus().setHeading({ level: 2 }).run() } },
    { id: 'h3', label: '三级标题', hint: '小节标题', keywords: 'heading h3 标题', icon: FileText, run: (i) => { i.chain().focus().setHeading({ level: 3 }).run() } },
    { id: 'p', label: '正文段落', hint: '普通文本', keywords: 'paragraph text 段落 正文', icon: FileText, run: (i) => { i.chain().focus().setParagraph().run() } },
    { id: 'ul', label: '无序列表', hint: '项目符号', keywords: 'bullet list 列表', icon: FileText, run: (i) => { i.chain().focus().toggleBulletList().run() } },
    { id: 'ol', label: '有序列表', hint: '数字编号', keywords: 'ordered list 编号 列表', icon: FileText, run: (i) => { i.chain().focus().toggleOrderedList().run() } },
    { id: 'task', label: '待办清单', hint: '可勾选任务', keywords: 'todo task 待办 清单', icon: FileText, run: (i) => { i.chain().focus().toggleTaskList().run() } },
    { id: 'quote', label: '引用', hint: '引用段落', keywords: 'quote 引用', icon: FileText, run: (i) => { i.chain().focus().toggleBlockquote().run() } },
    { id: 'code', label: '代码块', hint: '带语法高亮', keywords: 'code 代码 代码块', icon: FileText, run: (i) => { i.chain().focus().toggleCodeBlock({ language: 'plaintext' }).run() } },
    { id: 'table', label: '表格', hint: '3 × 3 表格', keywords: 'table 表格', icon: FileText, run: (i) => { i.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() } },
    { id: 'image', label: '图片', hint: '插入本地图片', keywords: 'image 图片', icon: ImagePlus, run: () => { imageInput.current?.click() } },
    { id: 'file', label: '附件', hint: '任意类型文件', keywords: 'file attachment 附件 文件', icon: Paperclip, run: () => { fileInput.current?.click() } },
    { id: 'hr', label: '分割线', hint: '分隔内容', keywords: 'divider hr 分割线', icon: FileText, run: (i) => { i.chain().focus().setHorizontalRule().run() } },
  ]

  const filteredSlash = slash.open
    ? slashItems.filter((item) => {
      const query = slash.query.trim().toLowerCase()
      if (!query) return true
      return [item.label, item.hint, item.keywords].some((value) => value.toLowerCase().includes(query))
    })
    : []

  function closeSlash() {
    if (slashRef.current.open) updateSlash(CLOSED_SLASH)
  }

  function executeSlash(index: number) {
    const item = filteredSlash[index]
    const instance = editorRef.current
    if (!item || !instance) { closeSlash(); return }
    const range = { from: slashRef.current.from, to: slashRef.current.to }
    updateSlash(CLOSED_SLASH)
    instance.chain().focus().deleteRange(range).run()
    item.run(instance)
  }

  useEffect(() => {
    slashActionRef.current = {
      run: (index: number) => executeSlash(index),
      move: (delta: number) => {
        const state = slashRef.current
        const count = Math.max(1, filteredSlash.length)
        updateSlash({ ...state, active: (state.active + delta + count) % count })
      },
      close: closeSlash,
    }
  })

  useEffect(() => {
    const onScroll = () => closeSlash()
    window.addEventListener('resize', onScroll)
    return () => window.removeEventListener('resize', onScroll)
  })

  async function pickImage(file: File) {
    if (!file.type.startsWith('image/')) { setError('请选择图片文件。'); return }
    if (file.size > MAX_FILE) { setError('图片超过 2 MB：演示环境内联保存，正式环境由云端上传。'); return }
    try {
      const url = await readAsDataUrl(file)
      editorRef.current?.chain().focus().setImage({ src: url, alt: file.name }).run()
      setDirty(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '插入图片失败。')
    }
  }

  async function pickAttachment(file: File) {
    if (file.size > MAX_FILE) { setError('附件超过 2 MB：演示环境内联保存，正式环境由云端上传。'); return }
    try {
      const url = await readAsDataUrl(file)
      editorRef.current?.chain().focus().insertAttachment({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        mime: file.type || 'application/octet-stream',
        url,
      }).run()
      setDirty(true)
      setAttachmentCount((count) => count + 1)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '插入附件失败。')
    }
  }

  async function save() {
    const instance = editorRef.current
    if (!instance || saving) return
    const nextTitle = title.trim()
    if (!nextTitle) { setError('请先填写文档标题。'); return }
    const folderPath = folder.split('/').map((part) => part.trim()).filter(Boolean)
    const draft: DocDraft = {
      title: nextTitle,
      space: space.trim() || defaultSpace,
      folderPath,
      format: 'rich',
      content: instance.getHTML(),
      attachments: collectAttachments(instance.getJSON()),
    }
    setSaving(true)
    setError('')
    try {
      await onSave(draft)
      setDirty(false)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '保存失败，请重试。')
    } finally {
      setSaving(false)
    }
  }
  saveRef.current = () => { void save() }

  function cancel() {
    if (dirty && !window.confirm('还有未保存的修改，确定离开吗？')) return
    onCancel()
  }

  const path = [space, ...folder.split('/').map((part) => part.trim()).filter(Boolean)]

  return (
    <div className="doc-page" data-doc-editor="true">
      <header className="doc-page-top">
        <button type="button" className="doc-back ui-press" onClick={cancel} data-doc-back="true">
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
          {doc && <><ChevronRight className="size-3" aria-hidden /><span className="truncate text-foreground/70">{doc.title}</span></>}
        </nav>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {dirty ? <span className="doc-unsaved">未保存</span> : doc ? <><Check className="size-3 text-emerald-600" /> 已保存</> : '新文档'}
        </span>
        <Button type="button" size="sm" variant="outline" className="h-7" onClick={cancel} disabled={saving}>取消</Button>
        <Button type="button" size="sm" className="h-7" onClick={() => void save()} disabled={saving} data-doc-save="true">
          {saving ? <Loader2 className="animate-spin" /> : <Save />} 保存
        </Button>
      </header>

      <div className="doc-page-body">
        <main className="doc-editor-main">
          <div className="doc-paper">
          <div className="doc-editor-meta">
            <label className="doc-meta-field">
              <span>知识库</span>
              <Input list="doc-space-options" value={space} onChange={(event) => { setSpace(event.target.value); setDirty(true) }} className="h-7 w-[132px]" aria-label="知识库" />
            </label>
            <datalist id="doc-space-options">{spaces.map((name) => <option key={name} value={name} />)}</datalist>
            <label className="doc-meta-field">
              <span>文件夹</span>
              <span className="doc-meta-folder">
                <FolderInput className="size-3.5 text-muted-foreground" aria-hidden />
                <Input value={folder} onChange={(event) => { setFolder(event.target.value); setDirty(true) }} placeholder="例如：人事制度 / 员工手册" className="h-7 w-[220px] py-0" aria-label="文件夹路径" />
              </span>
            </label>
            <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
              <Badge variant="secondary" className="h-[18px] px-1.5 text-[10px]">富文本</Badge>
              <span className="tabular">{stats.words} 字</span>
              <span aria-hidden>·</span>
              <span className="tabular">约 {stats.readMinutes} 分钟</span>
              {attachmentCount > 0 && <><span aria-hidden>·</span><span>{attachmentCount} 个附件</span></>}
            </span>
          </div>

          <input
            className="doc-editor-title"
            value={title}
            autoFocus={!doc}
            onChange={(event) => { setTitle(event.target.value); setDirty(true) }}
            placeholder="无标题文档"
            aria-label="文档标题"
            data-doc-title="true" />

          <DocToolbar editor={editor} onImage={() => imageInput.current?.click()} onAttachment={() => fileInput.current?.click()} />

          <div className="doc-editor-scroll">
            <EditorContent editor={editor} className="doc-editor-content" />
          </div>

          <footer className="doc-editor-foot">
            <span>支持粘贴/拖拽图片，附件可任意类型；保存内容按 doc.upsert 契约承接。</span>
            <span className="doc-shortcuts">
              <kbd>Ctrl</kbd>+<kbd>S</kbd> 保存 · <kbd>/</kbd> 插入菜单 · <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>1/2/3</kbd> 标题
            </span>
          </footer>
          {error && <p role="alert" className="doc-editor-error">{error}</p>}
          </div>
        </main>

        <aside className="doc-outline" aria-label="文档大纲">
          <p className="doc-outline-title">大纲</p>
          {outline.length === 0
            ? <p className="doc-outline-empty">插入标题后自动生成目录</p>
            : <ol>
              {outline.map((item) => (
                <li key={`${item.pos}-${item.text}`}>
                  <button type="button" className={`doc-outline-item level-${item.level} ui-press`}
                    onClick={() => {
                      const instance = editorRef.current
                      if (!instance) return
                      instance.chain().focus().setTextSelection(item.pos + 1).scrollIntoView().run()
                    }}>
                    {item.text}
                  </button>
                </li>
              ))}
            </ol>}
        </aside>
      </div>

      {slash.open && (
        <div className="doc-slash" data-slash-menu="true" style={{ left: slash.left, top: slash.top }} role="listbox" aria-label="插入菜单">
          {filteredSlash.length === 0
            ? <p className="doc-slash-empty">没有匹配的命令</p>
            : filteredSlash.map((item, index) => (
              <button key={item.id} type="button" role="option" aria-selected={index === slash.active}
                className={`doc-slash-item ui-press${index === slash.active ? ' is-active' : ''}`}
                data-slash-item={item.id}
                onMouseEnter={() => updateSlash({ ...slashRef.current, active: index })}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => executeSlash(index)}>
                <item.icon className="size-3.5" strokeWidth={1.7} />
                <span className="doc-slash-label">{item.label}</span>
                <span className="doc-slash-hint">{item.hint}</span>
              </button>
            ))}
        </div>
      )}

      <input ref={imageInput} type="file" accept="image/*" hidden
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void pickImage(file) }} />
      <input ref={fileInput} type="file" hidden
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void pickAttachment(file) }} />
      {attachmentCount > 0 && <span className="sr-only" data-doc-attachments={attachmentCount}>{fileSize(attachmentCount)}</span>}
      {doc && <span className="sr-only" data-doc-origin={doc.origin}>{doc.origin}</span>}
    </div>
  )
}

export default DocEditorPage
