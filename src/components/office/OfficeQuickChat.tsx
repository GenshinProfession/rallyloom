import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight, AtSign, ClipboardPlus, Hash, MessageCircle, Paperclip, SendHorizontal, Swords, X } from 'lucide-react'
import { isMentionFor, type ChatChannel, type ChatClient, type ChatMessage, type ChatPerson } from '@/lib/chat/types'
import { useChatThread } from '@/lib/chat/use-chat-thread'
import { useMentionPicker } from '@/components/chat/MentionPicker'
import './office-chat.css'

const clock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

function initials(name: string) {
  const clean = name.trim()
  if (!clean) return '·'
  const parts = clean.split(/\s+/)
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase()
  return clean.slice(0, 2)
}

/**
 * 游戏式对话条：点击人物/房间后从画面底部升起，像 RPG 对话框一样承载最近消息与快速回复。
 * 不再使用锚定气泡（气泡会挡住人物与工位）。
 */
export function OfficeQuickChat({ channel, client, sender, targetId, onRead, onConvert, onOpen, onDismiss }: {
  channel: ChatChannel
  anchor?: HTMLElement
  client: ChatClient
  sender: ChatPerson
  targetId?: string
  onRead?: (ids: readonly string[]) => void
  onConvert?: (message: ChatMessage) => void
  onOpen: () => void
  onDismiss: () => void
}) {
  const feed = useRef<HTMLOListElement>(null)
  const mention = useMentionPicker<HTMLInputElement>(client, channel.id)
  const { text, mentions, editor } = mention
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const thread = useChatThread(client, channel.id, targetId ? undefined : 5)
  const { messages, status } = thread
  const latest = messages.slice(-6)
  const target = targetId ? messages.find(({ id }) => id === targetId) : undefined
  const visible = target && !latest.some(({ id }) => id === target.id) ? [target, ...latest] : latest
  const direct = Boolean(channel.peerId)

  useEffect(() => {
    if (target && isMentionFor(target, sender.id)) onRead?.([target.id])
  }, [onRead, sender.id, target])

  useLayoutEffect(() => {
    const list = feed.current
    if (!list) return
    const focus = list.querySelector<HTMLElement>('[data-message-focus]')
    list.scrollTop = focus ? focus.offsetTop - list.offsetTop : list.scrollHeight
  }, [messages, targetId])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const form = feed.current?.closest('.office-dialogue')?.querySelector('input')
      if (form && document.activeElement === form && form.value) return
      onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  async function reply() {
    if (!text.trim() || sending || status !== 'ready') return
    setSending(true)
    setError('')
    try {
      await thread.send({ text, files: [], mentions }, sender)
      mention.clear()
    } catch {
      setError('发送失败，可以重试。')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="office-dialogue" role="dialog" aria-label={`${channel.name} · 对话`} data-quick-chat={channel.id}>
      <div className="office-dialogue-stage" aria-hidden>
        <span className="office-dialogue-aura" />
        <span className="office-dialogue-avatar">{initials(channel.name)}</span>
        <span className="office-dialogue-scene">
          {direct ? <MessageCircle size={13} /> : <Hash size={13} />}
          {direct ? '私聊频道' : '房间交流室'}
        </span>
        <strong className="office-dialogue-name">{channel.name}</strong>
        <small className="office-dialogue-role">{direct ? '一对一对话' : channel.info || '在岗成员都会看到'}</small>
      </div>
      <div className="office-dialogue-body">
        <header className="office-dialogue-head">
          <span className="office-dialogue-tag"><Swords size={12} /> 对话</span>
          <button type="button" className="office-dialogue-link" onClick={onOpen} title="打开完整交流室">
            进入交流室 <ArrowUpRight size={12} />
          </button>
          <button type="button" className="office-dialogue-close ui-press" title="关闭对话（Esc）" aria-label="关闭对话" onClick={onDismiss}>
            <X size={14} />
          </button>
        </header>
        {status === 'error' && <p className="office-chat-empty" role="status">消息加载失败。<button type="button" onClick={thread.retry}>重试</button></p>}
        {status === 'loading' && <p className="office-chat-empty" role="status">加载中…</p>}
        {status === 'ready' && targetId && !target && <p className="office-chat-empty" role="status">原消息已不可用。</p>}
        {status === 'ready' && !messages.length && <p className="office-chat-empty">还没有对话，先打个招呼。</p>}
        <ol className="office-dialogue-feed" ref={feed} aria-label="对话记录">
          {visible.map((message) => (
            <li key={message.id} className="office-dialogue-line" data-quick-message={message.id}
              data-own={message.senderId === sender.id}
              data-message-focus={message.id === targetId || undefined}
              data-mention={message.mention === 'all' || isMentionFor(message, sender.id) ? message.mention : undefined}>
              <span className="office-dialogue-speaker">{message.senderId === sender.id ? '我' : message.senderName}</span>
              <span className="office-dialogue-say">
                {message.mention === 'all' && <span className="office-chat-all"><AtSign size={11} /> 全体提醒</span>}
                {message.mention === 'members' && isMentionFor(message, sender.id) && <span className="office-chat-all"><AtSign size={11} /> 提到了你</span>}
                {message.text && <span className="office-dialogue-text" title={message.text}>{message.text}</span>}
                {!!message.attachments?.length && <small className="office-dialogue-file"><Paperclip size={11} /> {message.attachments.length} 个附件 · 在交流室查看</small>}
                {onConvert && message.text.trim() && <button type="button" className="office-chat-convert ui-press" onClick={() => onConvert(message)}>
                  <ClipboardPlus size={12} /> 转为任务
                </button>}
              </span>
              <time className="office-dialogue-time" dateTime={message.sentAt}>{clock.format(new Date(message.sentAt))}</time>
            </li>
          ))}
        </ol>
        <form className="office-dialogue-form chat-mention-anchor" onSubmit={(event) => { event.preventDefault(); void reply() }}>
          <input {...mention.editorProps} ref={editor} aria-label="对话输入" placeholder={`对 ${channel.name} 说点什么…`} value={text} readOnly={sending}
            onKeyDown={(event) => {
              if (mention.handleKey(event)) return
              if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return
              event.preventDefault()
              void reply()
            }}
          />
          {mention.picker}
          {mention.enabled && <button type="button" className="ui-press" title="提及成员" aria-label="提及成员"
            disabled={sending || status !== 'ready'} onClick={mention.startMention}><AtSign size={14} /></button>}
          <button type="submit" className="office-dialogue-send ui-press" aria-label="发送对话" disabled={sending || status !== 'ready' || !text.trim()}>
            <SendHorizontal size={15} />
          </button>
        </form>
        <p className="office-dialogue-hint">Enter 发送 · Esc 关闭 · 对话会同步到交流室</p>
        {error && <p className="office-chat-send-error" role="alert">{error}</p>}
      </div>
    </section>
  )
}
