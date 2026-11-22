import { useState } from 'react'
import type { WorkspaceSnapshot } from '@/lib/store/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
export function RoomSlotSettings({ snapshot, save }: { snapshot: WorkspaceSnapshot; save: (roomId: string, enabled: boolean) => Promise<void> }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <><Button variant="outline" size="sm" onClick={() => setOpen(true)}>房间工作看板</Button><Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value) }}><DialogContent className="max-h-[80vh] overflow-auto"><DialogHeader><DialogTitle>房间工作看板</DialogTitle></DialogHeader><p className="text-ui-label text-muted-foreground">在已发布房间挂载 Mira 工作概览。每个用户看到的任务数和文档数按其权限计算。</p>
    {!snapshot.layout.rooms.length && <p className="text-ui-body">先在办公室编辑器发布房间，再配置工作看板。</p>}
    {snapshot.layout.rooms.map((room) => <div key={room.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><span className="text-ui-body">{room.name}</span><Button variant={snapshot.dataSlots[room.id] ? 'secondary' : 'outline'} disabled={busy} size="sm" onClick={async () => { setBusy(true); setError(''); try { await save(room.id, !snapshot.dataSlots[room.id]) } catch (e) { setError(e instanceof Error ? e.message : '保存失败') } finally { setBusy(false) } }}>{snapshot.dataSlots[room.id] ? '移除工作概览' : '挂载工作概览'}</Button></div>)}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </DialogContent></Dialog></>
}
