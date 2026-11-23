import { WorkspaceHeader } from '@/components/ui/workspace-header'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AtSign, Inbox, Maximize, Minus, Plus, MoreHorizontal, Pencil, LockKeyhole, UnlockKeyhole } from 'lucide-react'
import { oa } from '@/lib/oa/clients'
import { validateSeatPresence, type SeatPresence } from './seat-presence'
import type { WorkspaceSearchItem } from '@/components/WorkspaceSearch'
import { OverviewPanel } from '@/components/panels/OverviewPanel'
import { SelectionHighlight } from '@/components/ui/selection-highlight'
import type { Member } from '@/data/office'
import type { TeamMember } from '@/lib/identity/types'
import type { DataSlots, LayoutState } from '@/lib/store/types'
import { roomChannelId, type ChatChannel, type ChatClient, type ChatMessage, type ChatPerson } from '@/lib/chat/types'
import { OfficeQuickChat } from './OfficeQuickChat'
import { OfficeScene } from './OfficeScene'
import { OfficeLayoutEditor } from './OfficeLayoutEditor'
import { OfficeSeatAssignments } from './OfficeSeatAssignments'
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
  seatingEnabled?: boolean
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
  workspaceName, seatingEnabled, demo, layoutState: layout, members, slots, meSeatId, meName, searchHit,
  selectedRoom, onSelectRoom, chat, work, editing,
}: OfficePageProps) {
  const [focusedMember, setFocusedMember] = useState<string | null>(null)
  const [mode, setMode] = useState<OfficeMode>('daily')
  const [zoom, setZoom] = useState(100)
  const walking = false
  const [seatStates, setSeatStates] = useState<SeatPresence[]>([])
  const [seatBusy, setSeatBusy] = useState(false)
  const [seatReady, setSeatReady] = useState(false)
  const [seatError, setSeatError] = useState('')
  const seatPending = useRef(false)
  const seatEpoch = useRef(0)
  useEffect(() => {
    if (!seatingEnabled) return
    setSeatReady(false);setSeatStates([])
    let active = true
    if (demo) { setSeatReady(true); return }
    const refresh = async () => { if (seatPending.current) return; const requestEpoch=seatEpoch.current; try { const rows = validateSeatPresence(await oa('GET','/office/seats')); if(active && requestEpoch===seatEpoch.current && !seatPending.current){setSeatStates(previous=>JSON.stringify(previous)===JSON.stringify(rows)?previous:rows);setSeatReady(true);setSeatError('')} } catch(e) { if(active)setSeatError(e instanceof Error ? e.message : '座位状态暂不可用') } }
    void refresh();const timer=setInterval(()=>void refresh(),5000)
    return()=>{active=false;clearInterval(timer)}
  },[demo,seatingEnabled,layout.revision])
  async function changeSeat(roomId:string,seatIndex:number,seated:boolean){
    if(!meSeatId||seatPending.current||!seatReady)return
    seatPending.current=true;seatEpoch.current++;setSeatBusy(true);setSeatError('')
    try {
      const rows=demo?[...seatStates.filter(row=>row.memberId!==meSeatId),{memberId:meSeatId,roomId,seatIndex,seated}]:validateSeatPresence(await oa('PUT','/office/seats/self',{roomId,seatIndex,seated,layoutRevision:layout.revision??0}))
      setSeatStates(rows)
    }catch(e){setSeatError(e instanceof Error?e.message:'这个座位暂时无法使用，请刷新后重试。')}
    finally{seatPending.current=false;setSeatBusy(false)}
  }
  const [quick, setQuick] = useState<{ channel: ChatChannel; anchor: HTMLElement; request: number; targetId?: string } | null>(null)
  const [chatError, setChatError] = useState('')
  const [taskDraft, setTaskDraft] = useState<OfficeTaskDraft | null>(null)
  const [personal, setPersonal] = useState(false)
  const [editingOpen, setEditingOpen] = useState(false)
  const [assigningSeats, setAssigningSeats] = useState(false)
  const [seatLocked, setSeatLocked] = useState(false)
  const [assignmentTarget,setAssignmentTarget] = useState<{roomId:string;seatIndex:number}>()
  const [tabRequest, setTabRequest] = useState<{ tab: 'work' | 'overview'; sequence: number }>()
  const workButton = useRef<HTMLButtonElement>(null)
  const request = useRef(0)

  useEffect(() => {
    if (!searchHit) return
    setFocusedMember(searchHit.memberId ?? null)
    setPersonal(false)
    setMode('daily')
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
    const order=new Map(Object.keys(layout.assignments).map((id,index)=>[id,index]))
    for (const member of [...members].sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity))) {
      const group = byRoom.get(member.roomId) ?? []
      group.push(member.id === meSeatId ? { ...member, name: meName } : member)
      byRoom.set(member.roomId, group)
    }
    return byRoom
  }, [meSeatId, meName, members, layout.assignments])
  const present = members.filter(member => member.presence !== 'offline' && (member.roomId || seatStates.some(seat=>seat.memberId===member.id))).length
  const myRoom = rooms.find(room=>room.id===seatStates.find(seat=>seat.memberId===meSeatId)?.roomId) ?? rooms.find((room) => roster.get(room.id)?.slice(0, room.seats.length).some(({ id }) => id === meSeatId))
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
            {myRoom && <button type="button" className="office-tool ui-press office-seat-lock" aria-pressed={seatLocked} onClick={()=>{setSeatLocked(value=>!value);if(!seatLocked){selectRoom(myRoom.id);setFocusedMember(meSeatId);setZoom(140)}else setZoom(100)}}>{seatLocked?<LockKeyhole size={14}/>:<UnlockKeyhole size={14}/>}我的工位</button>}
            {chat && privateMention && <button type="button" className="office-tool ui-press" data-mentioned
              onClick={(event) => openMessage(privateMention.channelId, privateMention.id, event.currentTarget)}><AtSign size={14} /> 私聊中有人提到你</button>}
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button ref={workButton} type="button" className="office-tool ui-press" aria-label="更多办公室操作"><MoreHorizontal size={16} />更多</button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {workEnabled && <DropdownMenuItem data-office-inbox onSelect={() => { setPersonal(true); revealTab('work') }}><Inbox size={14} />待我处理</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </WorkspaceHeader>
        {seatError && <p role="status" className="office-seat-error">{seatError}</p>}
        {assigningSeats && editing && <OfficeSeatAssignments layout={layout} rooms={rooms} team={editing.team} target={assignmentTarget}
          onSave={editing.publish} onClose={() => {setAssigningSeats(false);setAssignmentTarget(undefined)}} />}

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
          focusedMember={seatLocked?meSeatId:focusedMember}
          meId={meSeatId}
          meName={meName}
          mode={mode}
          zoom={zoom}
          walking={walking}
          seats={seatStates}
          onSeat={seatingEnabled && seatReady ? changeSeat : undefined}
          seatBusy={seatBusy}
          seatLocked={seatLocked}
          onAssignSeat={editing ? (roomId,seatIndex)=>{setAssignmentTarget({roomId,seatIndex});setAssigningSeats(true)}:undefined}
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
              setSeatLocked(false)
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
        focusedMember={focusedMember}
        tabRequest={tabRequest} metrics={selectedRoom === gmvRoom?.id ? gmvMetrics : selectedMetrics}
        workPanel={workEnabled && work ? <OfficeWorkPanel access={work} room={workRoom} people={members} meSeatId={meSeatId}
          mentions={chat?.mentions} draft={taskDraft} onDraft={setTaskDraft} onMessage={openMessage}
 /> : undefined}
      />
    </>
  )
}

