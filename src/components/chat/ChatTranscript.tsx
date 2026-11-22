import { Fragment, useState } from 'react'
import { Download, FileText } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { attachmentSize, isMentionFor, type ChatAttachment, type ChatClient, type ChatMessage } from '@/lib/chat/types'

const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
const fullTime = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
})
const shortDate = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' })
const fullDate = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
const GROUP_GAP_MS = 5 * 60 * 1000

function dayOf(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function separates(previous: ChatMessage | undefined, current: ChatMessage) {
  if (!previous) return true
  const earlier = new Date(previous.sentAt)
  const later = new Date(current.sentAt)
  return dayOf(earlier) !== dayOf(later) || later.getTime() - earlier.getTime() >= GROUP_GAP_MS
}

function separatorLabel(date: Date, today: Date) {
  if (dayOf(date) === dayOf(today)) return time.format(date)
  const day = (date.getFullYear() === today.getFullYear() ? shortDate : fullDate).format(date)
  return `${day} ${time.format(date)}`
}

function Attachment({ attachment, client }: { attachment: ChatAttachment; client: ChatClient }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  async function download() {
    setStatus('loading')
    try {
      const blob = await client.attachment(attachment.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = attachment.name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div>
      <button type="button" disabled={status === 'loading'} className="chat-attachment ui-press" onClick={() => void download()} aria-label={`下载 ${attachment.name}`}>
        <FileText size={18} strokeWidth={1.6} aria-hidden />
        <span><strong>{attachment.name}</strong><small>{attachmentSize(attachment.size)}</small></span>
        <Download size={15} strokeWidth={1.7} aria-hidden />
      </button>
      {status === 'error' && <small className="chat-composer-error" role="alert">下载失败，请重试。</small>}
    </div>
  )
}

export function ChatTranscript({ messages, meId, client, targetId }: {
  messages: readonly ChatMessage[]
  meId: string
  client: ChatClient
  targetId?: string | null
}) {
  const now = new Date()
  return (
    <ol className="chat-transcript" aria-label="消息记录">
      {messages.map((message, index) => {
        const previous = messages[index - 1]
        const split = separates(previous, message)
        const groupStart = split || previous.senderId !== message.senderId
        const own = message.senderId === meId
        const date = new Date(message.sentAt)
        const timestamp = fullTime.format(date)
        return (
          <Fragment key={message.id}>
            {split && <li className="chat-time-divider"><time data-chat-time dateTime={message.sentAt}>{separatorLabel(date, now)}</time></li>}
            <li id={`chat-message-${message.id}`} className="chat-message" data-own={own} data-group-start={groupStart} data-message={message.id}
              data-mention={message.mention === 'all' || isMentionFor(message, meId) ? message.mention : undefined} data-target={message.id === targetId || undefined}
            >
              {!own && <div className="chat-message-avatar">
                {groupStart && <Avatar className="size-7"><AvatarFallback className="bg-[#e3eaf1] text-ui-label text-[#466280]">{message.senderName.slice(0, 1)}</AvatarFallback></Avatar>}
              </div>}
              <div className="chat-message-stack">
                {!own && groupStart && <span className="chat-sender">{message.senderName}</span>}
                <div className="chat-bubble" title={timestamp}>
                  <time className="sr-only" dateTime={message.sentAt}>{timestamp}</time>
                  {message.mention === 'members' && isMentionFor(message, meId) && <small className="chat-mentioned-you">提到了你</small>}
                  {message.text && <p>{message.text}</p>}
                  {message.attachments?.map((attachment) => <Attachment key={attachment.id} attachment={attachment} client={client} />)}
                </div>
              </div>
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
