/* 文档中心 — 代码块视图
   TipTap CodeBlockLowlight 的自定义 node view：语言选择 + 复制全文 + 语法高亮。 */

import { useEffect, useRef, useState } from 'react'
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { Check, Copy } from 'lucide-react'
import { CODE_LANGUAGES, languageLabel } from './languages'

export function CodeBlockView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const raw = typeof node.attrs.language === 'string' ? node.attrs.language : ''
  const language = languageLabel(raw)
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => () => { if (timer.current !== null) window.clearTimeout(timer.current) }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(node.textContent)
      setCopied(true)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1600)
    } catch { setCopied(false) }
  }

  return (
    <NodeViewWrapper as="div" className="doc-code" data-code-block="true" data-language={raw || 'plaintext'}>
      <div className="doc-code-bar" contentEditable={false}>
        <select
          className="doc-code-lang ui-press"
          aria-label="代码语言"
          value={raw || 'plaintext'}
          disabled={!editor.isEditable}
          onChange={(event) => updateAttributes({ language: event.target.value })}>
          {CODE_LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
        <button type="button" className="doc-code-copy ui-press" onClick={() => void copy()} aria-label="复制代码">
          {copied ? <Check className="size-3" strokeWidth={2} /> : <Copy className="size-3" strokeWidth={1.7} />}
          {copied ? '已复制' : '复制'}
        </button>
      </div>
      <div className="doc-code-pre"><NodeViewContent className="doc-code-body" /></div>
      <span className="sr-only">代码块 · {language}</span>
    </NodeViewWrapper>
  )
}

export default CodeBlockView
