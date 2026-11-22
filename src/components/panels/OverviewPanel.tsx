import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowUpRight, Check, LayoutList, ListTodo, LogIn, LogOut, MapPin, MessageCircle, UsersRound } from 'lucide-react'
import { ACTIVITIES, PRESENCE_META, type Activity, type Member, type Presence } from '@/data/office'
import type { ResolvedRoom } from '@/components/office/rooms/api'
import type { DataSlots } from '@/lib/store/types'
import type { RoomMetrics } from '@/components/office/room-metrics'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const statuses: Presence[] = ['online', 'busy', 'away', 'offline']
const activityIcon = {
  join: LogIn,
  leave: LogOut,
  room: MapPin,
  task: Check,
  meet: UsersRound,
}

interface OverviewProps {
  demo: boolean
  rooms: readonly ResolvedRoom[]
  roster: ReadonlyMap<string, Member[]>
  slots: DataSlots
  selectedRoom: string | null
  onSelectRoom: (id: string | null) => void
  focusedMember: string | null
  onOpenRoomChat?: (roomId: string) => void
  onPreviewRoomChat?: (roomId: string, anchor: HTMLElement) => void
  workPanel?: ReactNode
  tabRequest?: { tab: 'work' | 'overview'; sequence: number }
  metrics: RoomMetrics
}

function MemberLine({ member, detail = false, highlighted = false }: { member: Member; detail?: boolean; highlighted?: boolean }) {
  const status = PRESENCE_META[member.presence]
  return (
    <li className="office-member-line" data-highlighted={highlighted || undefined}>
      <span className="office-member-initial" style={{ background: member.body }}>{member.name.slice(0, 1)}</span>
      <span className="office-member-copy">
        <strong>{member.name}</strong>
        <small title={detail ? member.current : member.role}>{detail && member.presence !== 'offline' ? member.current : member.role}</small>
      </span>
      <span title={status.label} className="office-status-dot" style={{ background: status.color }} aria-label={status.label} />
    </li>
  )
}

function ActivityLine({ item }: { item: Activity }) {
  const Icon = activityIcon[item.kind]
  return (
    <li className="office-activity-line">
      <span><Icon size={12} strokeWidth={1.6} /></span>
      <p>{item.text}</p>
      <time>{item.time}</time>
    </li>
  )
}

function RoomDataSlot({ name, metrics: { rows, error } }: { name: string; metrics: RoomMetrics }) {
  return (
    <section className="office-room-slot">
      <h3>{name}</h3>
      {error && <p role="status">{error}</p>}
      {!rows && !error && <p role="status">正在加载看板…</p>}
      {rows?.length === 0 && <p>看板暂无数据。</p>}
      <dl>{rows?.map(({ label, value, delta }, index) => (
        <div key={`${label}-${index}`}><dt>{label}</dt><dd>{value}{delta && <small>{delta}</small>}</dd></div>
      ))}</dl>
    </section>
  )
}

