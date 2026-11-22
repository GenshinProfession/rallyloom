/* 文档中心 — 弹窗式富文本编辑器
   办公桌面板（OfficeWorkPanel）里的「新建文档 / 编辑文档」使用。
   文档中心的主入口已改为全页面编辑器（DocEditorPage），这里保持同一套
   TipTap 能力（标题/列表/代码块/表格/附件/链接），只是放在对话框内。 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Paperclip, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { fileSize, type DocAttachment, type DocDraft, type DocRecord } from '@/lib/docs/types'
import { docHtml } from '@/lib/docs/format'
import { DocToolbar } from './DocToolbar'
import { docExtensions } from './editor/extensions'
import './docs-editor.css'

export interface DocEditorDialogProps {
  /** null 表示新建 */
  doc: DocRecord | null
  records: readonly DocRecord[]
  /** 面包屑位置：空间 + 文件夹层级 */
  location: readonly string[]
  onClose: () => void
  onSave: (draft: DocDraft) => Promise<void>
}

const MAX_FILE = 2 * 1024 * 1024

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

export function DocEditorDialog({ doc, records, location, onClose, onSave }: DocEditorDialogProps) {
  const initialRevision = useRef(doc?.revision)
  const [title, setTitle] = useState(doc?.title ?? '')
  const [space, setSpace] = useState(doc?.space ?? location[0] ?? '制度规范')
  const [folder, setFolder] = useState((doc?.folderPath ?? location.slice(1)).join('/'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [images, setImages] = useState<string[]>([])
  const imageInput = useRef<HTMLInputElement | null>(null)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const [attachments, setAttachments] = useState<readonly DocAttachment[]>(doc?.attachments ?? [])

  const spaces = useMemo(() => {
    const set = new Set<string>(records.map((item) => item.space))
    for (const item of location) if (item) set.add(item)
    return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  }, [records, location])

  const editor = useEditor({
    extensions: docExtensions({ placeholder: '从这里开始写正文，输入 / 可唤出代码块、表格、附件…' }),
    content: doc ? docHtml(doc) : '',
    editorProps: { attributes: { class: 'doc-prose doc-dialog-prose' } },
  })

  useEffect(() => () => editor?.destroy(), [editor])

  function pickImage() {
    imageInput.current?.click()
  }

  function pickFile() {
    fileInput.current?.click()
  }

  async function onImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !editor) return
    if (file.size > MAX_FILE) {
      setError('演示环境单个文件上限 2 MB，正式环境由云端上传。')
      return
    }
    const url = await readAsDataUrl(file)
    setImages((prev) => [...prev, url])
    editor.chain().focus().setImage({ src: url, alt: file.name }).run()
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !editor) return
    if (file.size > MAX_FILE) {
      setError('演示环境单个附件上限 2 MB，正式环境由云端上传。')
      return
    }
    const url = await readAsDataUrl(file)
    const attachment: DocAttachment = {
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      mime: file.type || 'application/octet-stream',
      url,
    }
    setAttachments((prev) => [...prev, attachment])
    editor.chain().focus().insertAttachment(attachment).run()
  }

  async function save() {
    const nextTitle = title.trim()
    if (!nextTitle) {
      setError('请填写文档标题。')
      return
    }
    if (!space.trim()) {
      setError('请填写所属知识库。')
      return
    }
    if (!editor) return
    setSaving(true)
    setError(null)
    try {
      await onSave({
        revision: initialRevision.current,
        title: nextTitle,
        space: space.trim(),
        folderPath: folder.split('/').map((part) => part.trim()).filter(Boolean),
        format: 'rich',
        content: editor.getHTML(),
        attachments,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败，请重试。')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="doc-dialog max-h-[88vh] max-w-[980px] gap-0 overflow-hidden p-0">
        <DialogHeader className="doc-dialog-head">
          <DialogTitle className="doc-dialog-heading">{doc ? '编辑文档' : '新建文档'}</DialogTitle>
          <DialogDescription className="doc-dialog-sub">
            {[space, ...folder.split('/').filter(Boolean)].join(' / ') || '选择知识库后保存'}
          </DialogDescription>
        </DialogHeader>

        <div className="doc-dialog-body">
          <Input
            className="doc-dialog-title"
            data-doc-dialog-title
            placeholder="文档标题"
            value={title}
            autoFocus
            onChange={(event) => setTitle(event.target.value)} />

          <div className="doc-dialog-meta">
            <label className="doc-dialog-field">
              <span>知识库</span>
              <Input list="doc-dialog-spaces" value={space} onChange={(event) => setSpace(event.target.value)} />
              <datalist id="doc-dialog-spaces">
                {spaces.map((item) => <option key={item} value={item} />)}
              </datalist>
            </label>
            <label className="doc-dialog-field">
              <span>文件夹</span>
              <Input placeholder="可选，例如：运营 / 大促" value={folder} onChange={(event) => setFolder(event.target.value)} />
            </label>
          </div>

          <div className="doc-dialog-toolbar">
            <DocToolbar editor={editor} onImage={pickImage} onAttachment={pickFile} />
          </div>

          <div className="doc-dialog-scroll">
            <EditorContent editor={editor} />
            {!!images.length && <p className="doc-dialog-count">已插入 {images.length} 张图片</p>}
          </div>

          {error && <p className="doc-editor-error" role="alert">{error}</p>}

          <div className="doc-dialog-foot">
            <span className="doc-dialog-hint">
              支持全部文件类型附件（演示上限 2 MB / 个）
            </span>
            <div className="doc-dialog-actions">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>取消</Button>
              <Button size="sm" onClick={() => void save()} disabled={saving} data-doc-dialog-save>
                <Save className="size-3.5" />
                {saving ? '保存中…' : '保存'}
              </Button>
            </div>
          </div>
        </div>

        <input ref={imageInput} type="file" accept="image/*" className="sr-only" onChange={onImageChange} />
        <input ref={fileInput} type="file" className="sr-only" onChange={onFileChange} aria-label="插入附件" />
        <span className="sr-only">
          <Paperclip /> 附件数量 {attachments.length} · {attachments.map((item) => fileSize(item.size)).join('、')}
        </span>
      </DialogContent>
    </Dialog>
  )
}

export default DocEditorDialog
