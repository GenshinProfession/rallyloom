import { WorkspaceHeader } from '@/components/ui/workspace-header'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AtSign, Footprints, Inbox, LocateFixed, Maximize, MessageCircle, Minus, Plus, MoreHorizontal, Pencil, Armchair, LayoutTemplate } from 'lucide-react'
import type { WorkspaceSearchItem } from '@/components/WorkspaceSearch'
import { OverviewPanel } from '@/components/panels/OverviewPanel'
import { SelectionHighlight } from '@/components/ui/selection-highlight'
import type { Member } from '@/data/office'
import type { TeamMember } from '@/lib/identity/types'
import type { DataSlots, LayoutState } from '@/lib/store/types'
import { GENERAL_CHANNEL_ID, roomChannelId, type ChatChannel, type ChatClient, type ChatMessage, type ChatPerson } from '@/lib/chat/types'
import { OfficeQuickChat } from './OfficeQuickChat'
import { OfficeScene } from './OfficeScene'
import { OfficeLayoutEditor } from './OfficeLayoutEditor'
import { OfficeSeatAssignments } from './OfficeSeatAssignments'
import { OfficeReferencePreview } from './OfficeReferencePreview'
import { OfficeWorkPanel, type OfficeTaskDraft, type OfficeWorkAccess } from './OfficeWorkPanel'
import { gmvMetric, useRoomMetrics } from './room-metrics'
import { resolveOfficeLayout, roomTemplates } from './rooms'
import type { OfficeMode } from './three/world'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import './office.css'

const modes: { id: OfficeMode; label: string }[] = [
  { id: 'daily', label: '日常' },
  { id: 'presence', label: '在岗' },
  { id: 'tasks', label: '任务' },
]

interface OfficePageProps {
  workspaceName: string
  demo: boolean
  layoutState: LayoutState
  members: Member[]
  slots: DataSlots
  meSeatId: string | null
  meName: string
  searchHit: WorkspaceSearchItem | null
  selectedRoom: string | null
  onSelectRoom: (roomId: string | null) => void
  editing?: { team: TeamMember[]; publish: (layout: LayoutState) => Promise<void> }
  work?: OfficeWorkAccess
  chat?: {
    client: ChatClient
    sender: ChatPerson
    peers: ReadonlyMap<string, string>
    mentions: ReadonlyMap<string, ChatMessage>
    openChannel: (channelId: string) => void
    markRead: (ids: readonly string[]) => void
  }
}

