import { useEffect, useState } from 'react'
import { latestMessages, type ChatClient, type ChatDraft, type ChatMessage, type ChatPerson } from './types'

export function useChatThread(client: ChatClient, channelId: string, limit?: number) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [typing, setTyping] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const recordsTyping = limit === undefined

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const unsubscribe = client.subscribe(channelId, (event) => {
      if (event.type === 'message') {
        setMessages((previous) => latestMessages(previous, [event.message], limit))
        if (recordsTyping) setTyping('')
      } else if (event.type === 'typing' && recordsTyping) {
        setTyping(event.senderName)
        clearTimeout(timer)
        timer = setTimeout(() => setTyping(''), 2200)
      }
    })
    void client.history(channelId, limit).then(
      (list) => {
        if (!active) return
        setMessages((previous) => latestMessages(list, previous, limit))
        setStatus('ready')
      },
      () => { if (active) setStatus('error') },
    )
    return () => {
      active = false
      clearTimeout(timer)
      unsubscribe()
    }
  }, [attempt, channelId, client, limit, recordsTyping])

  async function send(draft: ChatDraft, sender: ChatPerson) {
    const message = await client.send(channelId, draft, sender)
    setMessages((previous) => latestMessages(previous, [message], limit))
  }

  function retry() {
    setStatus('loading')
    setAttempt((value) => value + 1)
  }

  return { messages, typing, status, send, retry }
}
