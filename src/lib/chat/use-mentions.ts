import { useCallback, useEffect, useMemo, useState } from 'react'
import { latestMessages, type ChatClient, type ChatMessage } from './types'

export function useMentions(client: ChatClient | null, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<{ client: ChatClient; messages: ChatMessage[] }>()

  useEffect(() => {
    if (!enabled || !client) { setSnapshot(undefined); return }
    let active = true
    const add = (messages: ChatMessage[]) => setSnapshot((current) => ({
      client,
      messages: latestMessages(current?.client === client ? current.messages : [], messages),
    }))
    const off = client.subscribeMentions((message) => add([message]))
    void client.unreadMentions().then((messages) => { if (active) add(messages) }, () => { /* live alerts still work */ })
    return () => { active = false; off() }
  }, [client, enabled])

  const newest = useMemo(() => {
    const byChannel = new Map<string, ChatMessage>()
    if (enabled && snapshot?.client === client) {
      for (const message of snapshot.messages) byChannel.set(message.channelId, message)
    }
    return byChannel
  }, [client, enabled, snapshot])

  const markRead = useCallback((ids: readonly string[]) => {
    if (!client || !ids.length) return
    const read = new Set(ids)
    void client.readMentions(ids).then(() => {
      setSnapshot((current) => current?.client === client
        ? { client, messages: current.messages.filter(({ id }) => !read.has(id)) }
        : current)
    }, () => { /* a failed receipt leaves the alert visible */ })
  }, [client])

  return { newest, markRead }
}
