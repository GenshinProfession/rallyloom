import { WorkspaceHeader } from '@/components/ui/workspace-header'
import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Hash, LayoutGrid, MessageCircle } from 'lucide-react'
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css'
import { MessageList, TypingIndicator } from '@chatscope/chat-ui-kit-react'
import { Button } from '@/components/ui/button'
import { isMentionFor, type ChatChannel, type ChatClient, type ChatMessage, type ChatParticipant, type ChatPerson } from '@/lib/chat/types'
import { useChatThread } from '@/lib/chat/use-chat-thread'
import { ChatComposer } from './ChatComposer'
import { ChatTranscript } from './ChatTranscript'
import './chat.css'

function ChatThread({ channel, client, sender, targetId, focusRequest, onLocateRoom, onRead }: {
  channel: ChatChannel
  client: ChatClient
  sender: ChatPerson
  targetId: string | null
  focusRequest: number
  onLocateRoom: (roomId: string) => void
  onRead: (ids: readonly string[]) => void
}) {
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
    <section className="chat-thread" aria-label={channel.name} data-chat-channel={channelId}>
      <header className="chat-thread-header">
        <span className="chat-channel-icon" aria-hidden>{channel.peerId ? <MessageCircle size={15} /> : <Hash size={15} strokeWidth={1.7} />}</span>
        <div>
          <h2>{channel.name}</h2>
          <p>{channel.info}</p>
        </div>
        {roomId && (
          <Button type="button" variant="outline" size="sm" className="ml-auto h-7 gap-1.5 px-2.5 text-ui-label" onClick={() => onLocateRoom(roomId)}>
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
  )
}

export function ChatPage({ sender, client, members, channelId, targetId, mentions, onChannelChange, onLocateRoom, onRead }: {
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
  const [channels, setChannels] = useState<ChatChannel[]>([])
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
      <WorkspaceHeader title="交流室" description={`${channels.filter(({ peerId }) => !peerId).length} 个频道`} />

      <div className="workspace-content flex min-h-0 flex-1 py-3">
        <div className="workspace-chat-surface">
          <nav className="chat-channels" aria-label="交流室频道">
            {channels.map((channel) => {
              const group = channel.roomId ? members.filter(({ roomId }) => roomId === channel.roomId) : members
              const online = group.filter(({ presence }) => presence === 'online').length
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
                  <span><strong>{channel.name}</strong><small>{channel.peerId ? '私聊' : `${group.length} 人 · ${online} 在线`}</small></span>
                  {alert && <span className="chat-channel-mention">{alert.mention === 'all' ? '全体提醒' : '提到了你'}</span>}
                </button>
              )
            })}
          </nav>
          {current
            ? <ChatThread key={current.id} channel={current} sender={sender} client={client} onLocateRoom={onLocateRoom}
              onRead={onRead} targetId={current.id === channelId ? targetId : null}
              focusRequest={focus.channelId === current.id ? focus.request : 0}
            />
            : <div className="chat-empty" role="status">{failed ? '频道暂时无法加载。' : '正在加载频道…'}</div>}
        </div>
      </div>
    </main>
  )
}
