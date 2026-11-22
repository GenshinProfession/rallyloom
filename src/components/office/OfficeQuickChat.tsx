import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight, AtSign, ClipboardPlus, Hash, MessageCircle, Paperclip, SendHorizontal, X } from 'lucide-react'
import { isMentionFor, type ChatChannel, type ChatClient, type ChatMessage, type ChatPerson } from '@/lib/chat/types'
import { useChatThread } from '@/lib/chat/use-chat-thread'
import { useMentionPicker } from '@/components/chat/MentionPicker'
import './office-chat.css'

const clock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

export function OfficeQuickChat({ channel, anchor, client, sender, targetId, onRead, onConvert, onOpen, onDismiss }: {
  channel: ChatChannel
  anchor: HTMLElement
  client: ChatClient
  sender: ChatPerson
  targetId?: string
  onRead?: (ids: readonly string[]) => void
  onConvert?: (message: ChatMessage) => void
  onOpen: () => void
  onDismiss: () => void
}) {
  const pane = useRef<HTMLDivElement>(null)
  const feed = useRef<HTMLOListElement>(null)
  const mention = useMentionPicker<HTMLInputElement>(client, channel.id)
  const { text, mentions, editor } = mention
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const thread = useChatThread(client, channel.id, targetId ? undefined : 5)
  const { messages, status } = thread
  const latest = messages.slice(-5)
  const target = targetId ? messages.find(({ id }) => id === targetId) : undefined
  const visible = target && !latest.some(({ id }) => id === target.id) ? [target, ...latest] : latest

  useEffect(() => {
    if (target && isMentionFor(target, sender.id)) onRead?.([target.id])
  }, [onRead, sender.id, target])

  useLayoutEffect(() => {
    const panel = pane.current
    if (!panel) return
    if (!panel.matches(':popover-open')) panel.showPopover()
    function place() {
      if (!panel || !anchor.isConnected) return
      const at = anchor.getBoundingClientRect()
      const { offsetWidth: width, offsetHeight: height } = panel
      const center = (at.left + at.right) / 2
      const x = Math.max(12, Math.min(window.innerWidth - width - 12, center - width / 2))
      const above = at.bottom + height + 22 > window.innerHeight && at.top > at.bottom + height - window.innerHeight
      const y = Math.max(12, Math.min(window.innerHeight - height - 12, above ? at.top - height - 10 : at.bottom + 10))
      panel.dataset.side = above ? 'above' : 'below'
      panel.style.left = `${x}px`
      panel.style.top = `${y}px`
      panel.style.setProperty('--office-chat-arrow', `${Math.max(22, Math.min(width - 22, center - x))}px`)
    }
    place()
    editor.current?.focus({ preventScroll: true })
    let frame = 0
    function schedulePlacement() {
      if (frame) return
      frame = requestAnimationFrame(() => { frame = 0; place() })
    }
    const resize = new ResizeObserver(schedulePlacement)
    resize.observe(panel)
    const marker = anchor.closest('.office-room-marker, .office-person-label')
    const moved = new MutationObserver(schedulePlacement)
    if (marker) moved.observe(marker, { attributes: true, attributeFilter: ['style'] })
    window.addEventListener('resize', schedulePlacement)
    return () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      moved.disconnect()
      window.removeEventListener('resize', schedulePlacement)
    }
  }, [anchor, editor])

  useLayoutEffect(() => {
    const list = feed.current
    if (!list) return
    const focus = list.querySelector<HTMLElement>('[data-message-focus]')
    list.scrollTop = focus ? focus.offsetTop - list.offsetTop : list.scrollHeight
  }, [messages, targetId])

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
    <div ref={pane} popover="auto" role="dialog" aria-label={`${channel.name} · 快速聊天`}
      className="office-chat-popover" data-quick-chat={channel.id}
      onToggle={(event) => { if (event.newState === 'closed') onDismiss() }}
    >
      <header className="office-chat-head">
        <span className="office-chat-icon">{channel.peerId ? <MessageCircle size={15} /> : <Hash size={15} />}</span>
        <button type="button" className="office-chat-title" title="双击打开完整对话"
          onClick={(event) => { if (event.detail === 0) onOpen() }} onDoubleClick={onOpen}
        ><strong>{channel.name}</strong><small>最近 5 条消息</small></button>
        <button type="button" className="office-chat-tool ui-press" title="打开完整对话" aria-label="打开完整对话" onClick={onOpen}><ArrowUpRight size={15} /></button>
        <button type="button" className="office-chat-tool ui-press" title="关闭快速聊天" aria-label="关闭快速聊天" onClick={onDismiss}><X size={15} /></button>
      </header>
      {status === 'error' && <p className="office-chat-empty" role="status">消息加载失败。<button type="button" onClick={thread.retry}>重试</button></p>}
      {status === 'loading' && <p className="office-chat-empty" role="status">加载中…</p>}
      {status === 'ready' && targetId && !target && <p className="office-chat-empty" role="status">原消息已不可用。</p>}
      {status === 'ready' && !messages.length && <p className="office-chat-empty">还没有消息，发一句打个招呼。</p>}
      <ol className="office-chat-feed" ref={feed} aria-label="近期消息">
        {visible.map((message) => (
          <li key={message.id} data-quick-message={message.id} data-own={message.senderId === sender.id}
            data-message-focus={message.id === targetId || undefined}
            data-mention={message.mention === 'all' || isMentionFor(message, sender.id) ? message.mention : undefined}>
            <div className="office-chat-message-meta">
              <span>{message.senderId === sender.id ? '我' : message.senderName}</span>
              <time dateTime={message.sentAt}>{clock.format(new Date(message.sentAt))}</time>
            </div>
            <div className="office-chat-bubble">
              {message.mention === 'all' && <span className="office-chat-all"><AtSign size={11} /> 全体提醒</span>}
              {message.mention === 'members' && isMentionFor(message, sender.id) && <span className="office-chat-all"><AtSign size={11} /> 提到了你</span>}
              {message.text && <p title={message.text}>{message.text}</p>}
              {!!message.attachments?.length && <small><Paperclip size={11} /> {message.attachments.length} 个附件 · 在交流室查看</small>}
              {onConvert && message.text.trim() && <button type="button" className="office-chat-convert ui-press" onClick={() => onConvert(message)}>
                <ClipboardPlus size={12} /> 转为任务
              </button>}
            </div>
          </li>
        ))}
      </ol>
      <form className="office-chat-form chat-mention-anchor" onSubmit={(event) => { event.preventDefault(); void reply() }}>
        <input {...mention.editorProps} ref={editor} aria-label="快速回复" placeholder="快速回一句…" value={text} readOnly={sending}
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
        <button type="submit" className="ui-press" aria-label="发送快速回复" disabled={sending || status !== 'ready' || !text.trim()}>
          <SendHorizontal size={15} />
        </button>
      </form>
      {error && <p className="office-chat-send-error" role="alert">{error}</p>}
    </div>
  )
}
