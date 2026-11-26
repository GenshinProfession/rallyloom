import { WorkspaceHeader } from '@/components/ui/workspace-header'
/* 文档中心：文件夹优先（先建文件夹，再往里放文档）。
   新建与编辑都进入独立页面；文档名 / 所在文件夹不在编辑页里填写，
   统一在左侧目录或卡片上右键重命名 / 删除（参考钉钉、飞书、WPS 的交互）。 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronRight, ExternalLink, FilePlus2, FileText, Paperclip, Search, Maximize2, Minimize2, FolderPlus, LoaderCircle, Trash2, Pencil,
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

type MenuTarget =
  | { kind: 'doc'; doc: DocRecord }
  | { kind: 'folder'; path: readonly string[] }

type MenuState = { x: number; y: number; target: MenuTarget } | null

function toDraft(doc: DocRecord, title = doc.title): DocDraft {
  return {
    entryType: doc.entryType === 'folder' ? 'folder' : 'document',
    title,
    space: doc.space,
    folderPath: doc.folderPath,
    format: doc.format ?? 'rich',
    content: doc.content,
    url: doc.url,
    attachments: doc.attachments,
    revision: doc.revision,
  }
}

function DocCard({ doc, onOpen, onMenu }: { doc: DocRecord; onOpen: () => void; onMenu: (event: React.MouseEvent) => void }) {
  const path = documentPath(doc)
  const excerpt = docExcerpt(doc)
  return (
    <button type="button" className="doc-card ui-press" onClick={onOpen} onContextMenu={onMenu} data-doc-row={doc.id}>
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
  const [location, setLocation] = useState<readonly string[]>([])
  const [newFolder, setNewFolder] = useState(false)
  const [folderParent, setFolderParent] = useState<readonly string[]>([])
  const [folderName, setFolderName] = useState('')
  const [folderBusy, setFolderBusy] = useState(false)
  const [folderError, setFolderError] = useState('')
  const [folderNotice, setFolderNotice] = useState('')
  const [menu, setMenu] = useState<MenuState>(null)
  const [renaming, setRenaming] = useState<DocRecord | null>(null)
  const [renamingPath, setRenamingPath] = useState<{ path: readonly string[]; name: string } | null>(null)
  const [renameName, setRenameName] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameError, setRenameError] = useState('')
  const documents = records.filter((r) => r.entryType !== 'folder')
  const folders = records.filter((r) => r.entryType === 'folder')
  const activeFolder = records.find((r) => r.entryType === 'folder' && JSON.stringify([...documentPath(r), r.title]) === JSON.stringify(location))
  const folderCount = useMemo(() => {
    const set = new Set<string>()
    for (const doc of records) {
      const parts = doc.entryType === 'folder' ? [...documentPath(doc), doc.title] : documentPath(doc)
      for (let index = 1; index < parts.length; index += 1) set.add(parts.slice(0, index + 1).join('\u0000'))
    }
    return set.size
  }, [records])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<DocRecord | null>(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState('')

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setFullscreen(false); setMenu(null) }
    }
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
    for (const doc of documents) {
      const key = documentPath(doc)[0]
      const bucket = map.get(key)
      if (bucket) bucket.push(doc)
      else map.set(key, [doc])
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'zh-CN'))
  }, [documents])

  const q = query.trim().toLocaleLowerCase()
  const matches = useCallback((doc: DocRecord) => {
    if (location.length && !location.every((part, i) => documentPath(doc)[i] === part)) return false
    if (!q) return true
    return [doc.title, doc.ownerName ?? '', ...documentPath(doc), ...Object.values(doc.attrs ?? {}), docExcerpt(doc, 400)]
      .some((value) => value.toLocaleLowerCase().includes(q))
  }, [q, location])

  const visibleSpaces = spaces
    .map(([space, docs]) => [space, docs.filter(matches)] as const)
    .filter(([, docs]) => docs.length > 0)

  const current = view.kind === 'read' ? records.find((doc) => doc.id === view.id) ?? null : null
  const selected = records.find((doc) => doc.id === selectedId) ?? null

  function folderFor(path: readonly string[]) {
    return records.find((r) => r.entryType === 'folder' && JSON.stringify([...documentPath(r), r.title]) === JSON.stringify(path))
  }

  function openFolderDialog(parent: readonly string[]) {
    setFolderParent(parent)
    setFolderName('')
    setFolderError('')
    setNewFolder(true)
  }

  function openMenu(event: React.MouseEvent, target: MenuTarget) {
    event.preventDefault()
    event.stopPropagation()
    const width = 208
    const height = target.kind === 'doc' ? 176 : 204
    setMenu({
      x: Math.min(event.clientX, window.innerWidth - width - 8),
      y: Math.min(event.clientY, window.innerHeight - height - 8),
      target,
    })
  }

  function startNewDoc() {
    const target = location.length ? location : selected?.entryType === 'folder' ? [...documentPath(selected), selected.title] : []
    if (target.length === 0) {
      setFolderNotice('先创建文件夹，再把文档放进去。')
      openFolderDialog([])
      return
    }
    setFolderNotice('')
    changeView({ kind: 'edit', doc: null, location: target })
  }

  async function createFolder() {
    if (folderBusy) return
    setFolderBusy(true)
    setFolderError('')
    try {
      const title = folderName.trim()
      if (!title) throw new Error('请填写文件夹名称。')
      if (title.includes('/') || title.includes('\\')) throw new Error('名称不能包含斜线。')
      if (folderParent.length > 10) throw new Error('目录最多 10 层。')
      /* 顶层新建 = 直接建一个一级文件夹（内部用 space 作为容器名）；在文件夹里新建 = 子文件夹。 */
      const record = await client.create(folderParent.length === 0
        ? { entryType: 'folder', title, space: title, folderPath: [], format: 'markdown', content: '' }
        : { entryType: 'folder', title, space: folderParent[0], folderPath: folderParent.slice(1), format: 'markdown', content: '' })
      setRecords(await client.list())
      const createdPath = [...documentPath(record), record.title]
      const nextLocation = createdPath.length === 2 && createdPath[0] === createdPath[1] ? [createdPath[0]] : createdPath
      if (changeView({ kind: 'list' })) {
        setLocation(nextLocation)
        setSelectedId(null)
        setQuery('')
      }
      setNewFolder(false)
      setFolderNotice('文件夹已创建，可以往里新建文档了。')
    } catch (failure) {
      setFolderError(failure instanceof Error ? failure.message : '创建失败')
    } finally {
      setFolderBusy(false)
    }
  }

  async function rename() {
    if (!renaming || renameBusy) return
    const title = renameName.trim()
    if (!title) { setRenameError('请填写名称。'); return }
    setRenameBusy(true)
    setRenameError('')
    try {
      await client.update(renaming.id, toDraft(renaming, title))
      setRecords(await client.list())
      setRenaming(null)
    } catch (failure) {
      setRenameError(failure instanceof Error ? failure.message : '重命名失败，请重试。')
    } finally {
      setRenameBusy(false)
    }
  }

  /** 没有 folder 记录的目录（演示数据多为路径目录）：改掉所有命中该路径的文档的 folderPath / space。 */
  async function renamePathFolder() {
    if (!renamingPath || renameBusy) return
    const name = renamingPath.name.trim()
    if (!name) { setRenameError('请填写名称。'); return }
    setRenameBusy(true)
    setRenameError('')
    try {
      const target = renamingPath.path
      const affected = records.filter((doc) => doc.entryType !== 'folder' && target.every((part, index) => documentPath(doc)[index] === part))
      for (const doc of affected) {
        const next = [...target.slice(0, -1), name, ...documentPath(doc).slice(target.length)]
        await client.update(doc.id, { ...toDraft(doc), space: next[0], folderPath: next.slice(1) })
      }
      setRecords(await client.list())
      if (location.length >= target.length && target.every((part, index) => location[index] === part)) {
        setLocation([...target.slice(0, -1), name, ...location.slice(target.length)])
      }
      setRenamingPath(null)
    } catch (failure) {
      setRenameError(failure instanceof Error ? failure.message : '重命名失败，请重试。')
    } finally {
      setRenameBusy(false)
    }
  }

  async function save(draft: DocDraft) {
    if (view.kind !== 'edit') return
    const saved = view.doc ? await client.update(view.doc.id, draft) : await client.create(draft)
    setQuery('')
    setLocation([...documentPath(saved), saved.title].slice(0, Math.max(1, documentPath(saved).length)))
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
      if (deleting.entryType === 'folder') setLocation(documentPath(deleting))
      if (view.kind === 'read' && view.id === deleting.id) setView({ kind: 'list' })
    } catch (failure) {
      setRemoveError(failure instanceof Error ? failure.message : '删除失败，请重试。')
    } finally { setRemoving(false) }
  }

  const fullscreenControl = <Button variant="ghost" size="sm" aria-label={fullscreen ? '退出全屏' : '全屏文档'} aria-pressed={fullscreen} onClick={() => setFullscreen(!fullscreen)}>{fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}{fullscreen ? '退出全屏' : '全屏'}</Button>

  const menuFolder = menu?.target.kind === 'folder' ? menu.target : null

  return (
    <main data-docs="root" className="rl-canvas flex min-w-0 flex-1 flex-col">
      <WorkspaceHeader title="文档中心" description={load === 'ready' ? `${folderCount} 个文件夹 · ${documents.length} 篇文档` : client.label}>
        {client.supportsFolders && (
          <Button variant="toolbar" size="sm" className="ml-auto h-8 text-ui-label" disabled={load !== 'ready'} data-doc-new-folder
            onClick={() => openFolderDialog(location)}>
            <FolderPlus />新建文件夹
          </Button>
        )}
        <Button variant="toolbar" size="sm" className={`${client.supportsFolders ? '' : 'ml-auto'} h-8 text-ui-label`} disabled={load !== 'ready'}
          data-doc-new="true" title={location.length ? `在「${location[location.length - 1]}」里新建文档` : '先创建文件夹，再新建文档'}
          onClick={startNewDoc}>
          <FilePlus2 /> 新建文档
        </Button>
      </WorkspaceHeader>

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
            <Button variant="ghost" size="sm" onClick={() => { if (changeView({ kind: 'list' })) { setLocation([]); setSelectedId(null) } }}>全部文档</Button>
            <DocumentTree records={records} query={query} selected={selected} location={location}
              onMenu={(event, target) => openMenu(event, target)}
              onFolderSelect={(path) => { if (changeView({ kind: 'list' })) { setLocation(path); setSelectedId(null); setQuery('') } }}
              onSelect={(id) => { if (changeView({ kind: 'read', id })) { setSelectedId(id); const doc = records.find((r) => r.id === id); if (doc) setLocation(documentPath(doc)) } }} />
          </ScrollArea>
        </section>

        <section data-doc-pane data-fullscreen={fullscreen || undefined} className={fullscreen ? 'fixed inset-x-0 bottom-0 top-8 z-40 flex min-h-0 flex-col bg-white' : 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/80 bg-white'}>
          {view.kind === 'edit' ? <DocEditorPage key={`${view.doc?.id ?? 'new'}-${editorEpoch}`} doc={view.doc} records={records} location={view.location}
            toolbarActions={fullscreenControl}
            onDirtyChange={setEditorDirty} onSave={async (draft) => { await save(draft); setEditorDirty(false) }}
            onCancel={() => { setEditorDirty(false); setView(view.doc ? { kind: 'read', id: view.doc.id } : { kind: 'list' }) }} />
            : current ? <DocReaderPage toolbarActions={fullscreenControl} doc={current} canEdit={current.canEdit !== false}
              onEdit={() => changeView({ kind: 'edit', doc: current, location: documentPath(current) })}
              onRename={() => { setRenaming(current); setRenameName(current.title); setRenameError('') }}
              onDelete={() => { setRemoveError(''); setDeleting(current) }} onBack={() => changeView({ kind: 'list' })} /> : <>

          <header className="doc-list-head">
            <span className="doc-list-title">{location.length ? location.join(' / ') : '全部文档'}</span>
            {activeFolder && activeFolder.canDelete !== false && <Button size="sm" variant="ghost" onClick={() => { setRemoveError(''); setDeleting(activeFolder) }}><Trash2 className="size-3.5" />删除文件夹</Button>}
            {activeFolder && <Button size="sm" variant="ghost" onClick={() => { setRenaming(activeFolder); setRenameName(activeFolder.title); setRenameError('') }}><Pencil className="size-3.5" />重命名</Button>}
            <span className="text-[11px] text-muted-foreground">{q ? `匹配 ${visibleSpaces.reduce((sum, [, docs]) => sum + docs.length, 0)} 篇` : `${documents.length} 篇`}</span>
            <span className="ml-auto flex items-center">{fullscreenControl}</span>
          </header>
          <ScrollArea className="min-h-0 flex-1 [&>[data-radix-scroll-area-viewport]>div]:!block">
            <div className="doc-list-body">
              {folderNotice && load === 'ready' && <p className="doc-list-notice" role="status">{folderNotice}</p>}
              {load === 'error' && (
                <div className="doc-empty-state" data-doc-empty="error" role="status">
                  <span className="doc-empty-mark" aria-hidden><FileText className="size-[22px]" strokeWidth={1.6} /></span>
                  <strong>暂时无法读取文档</strong>
                  <p>企业工作区这次没有返回文档数据，稍后重新打开文档中心即可。</p>
                </div>
              )}
              {load === 'loading' && (
                <div className="doc-empty-state is-plain" data-doc-empty="loading" role="status" aria-live="polite">
                  <span className="doc-empty-mark" aria-hidden><LoaderCircle className="size-[22px] animate-spin" strokeWidth={1.6} /></span>
                  <strong>正在加载文档…</strong>
                  <p>正在向企业工作区获取文档列表。</p>
                </div>
              )}
              {load === 'ready' && visibleSpaces.length === 0 && (
                <div className="doc-empty-state" data-doc-empty="ready">
                  <span className="doc-empty-mark" aria-hidden>{folders.length === 0 ? <FolderPlus className="size-[22px]" strokeWidth={1.6} /> : <FileText className="size-[22px]" strokeWidth={1.6} />}</span>
                  <strong>{q ? '没有匹配的文档' : folders.length === 0 ? '先创建一个文件夹' : location.length ? '此文件夹还是空的' : '还没有文档'}</strong>
                  <p>{q
                    ? '换个关键词试试，或清空搜索条件。'
                    : folders.length === 0
                      ? '文档要放在文件夹里：先建文件夹，再进去新建或导入文档，结构才清楚。'
                      : location.length
                        ? '在这个文件夹里新建文档，或右键文件夹继续建子文件夹。'
                        : '从左侧选一个文件夹，或直接新建文档。'}</p>
                  <div className="doc-empty-actions">
                    {folders.length === 0 || !location.length ? (
                      <Button size="sm" data-doc-empty-folder onClick={() => openFolderDialog(location)}><FolderPlus className="size-3.5" /> 新建文件夹</Button>
                    ) : null}
                    {location.length > 0 && (
                      <Button size="sm" data-doc-empty-new onClick={() => changeView({ kind: 'edit', doc: null, location })}><FilePlus2 className="size-3.5" /> 新建文档</Button>
                    )}
                    {!location.length && folders.length > 0 && (
                      <Button variant="outline" size="sm" onClick={() => { if (changeView({ kind: 'list' })) { setLocation([]); setSelectedId(null); setQuery('') } }}>返回全部文档</Button>
                    )}
                  </div>
                </div>
              )}
              {visibleSpaces.map(([space, docs]) => (
                <section key={space} className="doc-list-group" data-doc-space={space}>
                  <h2 className="doc-list-space">{space}<span>{docs.length}</span></h2>
                  <div className="doc-list-cards">
                    {docs.map((doc) => (
                      <DocCard key={doc.id} doc={doc}
                        onMenu={(event) => openMenu(event, { kind: 'doc', doc })}
                        onOpen={() => { setSelectedId(doc.id); setLocation(documentPath(doc)); setView({ kind: 'read', id: doc.id }) }} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </ScrollArea>
          </>}
        </section>
      </div>

      {menu && (
        <div className="doc-menu-layer" onPointerDown={() => setMenu(null)} onContextMenu={(event) => { event.preventDefault(); setMenu(null) }}>
          <div className="doc-menu" style={{ left: menu.x, top: menu.y }} role="menu" data-doc-menu onPointerDown={(event) => event.stopPropagation()}>
            {menu.target.kind === 'doc' ? (
              <>
                <button type="button" role="menuitem" className="doc-menu-item" onClick={() => { setMenu(null); setSelectedId(menu.target.kind === 'doc' ? menu.target.doc.id : null); setView({ kind: 'read', id: menu.target.kind === 'doc' ? menu.target.doc.id : '' }) }}>打开</button>
                <button type="button" role="menuitem" className="doc-menu-item" onClick={() => { const doc = menu.target.kind === 'doc' ? menu.target.doc : null; setMenu(null); if (doc) { setRenaming(doc); setRenameName(doc.title); setRenameError('') } }}>重命名</button>
                <button type="button" role="menuitem" className="doc-menu-item is-danger" onClick={() => { const doc = menu.target.kind === 'doc' ? menu.target.doc : null; setMenu(null); if (doc) { setRemoveError(''); setDeleting(doc) } }}>删除</button>
              </>
            ) : (
              <>
                <button type="button" role="menuitem" className="doc-menu-item" onClick={() => { const path = menuFolder?.path ?? []; setMenu(null); changeView({ kind: 'edit', doc: null, location: path }) }}>新建文档</button>
                <button type="button" role="menuitem" className="doc-menu-item" onClick={() => { const path = menuFolder?.path ?? []; setMenu(null); openFolderDialog(path) }}>新建子文件夹</button>
                <button type="button" role="menuitem" className="doc-menu-item" onClick={() => {
                  const path = menu.target.kind === 'folder' ? menu.target.path : []
                  setMenu(null)
                  const record = folderFor(path)
                  if (record) { setRenaming(record); setRenameName(record.title); setRenameError('') }
                  else if (path.length > 0) { setRenamingPath({ path, name: path[path.length - 1] }); setRenameError('') }
                }}>重命名</button>
                {(() => { const record = menuFolder ? folderFor(menuFolder.path) : null; if (!record || record.canDelete === false) return null; return (
                  <button type="button" role="menuitem" className="doc-menu-item is-danger" onClick={() => { setMenu(null); setRemoveError(''); setDeleting(record) }}>删除</button>
                ) })()}
              </>
            )}
          </div>
        </div>
      )}

      {newFolder && (
        <Dialog open onOpenChange={(open) => { if (!open && !folderBusy) setNewFolder(false) }}>
          <DialogContent className="max-w-[420px]">
            <DialogHeader>
              <DialogTitle>新建文件夹</DialogTitle>
              <DialogDescription>文档要放在文件夹里，先建文件夹，再往里新建文档。</DialogDescription>
            </DialogHeader>
            <label className="grid gap-1 text-ui-label">文件夹名称
              <Input autoFocus aria-label="新文件夹名称" maxLength={100} disabled={folderBusy} value={folderName}
                placeholder={folderParent.length ? '例如：规章制度' : '例如：公司资料'} onChange={(event) => setFolderName(event.target.value)} />
            </label>
            <p className="text-ui-label text-muted-foreground">
              {folderParent.length ? `将创建在「${folderParent.join(' / ')}」里` : '将创建在文档中心根目录'}
            </p>
            {folderError && <p role="alert" className="text-destructive">{folderError}</p>}
            <DialogFooter>
              <Button variant="outline" disabled={folderBusy} onClick={() => setNewFolder(false)}>取消</Button>
              <Button disabled={folderBusy || !folderName.trim()} onClick={() => void createFolder()}>创建文件夹</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {renamingPath && (
        <Dialog open onOpenChange={(open) => { if (!open && !renameBusy) setRenamingPath(null) }}>
          <DialogContent className="max-w-[380px]">
            <DialogHeader>
              <DialogTitle>重命名文件夹</DialogTitle>
              <DialogDescription>会同步改掉这个目录下所有文档的文件夹路径。</DialogDescription>
            </DialogHeader>
            <Input autoFocus aria-label="新名称" maxLength={100} disabled={renameBusy} value={renamingPath.name}
              onChange={(event) => setRenamingPath({ ...renamingPath, name: event.target.value })}
              onKeyDown={(event) => { if (event.key === 'Enter') void renamePathFolder() }} />
            {renameError && <p role="alert" className="text-destructive">{renameError}</p>}
            <DialogFooter>
              <Button variant="outline" disabled={renameBusy} onClick={() => setRenamingPath(null)}>取消</Button>
              <Button disabled={renameBusy || !renamingPath.name.trim()} onClick={() => void renamePathFolder()}>{renameBusy ? '正在保存…' : '保存名称'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {renaming && (
        <Dialog open onOpenChange={(open) => { if (!open && !renameBusy) setRenaming(null) }}>
          <DialogContent className="max-w-[380px]">
            <DialogHeader>
              <DialogTitle>{renaming.entryType === 'folder' ? '重命名文件夹' : '重命名文档'}</DialogTitle>
              <DialogDescription>改完后会立即同步到企业工作区。</DialogDescription>
            </DialogHeader>
            <Input autoFocus aria-label="新名称" maxLength={120} disabled={renameBusy} value={renameName}
              onChange={(event) => setRenameName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void rename() }} />
            {renameError && <p role="alert" className="text-destructive">{renameError}</p>}
            <DialogFooter>
              <Button variant="outline" disabled={renameBusy} onClick={() => setRenaming(null)}>取消</Button>
              <Button disabled={renameBusy || !renameName.trim()} onClick={() => void rename()}>{renameBusy ? '正在保存…' : '保存名称'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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
          <DialogTitle>{doc.entryType === 'folder' ? '删除文件夹' : '删除文档'}</DialogTitle>
          <DialogDescription>「{doc.title}」将从当前知识库删除。{doc.entryType === 'folder' ? '包含文档或子文件夹时不能删除。' : ''}</DialogDescription>
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
