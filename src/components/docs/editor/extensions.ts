/* 文档中心 — 编辑器扩展集
   阅读器（只读）与编辑器共用同一套 node/mark，保证「看到的 = 编辑的」。 */

import type { AnyExtension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table/kit'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Image from '@tiptap/extension-image'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { AttachmentNode } from './attachment-node'
import { CodeBlockView } from './CodeBlockView'
import { LOWLIGHT } from './languages'

const CodeBlockWithBar = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView)
  },
}).configure({ lowlight: LOWLIGHT })

export interface DocProseOptions {
  /** 只读阅读器不需要占位文案 */
  placeholder?: string
}

export function docExtensions({ placeholder }: DocProseOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({
      codeBlock: false,
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    CodeBlockWithBar,
    TableKit.configure({ table: { resizable: false } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Image.configure({ allowBase64: true, inline: false }),
    Highlight,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    AttachmentNode,
    ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
    CharacterCount,
  ]
}

export const DOC_EDITOR_PROSE_CLASS = 'doc-prose'