export function OverviewPanel({ demo, rooms, roster, slots, selectedRoom, onSelectRoom, focusedMember, onOpenRoomChat, onPreviewRoomChat,
  workPanel, tabRequest, metrics }: OverviewProps) {
  const [tab, setTab] = useState(workPanel ? 'work' : 'overview')
  const [allActivities, setAllActivities] = useState(false)
  const [now, setNow] = useState(() => new Date())
  const hasWork = Boolean(workPanel)
  const overview = useRef<HTMLDivElement>(null)
  const activeRoom = rooms.find((room) => room.id === selectedRoom)
  const slot = activeRoom && slots[activeRoom.id]
  const members = [...roster.values()].flat()
  const counts = statuses.map((presence) => ({ presence, count: members.filter((member) => member.presence === presence).length }))
  const online = counts.find(({ presence }) => presence === 'online')?.count ?? 0
  const present = members.filter(({ presence }) => presence !== 'offline').length
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    if (selectedRoom) {
      setTab(hasWork ? 'work' : 'overview')
      overview.current?.scrollTo({ top: 0 })
    }
  }, [selectedRoom, focusedMember, hasWork])
  useEffect(() => { if (tabRequest) setTab(tabRequest.tab) }, [tabRequest])

  const day = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now)
  const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now)

  return (
    <aside className="office-overview" aria-label="办公室概览">
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="office-overview-head">
          <TabsList className="office-overview-tabs">
            {workPanel && <TabsTrigger value="work"><ListTodo size={13} /> 工作台</TabsTrigger>}
            <TabsTrigger value="overview"><LayoutList size={13} strokeWidth={1.65} /> 今日概览</TabsTrigger>
            <TabsTrigger value="members"><UsersRound size={13} strokeWidth={1.65} /> 团队成员</TabsTrigger>
          </TabsList>
        </div>
        {workPanel && <TabsContent value="work" className="office-overview-content">{workPanel}</TabsContent>}
        <TabsContent ref={overview} value="overview" className="office-overview-content">
          {activeRoom && (
            <section className="office-room-detail" data-room-detail={activeRoom.id} aria-label={`${activeRoom.name}详情`}>
              <header>
                <button aria-label="关闭房间详情" type="button" onClick={() => onSelectRoom(null)}><ArrowLeft size={14} /></button>
                <i style={{ background: activeRoom.accent }} />
                <h2>{activeRoom.name}</h2>
              </header>
              {activeRoom.note && <p>{activeRoom.note}</p>}
              {onOpenRoomChat && (
                <div className="office-room-chat-actions">
                  {onPreviewRoomChat && <button type="button" className="office-room-chat ui-press" aria-haspopup="dialog"
                    onClick={(event) => onPreviewRoomChat(activeRoom.id, event.currentTarget)}>
                    <MessageCircle size={13} strokeWidth={1.7} /> 快速聊天
                  </button>}
                  <button type="button" className="office-room-chat ui-press" onClick={() => onOpenRoomChat(activeRoom.id)}>
                    进入房间频道 <ArrowUpRight size={12} />
                  </button>
                </div>
              )}
              <ul>
                {(roster.get(activeRoom.id) ?? []).map((member) => <MemberLine key={member.id} member={member} detail highlighted={member.id === focusedMember} />)}
              </ul>
              {!roster.get(activeRoom.id)?.length && <p>暂无成员分配到此房间。</p>}
              {slot && <RoomDataSlot name={slot.name} metrics={metrics} />}
            </section>
          )}

          <section className="office-overview-section">
            <div className="office-date"><h2>{day}</h2><time>{time}</time></div>
            <div className="office-overview-stats">
              <div><strong>{members.length}</strong><span>已编排成员</span></div>
              <div><strong>{online}</strong><span>当前在线</span></div>
              <div><strong>{present}</strong><span>在岗成员</span></div>
            </div>
            <div className="office-statuses">
              {counts.map(({ presence, count }) => (
                <span key={presence}>
                  <i className="office-status-dot" style={{ background: PRESENCE_META[presence].color }} />
                  {PRESENCE_META[presence].label} {count}
                </span>
              ))}
            </div>
          </section>

          <section className="office-overview-section">
            <header className="office-section-head"><h2>房间使用</h2><span>{rooms.length} 个空间</span></header>
            <ul className="office-occupancies">
              {rooms.map((room) => {
                const present = (roster.get(room.id) ?? []).filter((member) => member.presence !== 'offline').length
                const occupied = Math.min(present / Math.max(room.seats.length, 1), 1)
                return (
                  <li key={room.id}>
                    <button
                      type="button"
                      data-room-list={room.id}
                      aria-pressed={room.id === selectedRoom}
                      onClick={() => onSelectRoom(room.id === selectedRoom ? null : room.id)}
                    >
                      <i className="office-status-dot" style={{ background: room.accent }} />
                      <span>{room.name}</span>
                      <span className="office-occupancy-track" aria-hidden><i style={{ width: `${occupied * 100}%`, background: room.accent }} /></span>
                      <small>{present}</small>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          {demo && <section className="office-overview-section">
            <header className="office-section-head"><h2>今日动态</h2><span>演示数据</span></header>
            <ul className="office-activity">{(allActivities ? ACTIVITIES : ACTIVITIES.slice(0, 4)).map((item) => <ActivityLine key={item.time} item={item} />)}</ul>
            <button type="button" className="office-more" onClick={() => setAllActivities((value) => !value)} aria-expanded={allActivities}>
              {allActivities ? '收起动态' : '查看全部动态'}
            </button>
          </section>}
        </TabsContent>
        <TabsContent value="members" className="office-overview-content">
          {rooms.map((room) => (
            <section key={room.id} className="office-overview-section">
              <header className="office-section-head"><h2>{room.name}</h2><span>{roster.get(room.id)?.length ?? 0}</span></header>
              <ul>{(roster.get(room.id) ?? []).map((member) => <MemberLine key={member.id} member={member} />)}</ul>
            </section>
          ))}
        </TabsContent>
      </Tabs>
    </aside>
  )
}

