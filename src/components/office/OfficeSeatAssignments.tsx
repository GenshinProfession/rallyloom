import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { TeamMember } from '@/lib/identity/types'
import type { LayoutState } from '@/lib/store/types'
import type { ResolvedRoom } from './rooms/api'

const MEMBER_DRAG = 'application/x-rallyloom-member'

export function OfficeSeatAssignments({ layout, rooms, team, onSave, onClose }: {
  layout: LayoutState
  rooms: readonly ResolvedRoom[]
  team: readonly TeamMember[]
  onSave: (next: LayoutState) => Promise<void>
  onClose: () => void
}) {
  const [assignments, setAssignments] = useState(layout.assignments)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState<string>()
  const eligible = team.filter((member) => member.officeAssignable ?? Object.hasOwn(layout.assignments, member.id))
  const visible = eligible.filter((member) => member.displayName.toLowerCase().includes(query.trim().toLowerCase()))
  const seats = rooms.filter((room) => room.seats.length)
  const counts = new Map<string, number>()
  for (const room of Object.values(assignments)) counts.set(room, (counts.get(room) ?? 0) + 1)
  const dirty = Object.entries(assignments).some(([id, room]) => layout.assignments[id] !== room)
    || Object.keys(assignments).length !== Object.keys(layout.assignments).length

  function assign(id: string, roomId: string) {
    if (busy || !eligible.some((member) => member.id === id) || (assignments[id] ?? '') === roomId) return
    const room = seats.find((candidate) => candidate.id === roomId)
    if (roomId && (!room || (counts.get(roomId) ?? 0) >= room.seats.length)) {
      setError('该房间没有空余工位。')
      return
    }
    const next = { ...assignments }
    if (roomId) next[id] = roomId
    else delete next[id]
    setAssignments(next)
    setError('')
  }

  async function save() {
    setBusy(true)
    setError('')
    try { await onSave({ ...layout, assignments }); onClose() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '保存工位分配失败，请重试。') }
    finally { setBusy(false) }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose() }}>
    <DialogContent className="max-h-[85vh] w-[calc(100vw-32px)] max-w-[690px] overflow-y-auto rounded-xl">
      <DialogHeader>
        <DialogTitle>分配工位</DialogTitle>
        <DialogDescription>将员工拖到房间卡片，或使用员工右侧的下拉框。</DialogDescription>
      </DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="office-seat-targets">
        {[{ id: '', name: '未分配' }, ...seats].map((room) => <div key={room.id} data-target={target === room.id}
          onDragOver={(event) => {
            if (busy || !event.dataTransfer.types.includes(MEMBER_DRAG)) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            setTarget(room.id)
          }}
          onDragLeave={(event) => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setTarget(undefined)
          }}
          onDrop={(event) => {
            const id = event.dataTransfer.getData(MEMBER_DRAG)
            if (!id) return
            event.preventDefault()
            setTarget(undefined)
            assign(id, room.id)
          }}>
          <strong>{room.name}</strong>
          <small>{'seats' in room ? (counts.get(room.id) ?? 0) + ' / ' + room.seats.length : eligible.filter(({ id }) => !assignments[id]).length + ' 人'}</small>
        </div>)}
      </div>
      <input type="search" aria-label="搜索待分配成员" placeholder="搜索成员" value={query} onChange={(event) => setQuery(event.target.value)}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
      <div className="office-seat-list">
        {visible.map((member) => <div key={member.id} className="office-seat-row">
          <span draggable={!busy} onDragStart={(event) => {
            event.dataTransfer.setData(MEMBER_DRAG, member.id)
            event.dataTransfer.effectAllowed = 'move'
          }} onDragEnd={() => setTarget(undefined)}>
            <strong>{member.displayName}</strong><small>{member.attrs['公司']}</small>
          </span>
          <select value={assignments[member.id] ?? ''} aria-label={'为 ' + member.displayName + ' 分配房间'}
            disabled={busy} onChange={(event) => assign(member.id, event.target.value)}>
            <option value="">未分配</option>
            {seats.map((room) => <option key={room.id} value={room.id}
              disabled={assignments[member.id] !== room.id && (counts.get(room.id) ?? 0) >= room.seats.length}>{room.name}</option>)}
          </select>
        </div>)}
        {!visible.length && <p className="text-sm text-muted-foreground">没有符合条件的成员。</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={onClose}>取消</Button>
        <Button disabled={busy || !dirty} onClick={() => void save()}>{busy ? '正在保存…' : '保存工位分配'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
