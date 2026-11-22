/* Document tree stays mounted alongside the reader/editor; fullscreen only expands the right pane. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronRight, ExternalLink, FilePlus2, FileText, Paperclip, Search, Maximize2, Minimize2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { DocClient, DocDraft, DocRecord } from '@/lib/docs/types'
import { docTime } from '@/lib/docs/types'
import { docExcerpt } from '@/lib/docs/format'
import { DocumentTree, documentPath } from './DocumentTree'
import { DocEditorPage } from './DocEditorPage'
import { DocReaderPage } from './DocReaderPage'

interface DocsPageProps { client: DocClient }

type ViewState =
  | { kind: 'list' }
  | { kind: 'read'; id: string }
  | { kind: 'edit'; doc: DocRecord | null; location: readonly string[] }

function DocCard({ doc, onOpen }: { doc: DocRecord; onOpen: () => void }) {
  const path = documentPath(doc)
  const excerpt = docExcerpt(doc)
  return (
    <button type="button" className="doc-card ui-press" onClick={onOpen} data-doc-row={doc.id}>
      <span className={`doc-card-icon${doc.format === 'link' ? ' is-link' : ''}`} aria-hidden>
        {doc.format === 'link' ? <ExternalLink className="size-4" strokeWidth={1.7} /> : <FileText className="size-4" strokeWidth={1.7} />}
      </span>
      <span className="doc-card-body">
        <span className="doc-card-title">
          {doc.title}
          {doc.origin === 'sync' && <Badge variant="secondary" className="h-[17px] bg-indigo-50 px-1.5 text-[10px] text-indigo-700">外部 · {doc.sourceId}</Badge>}
          {(doc.attachments?.length ?? 0) > 0 && (
            <span className="doc-card-attach"><Paperclip className="size-3" strokeWidth={1.7} />{doc.attachments?.length}</span>
          )}
        </span>
        <span className="doc-card-path">
          {path.map((part, index) => (
            <span key={`${part}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="size-2.5" aria-hidden />}
              {part}
            </span>
          ))}
        </span>
        {excerpt && <span className="doc-card-excerpt">{excerpt}</span>}
        <span className="doc-card-meta">
          <span>{doc.ownerName ?? '未署名'}</span>
          <span aria-hidden>·</span>
          <span className="tabular">更新于 {docTime(doc.updatedAt)}</span>
          {Object.entries(doc.attrs ?? {}).slice(0, 2).map(([key, value]) => (
            <Badge key={key} variant="secondary" className="h-[17px] px-1.5 text-[10px] text-muted-foreground">{key} · {value}</Badge>
          ))}
        </span>
      </span>
    </button>
  )
}

export function DocsPage({ client }: DocsPageProps) {
  const [records, setRecords] = useState<DocRecord[]>([])
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>('loading')
  const [view, setView] = useState<ViewState>({ kind: 'list' })
  const [fullscreen, setFullscreen] = useState(false)
  const [editorEpoch, setEditorEpoch] = useState(0)
  const [editorDirty, setEditorDirty] = useState(false)
  const changeView = (next: ViewState) => {
    if (editorDirty && !window.confirm('还有未保存的修改，确定离开吗？')) return false
    setEditorDirty(false)
    if (next.kind === 'edit') setEditorEpoch((epoch) => epoch + 1)
    setView(next)
    return true
  }
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<DocRecord | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')

  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [])

  useEffect(() => {
    let alive = true
    const apply = (list: DocRecord[]) => { if (alive) { setRecords(list); setLoad('ready') } }
    void client.list().then(apply, () => { if (alive) setLoad('error') })
    const off = client.subscribe(apply)
    return () => { alive = false; off() }
  }, [client])

  const spaces = useMemo(() => {
    const map = new Map<string, DocRecord[]>()
    for (const doc of records) {
      const key = documentPath(doc)[0]
      const bucket = map.get(key)
      if (bucket) bucket.push(doc)
      else map.set(key, [doc])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
  }, [records])

  const q = query.trim().toLocaleLowerCase()
  const matches = useCallback((doc: DocRecord) => {
    if (!q) return true
    return [doc.title, doc.ownerName ?? '', ...documentPath(doc), ...Object.values(doc.attrs ?? {}), docExcerpt(doc, 400)]
      .some((value) => value.toLocaleLowerCase().includes(q))
  }, [q])

  const visibleSpaces = spaces
    .map(([space, docs]) => [space, docs.filter(matches)] as const)
    .filter(([, docs]) => docs.length > 0)

  const current = view.kind === 'read' ? records.find((doc) => doc.id === view.id) ?? null : null
  const selected = records.find((doc) => doc.id === selectedId) ?? null

  async function save(draft: DocDraft) {
    if (view.kind !== 'edit') return
    const saved = view.doc ? await client.update(view.doc.id, draft) : await client.create(draft)
    setQuery('')
    setSelectedId(saved.id)
    setView({ kind: 'read', id: saved.id })
  }

  async function remove() {
    if (!deleting || removing) return
    setRemoving(true)
    setRemoveError('')
    try {
      await client.remove(deleting.id)
      setDeleting(null)
      if (view.kind === 'read' && view.id === deleting.id) setView({ kind: 'list' })
    } catch (failure) {
      setRemoveError(failure instanceof Error ? failure.message : '删除失败，请重试。')
    } finally { setRemoving(false) }
  }

  return (
    <main data-docs="root" className="flex min-w-0 flex-1 flex-col bg-[#f4f4f6]">
      <header className="workspace-header border-b border-border/70 bg-white">
        <h1 className="text-ui-title font-semibold">文档中心</h1>
        <span className="text-ui-label text-muted-foreground">
          {load === 'ready' ? `${spaces.length} 个知识库 · ${records.length} 篇文档` : client.label}
        </span>
        <Button size="sm" className="ml-auto h-7 text-ui-label" disabled={load !== 'ready'}
          data-doc-new="true"
          onClick={() => changeView({ kind: 'edit', doc: null, location: selected ? documentPath(selected) : [] })}>
          <FilePlus2 /> 新建文档
        </Button>
      </header>

      <div className="workspace-content flex min-h-0 flex-1 gap-3 py-3">
        <section className="flex w-[278px] shrink-0 flex-col overflow-hidden rounded-lg border border-border/80 bg-[#fbfcfd]">
          <div className="shrink-0 border-b border-border/70 px-3 pb-2 pt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} type="search"
                placeholder="搜索文档或文件夹" aria-label="搜索文档" className="h-8 border-border/70 bg-white pl-8" />
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1 px-2 pb-2 [&>[data-radix-scroll-area-viewport]>div]:!block">
            <DocumentTree records={records} query={query} selected={selected}
              onSelect={(id) => { if (changeView({ kind: 'read', id })) setSelectedId(id) }} />
          </ScrollArea>
        </section>

        <section data-doc-pane data-fullscreen={fullscreen || undefined} className={fullscreen ? 'fixed inset-x-0 bottom-0 top-8 z-40 flex min-h-0 flex-col bg-white' : 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-white'}>
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
            <span className="text-ui-label text-muted-foreground">{view.kind === 'edit' ? '编辑文档' : current ? '阅读文档' : '全部文档'}</span>
            <Button variant="ghost" size="sm" aria-label={fullscreen ? '退出全屏' : '全屏文档'} aria-pressed={fullscreen} onClick={() => setFullscreen(!fullscreen)}>
              {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}{fullscreen ? '退出全屏' : '全屏'}
            </Button>
          </div>
          {view.kind === 'edit' ? <DocEditorPage key={`${view.doc?.id ?? 'new'}-${editorEpoch}`} doc={view.doc} records={records} location={view.location}
            onDirtyChange={setEditorDirty} onSave={async (draft) => { await save(draft); setEditorDirty(false) }}
            onCancel={() => { setEditorDirty(false); setView(view.doc ? { kind: 'read', id: view.doc.id } : { kind: 'list' }) }} />
            : current ? <DocReaderPage doc={current} canEdit={current.canEdit !== false} onEdit={() => changeView({ kind: 'edit', doc: current, location: documentPath(current) })}
              onDelete={() => { setRemoveError(''); setDeleting(current) }} onBack={() => changeView({ kind: 'list' })} /> : <>

          <header className="doc-list-head">
            <span className="doc-list-title">全部文档</span>
            <span className="text-[11px] text-muted-foreground">{q ? `匹配 ${visibleSpaces.reduce((sum, [, docs]) => sum + docs.length, 0)} 篇` : `${records.length} 篇`}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">点击左侧文档，可在右侧快速切换阅读</span>
          </header>
          <ScrollArea className="min-h-0 flex-1 [&>[data-radix-scroll-area-viewport]>div]:!block">
            <div className="doc-list-body">
              {load === 'error' && <p className="doc-list-empty">暂时无法读取文档。</p>}
              {load === 'loading' && <p className="doc-list-empty">正在加载文档…</p>}
              {load === 'ready' && visibleSpaces.length === 0 && (
                <p className="doc-list-empty">{q ? '没有匹配的文档。' : '还没有文档，点击「新建文档」开始写作。'}</p>
              )}
              {visibleSpaces.map(([space, docs]) => (
                <section key={space} className="doc-list-group" data-doc-space={space}>
                  <h2 className="doc-list-space">{space}<span>{docs.length}</span></h2>
                  <div className="doc-list-cards">
                    {docs.map((doc) => (
                      <DocCard key={doc.id} doc={doc}
                        onOpen={() => { setSelectedId(doc.id); setView({ kind: 'read', id: doc.id }) }} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </ScrollArea>
          </>}
        </section>
      </div>

      {deleting && <DeleteDialog doc={deleting} removing={removing} error={removeError}
        onClose={() => { if (!removing) setDeleting(null) }} onConfirm={() => void remove()} />}
    </main>
  )
}

function DeleteDialog({ doc, removing, error, onClose, onConfirm }: {
  doc: DocRecord
  removing: boolean
  error: string
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-[390px]">
        <DialogHeader>
          <DialogTitle>删除文档</DialogTitle>
          <DialogDescription>「{doc.title}」将从当前知识库删除。</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-ui-label text-destructive">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={removing}>取消</Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={removing}>{removing ? '正在删除…' : '确认删除'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
