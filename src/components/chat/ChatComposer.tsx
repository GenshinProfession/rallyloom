import { useEffect, useRef, useState } from 'react'
import { AtSign, File, Paperclip, SendHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { attachmentError, attachmentSize, type ChatClient, type ChatDraft } from '@/lib/chat/types'
import { useMentionPicker } from './MentionPicker'

export function ChatComposer({ onSend, disabled, client, channelId, focusRequest }: {
  onSend: (draft: ChatDraft) => Promise<void>
  disabled: boolean
  client: ChatClient
  channelId: string
  focusRequest: number
}) {
  const mention = useMentionPicker<HTMLTextAreaElement>(client, channelId)
  const { text, mentions, editor } = mention
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const picker = useRef<HTMLInputElement>(null)
  const unavailable = sending || disabled
  const canSend = !unavailable && (text.trim() !== '' || files.length > 0)

  useEffect(() => {
    if (focusRequest && !disabled) editor.current?.focus({ preventScroll: true })
  }, [focusRequest, disabled, editor])

  async function send() {
    if (!canSend) return
    setSending(true)
    setError('')
    try {
      await onSend({ text, files, mentions })
      mention.clear()
      setFiles([])
    } catch {
      setError('消息未能发送。内容和附件已保留，可以重试。')
    } finally {
      setSending(false)
    }
  }

  return (
    <form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send() }}>
      {files.length > 0 && (
        <ul className="chat-draft-files" aria-label="待发送附件">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.lastModified}-${index}`}>
              <File size={14} aria-hidden />
              <span title={file.name}>{file.name}</span>
              <small>{attachmentSize(file.size)}</small>
              <button type="button" className="ui-press" disabled={unavailable} aria-label={`移除附件 ${file.name}`} onClick={() => {
                setFiles((current) => current.filter((_, i) => i !== index))
                setError('')
              }}><X size={13} aria-hidden /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="chat-mention-anchor">
      <textarea
        {...mention.editorProps}
        aria-label="消息内容"
        placeholder="输入消息"
        ref={editor}
        rows={2}
        value={text}
        disabled={disabled}
        readOnly={sending}
        onKeyDown={(event) => {
          if (mention.handleKey(event)) return
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
            event.preventDefault()
            void send()
          }
        }}
      />
      {mention.picker}
      </div>
      <div className="chat-composer-tools">
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            const next = [...files, ...Array.from(event.currentTarget.files ?? [])]
            event.currentTarget.value = ''
            const issue = attachmentError(next)
            setError(issue ?? '')
            if (!issue) setFiles(next)
            editor.current?.focus()
          }}
        />
        <Button type="button" variant="ghost" size="icon" className="size-7" disabled={unavailable} aria-label="添加附件" title="添加附件" onClick={() => picker.current?.click()}>
          <Paperclip size={15} strokeWidth={1.7} />
        </Button>
        {mention.enabled && (
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-ui-label" disabled={unavailable}
            aria-label="提及成员" onClick={mention.startMention}
          ><AtSign size={14} strokeWidth={1.7} /> 提及</Button>
        )}
        {error ? <span className="chat-composer-error" role="alert">{error}</span>
          : <span className="chat-composer-hint">Enter 发送 · Shift + Enter 换行</span>}
        <Button type="submit" size="sm" className="ml-auto h-7 gap-1.5 px-2.5 text-ui-label" disabled={!canSend}>
          <SendHorizontal size={14} strokeWidth={1.7} /> {sending ? '发送中' : '发送'}
        </Button>
      </div>
    </form>
  )
}
