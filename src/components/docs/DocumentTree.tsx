import { useEffect, useId, useMemo, useState } from 'react'
import { BookOpen, ChevronRight, ExternalLink, FileText, Folder, FolderOpen } from 'lucide-react'
import type { DocRecord } from '@/lib/docs/types'
import './docs-tree.css'

interface FolderNode {
  path: string[]
  count: number
  folders: Map<string, FolderNode>
  documents: DocRecord[]
}

export function documentPath(doc: DocRecord) {
  return [doc.space?.trim() || '未分组', ...(doc.folderPath ?? []).map((part) => part.trim()).filter(Boolean)]
}

function folderTree(docs: readonly DocRecord[]) {
  const root: FolderNode = { path: [], count: 0, folders: new Map(), documents: [] }
  const ordered = [...docs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title, 'zh-CN'))
  for (const doc of ordered) {
    let parent = root
    for (const name of documentPath(doc)) {
      let next = parent.folders.get(name)
      if (!next) {
        next = { path: [...parent.path, name], count: 0, folders: new Map(), documents: [] }
        parent.folders.set(name, next)
      }
      next.count++
      parent = next
    }
    parent.documents.push(doc)
  }
  return root.folders
}

interface BranchProps {
  node: FolderNode
  expanded: Readonly<Record<string, boolean>>
  searching: boolean
  selected: DocRecord | null
  selectedPath: readonly string[]
  onToggle: (key: string, open: boolean) => void
  onSelect: (id: string) => void
}

function Branch(props: BranchProps) {
  const { node, expanded, searching, selected, selectedPath, onToggle, onSelect } = props
  const listId = useId()
  const key = JSON.stringify(node.path)
  const space = node.path.length === 1
  const name = node.path[node.path.length - 1]
  const inPath = node.path.every((part, index) => part === selectedPath[index])
  const open = searching || (expanded[key] ?? (space || inPath))
  const Icon = space ? BookOpen : open ? FolderOpen : Folder
  return (
    <li>
      <button type="button" className="docs-folder ui-press" data-doc-folder={name} data-space={space ? name : undefined}
        title={name} aria-expanded={open} aria-controls={listId} disabled={searching} onClick={() => onToggle(key, !open)}
      >
        <ChevronRight className="docs-folder-chevron" size={13} aria-hidden />
        <Icon size={14} strokeWidth={1.7} aria-hidden />
        <span>{name}</span>
        <small aria-label={`${node.count} 篇文档`}>{node.count}</small>
      </button>
      <ul className="docs-folder-children" id={listId} hidden={!open}>
        {open && [...node.folders].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([label, child]) =>
          <Branch key={label} {...props} node={child} />,
        )}
        {open && node.documents.map((doc) => (
          <li key={doc.id}>
            <button type="button" data-doc-id={doc.id} className="docs-leaf ui-press" title={doc.title}
              aria-current={doc.id === selected?.id || undefined} onClick={() => onSelect(doc.id)}
            >
              <FileText size={14} strokeWidth={1.7} aria-hidden />
              <span>{doc.title}</span>
              {doc.format === 'link' && <ExternalLink size={12} aria-label="外链文档" />}
            </button>
          </li>
        ))}
      </ul>
    </li>
  )
}

export function DocumentTree({ records, query, selected, onSelect }: {
  records: readonly DocRecord[]
  query: string
  selected: DocRecord | null
  onSelect: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const q = query.trim().toLocaleLowerCase()
  const folders = useMemo(() => folderTree(q ? records.filter((doc) =>
    [doc.title, doc.ownerName ?? '', ...documentPath(doc), ...Object.values(doc.attrs ?? {})]
      .some((value) => value.toLocaleLowerCase().includes(q)),
  ) : records), [records, q])
  const selectedPath = selected ? documentPath(selected) : []
  const selectedKey = JSON.stringify(selectedPath)

  useEffect(() => {
    const path = JSON.parse(selectedKey) as string[]
    setExpanded((previous) => ({ ...previous, ...Object.fromEntries(path.map((_, index) => [JSON.stringify(path.slice(0, index + 1)), true])) }))
  }, [selectedKey])

  return (
    <nav className="docs-tree" aria-label="文档目录">
      {folders.size === 0 ? <p className="docs-tree-empty">{q ? '没有匹配的文档' : '暂无文档'}</p> : (
        <ul>{[...folders].sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([name, node]) => (
          <Branch
            key={name}
            node={node}
            selected={selected}
            selectedPath={selectedPath}
            expanded={expanded}
            searching={Boolean(q)}
            onToggle={(key, open) => setExpanded((current) => ({ ...current, [key]: open }))}
            onSelect={onSelect}
          />
        ))}</ul>
      )}
    </nav>
  )
}
