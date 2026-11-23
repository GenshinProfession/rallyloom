import { WorkspaceHeader } from '@/components/ui/workspace-header'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Hash, LayoutGrid, MessageCircle, UsersRound, Search, X, RotateCw } from 'lucide-react'
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css'
import { MessageList, TypingIndicator } from '@chatscope/chat-ui-kit-react'
import { Input } from '@/components/ui/input'
import { PRESENCE_META } from '@/data/office'
import { Button } from '@/components/ui/button'
import { isMentionFor, type ChatChannel, type ChatClient, type ChatMessage, type ChatParticipant, type ChatPerson } from '@/lib/chat/types'
import { useChatThread } from '@/lib/chat/use-chat-thread'
import { ChatComposer } from './ChatComposer'
import { ChatTranscript } from './ChatTranscript'
import './chat.css'

function ChatThread({ channel, client, sender, targetId, focusRequest, onLocateRoom, onRead, onRoster, onDirect }: {
  onRoster: (id: string, people: readonly ChatParticipant[]) => void
  onDirect: (id: string) => Promise<void>
  channel: ChatChannel
  client: ChatClient
  sender: ChatPerson
  targetId: string | null
  focusRequest: number
  onLocateRoom: (roomId: string) => void
  onRead: (ids: readonly string[]) => void
}) {
  const [people, setPeople] = useState<readonly ChatParticipant[]>([])
  const [memberStatus, setMemberStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [showMembers, setShowMembers] = useState(false)
  const [memberQuery, setMemberQuery] = useState('')
  const [rosterRequest, setRosterRequest] = useState(0)
  const [directError, setDirectError] = useState('')
  const [openingDirect, setOpeningDirect] = useState<string>()
  useEffect(() => {
    let active = true
    setMemberStatus('loading')
    void client.participants(channel.id).then(list => {
      if (active) { setPeople(list); setMemberStatus('ready'); onRoster(channel.id, list) }
    }, () => { if (active) { setPeople([]); setMemberStatus('error') } })
    return () => { active = false }
  }, [client, channel.id, onRoster, rosterRequest])
  const online = people.filter(person => person.presence === 'online').length
  const visiblePeople = people.filter(person => [person.name, person.detail].some(value => value?.toLocaleLowerCase().includes(memberQuery.trim().toLocaleLowerCase())))
  const channelId = channel.id
  const roomId = channel.roomId
  const thread = useChatThread(client, channelId)
  const { messages, status, typing } = thread
  const seen = useRef(new Set<string>())
  const located = useRef<string | null>(null)

  useEffect(() => {
    if (status !== 'ready') return
    const unread = messages.filter((message) => !seen.current.has(message.id) && isMentionFor(message, sender.id))
    if (unread.length) {
      for (const { id } of unread) seen.current.add(id)
      onRead(unread.map(({ id }) => id))
    }
    if (targetId && located.current !== targetId && messages.some(({ id }) => id === targetId)) {
      located.current = targetId
      requestAnimationFrame(() => {
        document.getElementById(`chat-message-${targetId}`)?.scrollIntoView({ block: 'center', behavior: 'instant' })
      })
    }
  }, [messages, onRead, sender.id, status, targetId])

  return (
    <div className="chat-conversation"><section className="chat-thread" aria-label={channel.name} data-chat-channel={channelId}>
      <header className="chat-thread-header">
        <span className="chat-channel-icon" aria-hidden>{channel.peerId ? <MessageCircle size={15} /> : <Hash size={15} strokeWidth={1.7} />}</span>
        <div>
          <h2>{channel.name}</h2>
          <p>{memberStatus === 'ready' ? `${people.length} 位成员 · ${online} 人在线` : memberStatus === 'error' ? '成员列表暂不可用' : '正在加载成员…'}<span className="chat-thread-context">{channel.info}</span></p>
        </div>
        <button type="button" className="chat-members-toggle" aria-label="查看群成员" aria-expanded={showMembers} onClick={() => setShowMembers(!showMembers)}>
          <span className="chat-member-stack" aria-hidden>{people.slice(0, 3).map(person => <span key={person.id}>{person.name.slice(0, 1)}</span>)}</span>
          <UsersRound size={15} /><span>{memberStatus === 'ready' ? people.length : '成员'}</span>
        </button>
        {roomId && (
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 px-2.5 text-ui-label" onClick={() => onLocateRoom(roomId)}>
            <LayoutGrid size={13} strokeWidth={1.7} /> 在办公室定位 <ArrowUpRight size={12} />
          </Button>
        )}
      </header>
      <MessageList
        loading={status === 'loading'}
        typingIndicator={typing ? <TypingIndicator content={`${typing} 正在输入`} /> : undefined}
      >
        <MessageList.Content>
          {status === 'error' && (
            <div className="chat-empty" role="status">
              <p>消息记录暂时无法加载。</p>
              <Button type="button" variant="outline" size="sm" onClick={thread.retry}>重试</Button>
            </div>
          )}
          {status === 'ready' && messages.length === 0 && (
            <div className="chat-empty"><MessageCircle size={21} strokeWidth={1.5} aria-hidden /><p>还没有消息</p></div>
          )}
          <ChatTranscript messages={messages} meId={sender.id} client={client} targetId={targetId} />
        </MessageList.Content>
      </MessageList>
      <ChatComposer disabled={status !== 'ready'} onSend={(draft) => thread.send(draft, sender)} client={client} channelId={channelId} focusRequest={focusRequest} />
    </section>
    {showMembers && <aside className="chat-members-panel" aria-label="群成员列表">
      <header><div><h3>{channel.peerId ? '会话成员' : '群成员'}</h3><p>{memberStatus === 'ready' ? `${people.length} 位成员 · ${online} 人在线` : '成员由企业系统提供'}</p></div><button type="button" aria-label="关闭群成员" onClick={() => setShowMembers(false)}><X size={15} /></button></header>
      <div className="chat-members-search"><Search size={14} /><Input aria-label="搜索群成员" placeholder="搜索成员" value={memberQuery} onChange={event => setMemberQuery(event.target.value)} /></div>
      {directError && <p className="chat-members-error" role="alert">{directError}</p>}
      <div className="chat-members-list">
        {memberStatus === 'loading' && <p role="status">正在加载成员…</p>}
        {memberStatus === 'error' && <div className="chat-member-failure"><p>无法读取群成员。</p><Button variant="toolbar" size="sm" onClick={() => setRosterRequest(value => value + 1)}><RotateCw />重试</Button></div>}
        {memberStatus === 'ready' && visiblePeople.map(person => <div className="chat-member" key={person.id} data-chat-member={person.id}>
          <span className="chat-person-avatar">{person.name.slice(0, 1)}<i style={{ background: PRESENCE_META[person.presence]?.color ?? '#a4abb4' }} /></span>
          <span className="chat-person-copy"><strong>{person.name}{person.id === sender.id && <small>你</small>}</strong><span>{person.detail || PRESENCE_META[person.presence]?.label || '状态未知'}</span></span>
          {person.id !== sender.id && <button type="button" aria-label={`私聊 ${person.name}`} title={`私聊 ${person.name}`} disabled={Boolean(openingDirect)} onClick={async () => {
            setOpeningDirect(person.id); setDirectError('')
            try { await onDirect(person.id) } catch (error) { setDirectError(error instanceof Error ? error.message : '暂时无法发起私聊') } finally { setOpeningDirect(undefined) }
          }}><MessageCircle size={14} /></button>}
        </div>)}
        {memberStatus === 'ready' && !visiblePeople.length && <p>{memberQuery ? '没有匹配的成员' : '暂无成员'}</p>}
      </div>
      <footer><UsersRound size={13} />成员范围由企业管理，自动同步</footer>
    </aside>}
    </div>
  )
}

export function ChatPage({ sender, client, channelId, targetId, mentions, onChannelChange, onLocateRoom, onRead }: {
  sender: ChatPerson
  client: ChatClient
  members: readonly ChatParticipant[]
  channelId: string
  targetId: string | null
  mentions: ReadonlyMap<string, ChatMessage>
  onChannelChange: (channelId: string) => void
  onLocateRoom: (roomId: string) => void
  onRead: (ids: readonly string[]) => void
}) {
  const [rosters, setRosters] = useState<Record<string, readonly ChatParticipant[]>>({})
  const onRoster = useCallback((id: string, people: readonly ChatParticipant[]) => setRosters(current => ({ ...current, [id]: people })), [])
  const openDirect = async (id: string) => {
    const channel = await client.directChannel(id)
    setChannels(current => current.some(item => item.id === channel.id) ? current : [...current, channel])
    onChannelChange(channel.id)
  }
  const [channels, setChannels] = useState<ChatChannel[]>([])
  const [channelQuery, setChannelQuery] = useState('')
  const [failed, setFailed] = useState(false)
  const [focus, setFocus] = useState({ channelId: '', request: 0 })

  useEffect(() => {
    let active = true
    void client.channels().then(
      (list) => { if (active) { setChannels(list); setFailed(false) } },
      () => { if (active) setFailed(true) },
    )
    return () => { active = false }
  }, [client])

  const current = channels.find(({ id }) => id === channelId) ?? channels[0]

  return (
    <main data-chat="root" className="workspace-view bg-[#f3f3f2]">
      <WorkspaceHeader title="交流室" description={`${channels.filter(({ peerId }) => !peerId).length} 个群聊`} />

      <div className="workspace-content flex min-h-0 flex-1 py-3">
        <div className="workspace-chat-surface">
          <nav className="chat-channels" aria-label="交流室频道">
            <div className="chat-nav-heading"><span>消息</span><small>{channels.length}</small></div>
            <div className="chat-conversation-search"><Search size={14} /><Input aria-label="搜索会话" placeholder="搜索群聊或私聊" value={channelQuery} onChange={event => setChannelQuery(event.target.value)} /></div>
            <p className="chat-nav-label">群聊与私聊</p>
            {channels.filter(channel => channel.name.toLocaleLowerCase().includes(channelQuery.trim().toLocaleLowerCase())).map((channel) => {
              const group = rosters[channel.id]
              const online = group?.filter(({ presence }) => presence === 'online').length
              const alert = mentions.get(channel.id)
              return (
                <button key={channel.id} type="button" className="chat-channel ui-press"
                  data-conversation={channel.id} aria-current={channel.id === current?.id || undefined}
                  data-direct={Boolean(channel.peerId) || undefined}
                  onClick={() => onChannelChange(channel.id)}
                  onDoubleClick={() => {
                    onChannelChange(channel.id)
                    setFocus((value) => ({ channelId: channel.id, request: value.request + 1 }))
                  }}
                >
                  <span className="chat-channel-icon" aria-hidden>{channel.peerId ? <MessageCircle size={14} /> : <Hash size={14} strokeWidth={1.7} />}</span>
                  <span><strong>{channel.name}</strong><small>{channel.peerId ? '私聊' : group ? `${group.length} 人 · ${online} 在线` : '群聊'}</small></span>
                  {alert && <span className="chat-channel-mention">{alert.mention === 'all' ? '全体提醒' : '提到了你'}</span>}
                </button>
              )
            })}
          </nav>
          {current
            ? <ChatThread key={current.id} channel={current} sender={sender} client={client} onRoster={onRoster} onDirect={openDirect} onLocateRoom={onLocateRoom}
              onRead={onRead} targetId={current.id === channelId ? targetId : null}
              focusRequest={focus.channelId === current.id ? focus.request : 0}
            />
            : <div className="chat-empty" role="status">{failed ? '频道暂时无法加载。' : '正在加载频道…'}</div>}
        </div>
      </div>
    </main>
  )
}