export function OfficePage({
  workspaceName, demo, layoutState: layout, members, slots, meSeatId, meName, searchHit,
  selectedRoom, onSelectRoom, chat, work, editing,
}: OfficePageProps) {
  const [focusedMember, setFocusedMember] = useState<string | null>(null)
  const [mode, setMode] = useState<OfficeMode>('daily')
  const [zoom, setZoom] = useState(100)
  const [walking, setWalking] = useState(false)
  const [quick, setQuick] = useState<{ channel: ChatChannel; anchor: HTMLElement; request: number; targetId?: string } | null>(null)
  const [chatError, setChatError] = useState('')
  const [taskDraft, setTaskDraft] = useState<OfficeTaskDraft | null>(null)
  const [personal, setPersonal] = useState(false)
  const [editingOpen, setEditingOpen] = useState(false)
  const [assigningSeats, setAssigningSeats] = useState(false)
  const [referenceOpen, setReferenceOpen] = useState(false)
  const [tabRequest, setTabRequest] = useState<{ tab: 'work' | 'overview'; sequence: number }>()
  const workButton = useRef<HTMLButtonElement>(null)
  const request = useRef(0)

  useEffect(() => {
    if (!searchHit) return
    setFocusedMember(searchHit.memberId ?? null)
    setPersonal(false)
    setMode('daily')
    setWalking(false)
    setZoom(100)
  }, [searchHit])

  function selectRoom(id: string | null) {
    onSelectRoom(id)
    setFocusedMember(null)
    setPersonal(false)
    setTabRequest(undefined)
  }
  const { rooms, layoutError } = useMemo(() => {
    try {
      return { rooms: resolveOfficeLayout(layout, roomTemplates), layoutError: '' }
    } catch (error) {
      return { rooms: [], layoutError: error instanceof Error ? error.message : String(error) }
    }
  }, [layout])
  const gmvRoom = rooms.find((room) => room.appearance.display === 'gmv' && slots[room.id]) ?? rooms.find((room) => room.appearance.display === 'gmv')
  const gmvSlot = gmvRoom ? slots[gmvRoom.id] : undefined
  const gmvMetrics = useRoomMetrics(gmvRoom?.id, gmvSlot, demo)
  const selectedMetrics = useRoomMetrics(selectedRoom && selectedRoom !== gmvRoom?.id ? selectedRoom : undefined,
    selectedRoom && selectedRoom !== gmvRoom?.id ? slots[selectedRoom] : undefined, demo)
  const gmv = useMemo(() => {
    if (!gmvRoom) return undefined
    const metric = gmvMetric(gmvMetrics.rows)
    return { roomId: gmvRoom.id, value: metric?.value, delta: metric?.delta,
      status: gmvMetrics.error ? '暂不可用' : !gmvSlot ? '待配置' : !gmvMetrics.rows ? '读取中' : !metric ? '暂无数据' : gmvSlot.kind === 'demo-feed' ? '演示数据' : '企业数据' }
  }, [gmvMetrics.error, gmvMetrics.rows, gmvRoom, gmvSlot])
  const mentionedRooms = useMemo(() => new Set(rooms
    .filter(({ id }) => chat?.mentions.has(roomChannelId(id)))
    .map(({ id }) => id)), [chat?.mentions, rooms])
  const generalMention = chat?.mentions.get(GENERAL_CHANNEL_ID)
  const privateMention = [...(chat?.mentions.values() ?? [])].filter(({ channelId }) => channelId.startsWith('direct:')).at(-1)

  function previewRoom(roomId: string, anchor: HTMLElement) {
    const room = rooms.find(({ id }) => id === roomId)
    if (!room || !chat) return
    setChatError('')
    setQuick({ channel: { id: roomChannelId(room.id), name: room.name, info: '房间频道', roomId }, anchor, request: ++request.current })
  }

  function previewPerson(personId: string, anchor: HTMLElement) {
    const peer = chat?.peers.get(personId)
    if (!chat || !peer || peer === chat.sender.id) return
    const current = ++request.current
    setChatError('')
    void chat.client.directChannel(peer).then((channel) => {
      if (request.current === current && anchor.isConnected) setQuick({ channel, anchor, request: current })
    }, () => { if (request.current === current) setChatError('暂时无法打开私聊，请重试。') })
  }

  function openRoom(roomId: string) {
    selectRoom(roomId)
    chat?.openChannel(roomChannelId(roomId))
  }

  function revealTab(tab: 'work' | 'overview') {
    setTabRequest((previous) => ({ tab, sequence: (previous?.sequence ?? 0) + 1 }))
  }

  function openMessage(channelId: string, targetId: string, anchor: HTMLElement) {
    if (!chat) return
    const current = ++request.current
    void chat.client.channels().then((channels) => {
      if (request.current !== current) return
      const channel = channels.find(({ id }) => id === channelId)
      const target = anchor.isConnected && !anchor.closest('[role="dialog"]') ? anchor : workButton.current
      if (channel && target) {
        setChatError('')
        setQuick({ channel, anchor: target, request: current, targetId })
      } else setChatError('暂时无法定位原消息。')
    }, () => { if (request.current === current) setChatError('暂时无法打开消息，请重试。') })
  }
  const roster = useMemo(() => {
    const byRoom = new Map<string, Member[]>()
    for (const member of members) {
      const group = byRoom.get(member.roomId) ?? []
      group.push(member.id === meSeatId ? { ...member, name: meName } : member)
      byRoom.set(member.roomId, group)
    }
    return byRoom
  }, [meSeatId, meName, members])
  const present = members.filter(({ presence }) => presence !== 'offline').length
  const myRoom = rooms.find((room) => roster.get(room.id)?.slice(0, room.seats.length).some(({ id }) => id === meSeatId))
  const workRoom = personal ? undefined : rooms.find(({ id }) => id === selectedRoom)
  const workEnabled = !!work && Boolean(work.tasks || work.docs || work.notices || chat)

  if (editingOpen && editing) {
    return <OfficeLayoutEditor layout={layout} onPublish={editing.publish} onClose={() => setEditingOpen(false)} />
  }

  return (
    <>
      <main className="office-page">
        <WorkspaceHeader className="office-header" title="办公室" description={workspaceName}>
          <div className="office-tools">
            {editing && <button type="button" className="office-tool ui-press" onClick={() => setEditingOpen(true)}><Pencil size={14} />编辑办公室</button>}
            {chat && (
              <button type="button" className="office-tool ui-press" data-general-quick data-mentioned={generalMention || undefined}
                aria-haspopup="dialog" title="单击快速聊天 · 双击进入全员大厅"
                onClick={(event) => {
                  if (event.detail > 1) return
                  setQuick({ channel: { id: GENERAL_CHANNEL_ID, name: '全员大厅', info: '团队公共频道' }, anchor: event.currentTarget, request: ++request.current })
                  setChatError('')
                }}
                onDoubleClick={() => chat.openChannel(GENERAL_CHANNEL_ID)}
              >
                {generalMention ? <AtSign size={14} /> : <MessageCircle size={14} strokeWidth={1.7} />}
                {generalMention ? (generalMention.mention === 'all' ? '全员大厅有全体提醒' : '全员大厅有人提到你') : '全员大厅'}
              </button>
            )}
            {chat && privateMention && <button type="button" className="office-tool ui-press" data-mentioned
              onClick={(event) => openMessage(privateMention.channelId, privateMention.id, event.currentTarget)}><AtSign size={14} /> 私聊中有人提到你</button>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button ref={workButton} type="button" className="office-tool ui-press" aria-label="更多办公室操作"><MoreHorizontal size={16} />更多</button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {workEnabled && <DropdownMenuItem data-office-inbox onSelect={() => { setPersonal(true); revealTab('work') }}><Inbox size={14} />待我处理</DropdownMenuItem>}
                {myRoom && <DropdownMenuItem onSelect={() => selectRoom(myRoom.id)}><LocateFixed size={14} />我的工位</DropdownMenuItem>}
                {editing && <DropdownMenuItem onSelect={() => setAssigningSeats(true)}><Armchair size={14} />分配工位</DropdownMenuItem>}
                {rooms.length > 0 && <DropdownMenuItem onSelect={() => { if (!walking) setZoom(100); setWalking(!walking) }}><Footprints size={14} />{walking ? '结束试走' : '试走办公室'}</DropdownMenuItem>}
                <DropdownMenuItem onSelect={() => setReferenceOpen(true)}><LayoutTemplate size={14} />参考户型</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </WorkspaceHeader>
        {assigningSeats && editing && <OfficeSeatAssignments layout={layout} rooms={rooms} team={editing.team}
          onSave={editing.publish} onClose={() => setAssigningSeats(false)} />}
        {referenceOpen && <OfficeReferencePreview onClose={() => setReferenceOpen(false)} />}

        {layoutError ? (
          <div className="office-viewport">
            <div className="office-webgl-fallback" role="alert"><strong>无法加载楼层配置</strong><span>{layoutError}</span></div>
          </div>
        ) : !demo && layout.rooms.length === 0 ? (
          <div className="office-viewport">
            <div className="office-webgl-fallback">
              <strong>办公室尚未编排</strong>
              {editing ? <button type="button" className="office-tool ui-press" onClick={() => setEditingOpen(true)}>开始编排</button>
                : <span>请等待平台超管发布办公室。</span>}
            </div>
          </div>
        ) : <OfficeScene
          layout={layout}
          rooms={rooms}
          roster={roster}
          slots={slots}
          selectedRoom={selectedRoom}
          onSelectRoom={selectRoom}
          focusedMember={focusedMember}
          meId={meSeatId}
          meName={meName}
          mode={mode}
          zoom={zoom}
          walking={walking}
          mentionedRooms={mentionedRooms}
          gmv={gmv}
          onOpenGmv={gmv ? () => { selectRoom(gmv.roomId); revealTab('overview') } : undefined}
          chat={chat ? {
            previewRoom, openRoom, previewPerson,
            roomMention: (roomId) => chat.mentions.get(roomChannelId(roomId))?.mention,
            canChatWith: (personId) => Boolean(chat.peers.get(personId) && chat.peers.get(personId) !== chat.sender.id),
          } : undefined}
        />}
        {chatError && <p className="office-chat-action-error" role="alert">{chatError}</p>}
        {chat && quick && (
          <OfficeQuickChat key={quick.request} channel={quick.channel} anchor={quick.anchor} client={chat.client} sender={chat.sender}
            targetId={quick.targetId} onRead={chat.markRead}
            onConvert={work?.tasks ? (message) => {
              setQuick(null)
              setTaskDraft({ roomId: quick.channel.peerId ? undefined : quick.channel.roomId,
                sourceMessage: { channelId: message.channelId, messageId: message.id, senderName: quick.channel.peerId ? '私聊' : message.senderName,
                  excerpt: quick.channel.peerId ? '' : message.text } })
              revealTab('work')
            } : undefined}
            onOpen={() => {
              if (quick.channel.roomId && !quick.channel.peerId) selectRoom(quick.channel.roomId)
              chat.openChannel(quick.channel.id)
            }}
            onDismiss={() => {
              if (request.current === quick.request) request.current++
              setQuick((value) => value === quick ? null : value)
            }}
          />
        )}

        <footer className="office-footer">
          <span>{rooms.length} 个空间 <i /> {present} 人在岗</span>
          <div className="office-modes selection-track" role="group" aria-label="办公室视图">
            <SelectionHighlight selected='[aria-pressed="true"]' />
            {modes.filter(({ id }) => demo || id !== 'tasks').map(({ id, label }) => (
              <button className="ui-press" type="button" key={id} aria-pressed={mode === id} onClick={() => setMode(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="office-canvas-tools">
            <div className="office-zoom" aria-label="楼层图缩放">
              <button className="ui-press" type="button" aria-label="缩小" disabled={zoom === 80} onClick={() => setZoom(Math.max(80, zoom - 20))}>
                <Minus size={13} strokeWidth={1.65} />
              </button>
              <button className="ui-press" type="button" aria-label="重置缩放" title="重置缩放" onClick={() => setZoom(100)}>{zoom}%</button>
              <button className="ui-press" type="button" aria-label="放大" disabled={zoom === 160} onClick={() => setZoom(Math.min(160, zoom + 20))}>
                <Plus size={13} strokeWidth={1.65} />
              </button>
            </div>
          <button
            className="office-fit ui-press"
            type="button"
            onClick={() => {
              selectRoom(null)
              setZoom(100)
            }}
          >
            <Maximize size={12} strokeWidth={1.65} /> 适应画布
          </button>
          </div>
        </footer>
      </main>

      <OverviewPanel demo={demo} rooms={rooms} roster={roster} slots={slots} selectedRoom={selectedRoom} onSelectRoom={selectRoom}
        focusedMember={focusedMember} onOpenRoomChat={chat ? openRoom : undefined} onPreviewRoomChat={chat ? previewRoom : undefined}
        tabRequest={tabRequest} metrics={selectedRoom === gmvRoom?.id ? gmvMetrics : selectedMetrics}
        workPanel={workEnabled && work ? <OfficeWorkPanel access={work} room={workRoom} people={members} meSeatId={meSeatId}
          mentions={chat?.mentions} draft={taskDraft} onDraft={setTaskDraft} onMessage={openMessage}
          onChat={chat && workRoom ? (event) => previewRoom(workRoom.id, event.currentTarget) : undefined} /> : undefined}
      />
    </>
  )
}

