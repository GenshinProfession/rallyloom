/* 文档中心 — 附件节点
   正文中间可插入任意类型文件（PDF / 表格 / 压缩包 / 音视频 / 代码包…）。
   演示环境把文件读成 data: URL 内联保存；正式部署由云端上传后换成 https 地址。
   存储格式与《接入规范》doc.upsert 的 attachments 字段一致。 */

import { Node, mergeAttributes } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from '@tiptap/react'
import {
  FileArchive, FileAudio, FileCode2, FileImage, FileSpreadsheet, FileText, FileVideo, Trash2,
} from 'lucide-react'
import { fileSize, type DocAttachment } from '@/lib/docs/types'

export interface AttachmentOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    attachment: {
      /** 在当前光标位置插入一个附件卡片 */
      insertAttachment: (attachment: DocAttachment) => ReturnType
    }
  }
}

export function attachmentKind(mime: string, name: string): { label: string; Icon: typeof FileText; tone: string } {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) {
    return { label: '图片', Icon: FileImage, tone: 'text-[#c2410c] bg-[#fff1e7]' }
  }
  if (mime.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv', 'avi'].includes(ext)) {
    return { label: '视频', Icon: FileVideo, tone: 'text-[#6d28d9] bg-[#f3ecff]' }
  }
  if (mime.startsWith('audio/') || ['mp3', 'wav', 'flac', 'm4a', 'ogg'].includes(ext)) {
    return { label: '音频', Icon: FileAudio, tone: 'text-[#0f766e] bg-[#e6f7f4]' }
  }
  if (ext === 'pdf' || mime === 'application/pdf') {
    return { label: 'PDF', Icon: FileText, tone: 'text-[#b91c1c] bg-[#fdecec]' }
  }
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext) || mime.includes('spreadsheet') || mime.includes('csv')) {
    return { label: '表格', Icon: FileSpreadsheet, tone: 'text-[#15803d] bg-[#eaf7ee]' }
  }
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext) || mime.includes('zip')) {
    return { label: '压缩包', Icon: FileArchive, tone: 'text-[#92400e] bg-[#fdf3e3]' }
  }
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'rs', 'sql', 'sh', 'json', 'yml', 'yaml'].includes(ext)) {
    return { label: '代码', Icon: FileCode2, tone: 'text-[#1d4ed8] bg-[#eaf1fe]' }
  }
  return { label: '文件', Icon: FileText, tone: 'text-[#475569] bg-[#eef1f5]' }
}

function AttachmentView({ node, deleteNode, editor }: ReactNodeViewProps) {
  const attrs = node.attrs as Partial<DocAttachment>
  const name = attrs.name || '附件'
  const size = Number(attrs.size ?? 0)
  const mime = attrs.mime || 'application/octet-stream'
  const url = attrs.url || ''
  const { label, Icon, tone } = attachmentKind(mime, name)
  return (
    <NodeViewWrapper as="div" className="doc-attach" data-attachment-card="true" data-attachment-name={name}>
      <span className={`doc-attach-icon ${tone}`} aria-hidden>
        <Icon className="size-4" strokeWidth={1.7} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="doc-attach-name" title={name}>{name}</span>
        <span className="doc-attach-meta">{label} · {fileSize(size)}</span>
      </span>
      {url && <a className="doc-attach-action ui-press" href={url} download={name} contentEditable={false}>下载</a>}
      {editor.isEditable && (
        <button type="button" className="doc-attach-remove ui-press" contentEditable={false}
          aria-label={`移除附件 ${name}`} title="移除附件" onClick={() => deleteNode()}>
          <Trash2 className="size-3.5" strokeWidth={1.7} />
        </button>
      )}
    </NodeViewWrapper>
  )
}

export const AttachmentNode = Node.create<AttachmentOptions>({
  name: 'attachment',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      id: { default: null },
      name: { default: '附件' },
      size: { default: 0 },
      mime: { default: 'application/octet-stream' },
      url: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-attachment]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { 'data-attachment': '' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentView)
  },

  addCommands() {
    return {
      insertAttachment: (attachment) => ({ commands }) => commands.insertContent({
        type: this.name,
        attrs: {
          id: attachment.id,
          name: attachment.name,
          size: attachment.size,
          mime: attachment.mime,
          url: attachment.url,
        },
      }),
    }
  },
})
