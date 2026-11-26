/* 文档中心 — 富文本工具栏
   类钉钉文档：撤销重做 / 标题级别 / 行内样式 / 列表 / 引用 / 代码块 /
   链接 / 图片 / 附件 / 表格 / 分割线 / 对齐 / 清除格式。 */

import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Check, ChevronDown, Code2, Eraser, Heading1, Heading2, Heading3,
  Highlighter, ImagePlus, Italic, Link2, List, ListChecks, ListOrdered, Minus, Paperclip, Pilcrow, Quote,
  Redo2, SquareCode, Strikethrough, Table2, Trash2, Underline, Undo2, Unlink,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface ToolButtonProps {
  icon: LucideIcon
  label: string
  shortcut?: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}

function ToolButton({ icon: Icon, label, shortcut, active, disabled, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`doc-tool ui-press${active ? ' is-active' : ''}`}
      title={shortcut ? `${label}（${shortcut}）` : label}
      aria-label={label}
      aria-pressed={active || undefined}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}>
      <Icon className="size-3.5" strokeWidth={1.75} />
    </button>
  )
}

const HEADING_OPTIONS = [
  { level: 0, label: '正文' },
  { level: 1, label: '一级标题' },
  { level: 2, label: '二级标题' },
  { level: 3, label: '三级标题' },
] as const

function headingValue(editor: Editor): number {
  for (const level of [1, 2, 3] as const) if (editor.isActive('heading', { level })) return level
  return 0
}

function headingIcon(level: number): LucideIcon {
  if (level === 1) return Heading1
  if (level === 2) return Heading2
  if (level === 3) return Heading3
  return Pilcrow
}

export function DocToolbar({ editor, onImage, onAttachment }: {
  editor: Editor | null
  onImage: () => void
  onAttachment: () => void
}) {
  const [linkBar, setLinkBar] = useState(false)
  const [linkValue, setLinkValue] = useState('')
  const [menu, setMenu] = useState<'table' | 'heading' | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menu) return
    const close = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])

  if (!editor) return <div className="doc-toolbar doc-toolbar-skeleton" aria-hidden />

  const ed = editor
  const chain = () => ed.chain().focus()
  const heading = headingValue(ed)
  const inTable = ed.isActive('table')

  function openLinkBar() {
    const attrs = ed.getAttributes('link') as { href?: string }
    setLinkValue(typeof attrs.href === 'string' ? attrs.href : '')
    setLinkBar(true)
  }

  function applyLink() {
    const href = linkValue.trim()
    if (!href) return
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}`
    if (ed.state.selection.empty) {
      chain().insertContent({
        type: 'text',
        text: withProtocol,
        marks: [{ type: 'link', attrs: { href: withProtocol } }],
      }).run()
    } else {
      chain().extendMarkRange('link').setLink({ href: withProtocol }).run()
    }
    setLinkBar(false)
  }

  return (
    <div className="doc-toolbar" data-doc-toolbar="true" ref={wrapRef} role="toolbar" aria-label="格式工具栏">
      <ToolButton icon={Undo2} label="撤销" shortcut="Ctrl+Z" disabled={!editor.can().undo()} onClick={() => chain().undo().run()} />
      <ToolButton icon={Redo2} label="重做" shortcut="Ctrl+Shift+Z" disabled={!editor.can().redo()} onClick={() => chain().redo().run()} />
      <span className="doc-tool-sep" aria-hidden />

      <div className="doc-tool-dropdown">
        <button
          type="button"
          className={`doc-tool-select${menu === 'heading' ? ' is-open' : ''}`}
          aria-label="段落样式"
          aria-haspopup="menu"
          aria-expanded={menu === 'heading'}
          title="段落样式"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setMenu((current) => (current === 'heading' ? null : 'heading'))}>
          {(() => {
            const Icon = headingIcon(heading)
            return <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
          })()}
          <span>{HEADING_OPTIONS.find((option) => option.level === heading)?.label ?? '正文'}</span>
          <ChevronDown className={`size-3 doc-tool-select-caret${menu === 'heading' ? ' is-open' : ''}`} aria-hidden />
        </button>
        {menu === 'heading' && (
          <div className="doc-heading-menu" role="menu" aria-label="段落样式">
            {HEADING_OPTIONS.map((option) => {
              const Icon = headingIcon(option.level)
              const active = option.level === heading
              return (
                <button
                  key={option.level}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  className={`doc-heading-item${active ? ' is-active' : ''}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (option.level === 0) chain().setParagraph().run()
                    else chain().setHeading({ level: option.level as 1 | 2 | 3 }).run()
                    setMenu(null)
                  }}>
                  <Icon className="size-3.5" strokeWidth={1.75} aria-hidden />
                  <span>{option.label}</span>
                  <span className="doc-heading-tag">{option.level === 0 ? 'P' : `H${option.level}`}</span>
                  {active && <Check className="size-3 doc-heading-check" strokeWidth={2.6} aria-hidden />}
                </button>
              )
            })}
          </div>
        )}
      </div>
      <span className="doc-tool-sep" aria-hidden />

      <ToolButton icon={Bold} label="加粗" shortcut="Ctrl+B" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()} />
      <ToolButton icon={Italic} label="斜体" shortcut="Ctrl+I" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()} />
      <ToolButton icon={Underline} label="下划线" shortcut="Ctrl+U" active={editor.isActive('underline')} onClick={() => chain().toggleUnderline().run()} />
      <ToolButton icon={Strikethrough} label="删除线" active={editor.isActive('strike')} onClick={() => chain().toggleStrike().run()} />
      <ToolButton icon={Highlighter} label="高亮" active={editor.isActive('highlight')} onClick={() => chain().toggleHighlight().run()} />
      <ToolButton icon={Code2} label="行内代码" shortcut="Ctrl+E" active={editor.isActive('code')} onClick={() => chain().toggleCode().run()} />
      <span className="doc-tool-sep" aria-hidden />

      <ToolButton icon={List} label="无序列表" shortcut="Ctrl+Shift+8" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()} />
      <ToolButton icon={ListOrdered} label="有序列表" shortcut="Ctrl+Shift+7" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()} />
      <ToolButton icon={ListChecks} label="待办清单" shortcut="Ctrl+Shift+9" active={editor.isActive('taskList')} onClick={() => chain().toggleTaskList().run()} />
      <ToolButton icon={Quote} label="引用" shortcut="Ctrl+Shift+B" active={editor.isActive('blockquote')} onClick={() => chain().toggleBlockquote().run()} />
      <ToolButton icon={SquareCode} label="代码块" shortcut="Ctrl+Alt+C" active={editor.isActive('codeBlock')}
        onClick={() => chain().toggleCodeBlock({ language: 'plaintext' }).run()} />
      <span className="doc-tool-sep" aria-hidden />

      {linkBar ? (
        <span className="doc-link-bar">
          <Link2 className="size-3.5 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <input
            autoFocus
            className="doc-link-input"
            placeholder="粘贴链接后回车"
            aria-label="链接地址"
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); applyLink() }
              if (event.key === 'Escape') setLinkBar(false)
            }} />
          <button type="button" className="doc-link-confirm ui-press" onClick={applyLink}>确定</button>
        </span>
      ) : (
        <ToolButton icon={Link2} label="链接" shortcut="Ctrl+K" active={editor.isActive('link')} onClick={openLinkBar} />
      )}
      <ToolButton icon={Unlink} label="取消链接" disabled={!editor.isActive('link')} onClick={() => chain().unsetLink().run()} />
      <ToolButton icon={ImagePlus} label="插入图片" onClick={onImage} />
      <ToolButton icon={Paperclip} label="插入附件（任意类型）" onClick={onAttachment} />

      <span className="doc-tool-relative">
        <ToolButton icon={Table2} label="表格" active={inTable} onClick={() => setMenu(menu === 'table' ? null : 'table')} />
        {menu === 'table' && (
          <span className="doc-pop" role="menu">
            <button type="button" className="doc-pop-item" onClick={() => { chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); setMenu(null) }}>插入 3 × 3 表格</button>
            <button type="button" className="doc-pop-item" disabled={!inTable} onClick={() => { chain().addRowAfter().run(); setMenu(null) }}>下方插入行</button>
            <button type="button" className="doc-pop-item" disabled={!inTable} onClick={() => { chain().addColumnAfter().run(); setMenu(null) }}>右侧插入列</button>
            <button type="button" className="doc-pop-item" disabled={!inTable} onClick={() => { chain().deleteRow().run(); setMenu(null) }}>删除当前行</button>
            <button type="button" className="doc-pop-item" disabled={!inTable} onClick={() => { chain().deleteColumn().run(); setMenu(null) }}>删除当前列</button>
            <button type="button" className="doc-pop-item doc-pop-danger" disabled={!inTable} onClick={() => { chain().deleteTable().run(); setMenu(null) }}>
              <Trash2 className="size-3" strokeWidth={1.75} /> 删除表格
            </button>
          </span>
        )}
      </span>
      <ToolButton icon={Minus} label="分割线" onClick={() => chain().setHorizontalRule().run()} />
      <span className="doc-tool-sep" aria-hidden />

      <ToolButton icon={AlignLeft} label="左对齐" active={editor.isActive({ textAlign: 'left' })} onClick={() => chain().setTextAlign('left').run()} />
      <ToolButton icon={AlignCenter} label="居中" active={editor.isActive({ textAlign: 'center' })} onClick={() => chain().setTextAlign('center').run()} />
      <ToolButton icon={AlignRight} label="右对齐" active={editor.isActive({ textAlign: 'right' })} onClick={() => chain().setTextAlign('right').run()} />
      <span className="doc-tool-sep" aria-hidden />
      <ToolButton icon={Eraser} label="清除格式" onClick={() => chain().unsetAllMarks().clearNodes().run()} />
    </div>
  )
}
