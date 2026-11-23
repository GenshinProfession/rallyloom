import { LocalChatStore, type DirectThread } from './local-store'
import {
  ALL_MENTION, GENERAL_CHANNEL_ID, attachmentError, isMentionFor, mentionsEveryone, roomChannelId,
  type ChatChannel, type ChatClient, type ChatDraft, type ChatEvent, type ChatMessage, type ChatParticipant, type ChatPerson,
} from './types'

const GENERAL: ChatChannel = {
  id: GENERAL_CHANNEL_ID,
  name: '全员大厅',
  info: '团队公共频道',
}
const REPLIES = [
  '收到，我这边马上处理。',
  '好，我同步给相关同学跟进。',
  '刚对完一轮，目前进展正常。',
]
const store = new LocalChatStore()
const subscribers = new Map<string, Set<(event: ChatEvent) => void>>()
const mentionSubscribers = new Set<(message: ChatMessage) => void>()

export class DemoChatClient implements ChatClient {
  readonly kind = 'demo-local' as const
  readonly label = '本机演示'
  private readonly directIds = new Set<string>()

  constructor(
    private readonly rooms: readonly { id: string; name: string }[],
    private readonly members: readonly ChatParticipant[],
    private readonly viewer: ChatPerson | null,
  ) {}

  async channels(): Promise<ChatChannel[]> {
    const threads = this.viewer ? await store.directThreads(this.viewer.id) : []
    for (const { id } of threads) this.directIds.add(id)
    return [
      GENERAL,
      ...this.rooms.map(({ id, name }) => ({ id: roomChannelId(id), name, roomId: id, info: '房间频道' })),
      ...threads.map((thread) => this.asChannel(thread)),
    ]
  }

  async directChannel(personId: string): Promise<ChatChannel> {
    const peer = this.members.find(({ id }) => id === personId)
    if (!this.viewer || !peer || peer.id === this.viewer.id) throw new Error('无法与该成员开启私聊。')
    const participantIds = [this.viewer.id, peer.id].sort()
    const thread = {
      id: `direct:${JSON.stringify(participantIds)}`,
      people: [this.viewer, { id: peer.id, name: peer.name }],
      participantIds,
    }
    await store.saveDirect(thread)
    this.directIds.add(thread.id)
    return this.asChannel(thread)
  }

  async unreadMentions() {
    if (!this.viewer) return []
    const messages = await store.unreadMentions(this.viewer.id)
    return messages.filter((message) => this.isMentionForViewer(message))
  }

  async readMentions(messageIds: readonly string[]) {
    if (this.viewer && messageIds.length) await store.readMentions(this.viewer.id, messageIds)
  }

  subscribeMentions(callback: (message: ChatMessage) => void) {
    const emit = (message: ChatMessage) => { if (this.isMentionForViewer(message)) callback(message) }
    mentionSubscribers.add(emit)
    return () => { mentionSubscribers.delete(emit) }
  }

  async history(channelId: string, limit?: number): Promise<ChatMessage[]> {
    await this.checkChannel(channelId)
    return store.history(channelId, () => this.seed(channelId), limit)
  }

  async participants(channelId: string) {
    const direct = await this.checkChannel(channelId)
    return direct ? this.members.filter(({ id }) => direct.participantIds.includes(id)) : this.channelMembers(channelId)
  }

  async mentionOptions(channelId: string) {
    const direct = await this.checkChannel(channelId)
    return { allowAll: !direct, people: this.recipients(channelId, direct) }
  }

  async send(channelId: string, draft: ChatDraft, sender: ChatPerson): Promise<ChatMessage> {
    if (sender.id !== this.viewer?.id) throw new Error('登录身份已失效。')
    const direct = await this.checkChannel(channelId)
    const text = draft.text.trim()
    const error = attachmentError(draft.files)
    if (error) throw new Error(error)
    if (!text && !draft.files.length) throw new Error('请输入消息或添加附件。')

    const candidates = this.recipients(channelId, direct)
    const eligible = new Map(candidates.map((person) => [person.id, person]))
    let all = !direct && !draft.mentions && mentionsEveryone(draft.text)
    const recipients = new Set<string>()
    for (const { target, start, end } of draft.mentions ?? []) {
      const label = draft.text.slice(start, end)
      if (target.kind === 'all') {
        if (!direct && label === ALL_MENTION) all = true
      } else {
        const member = eligible.get(target.id)
        if (member && label === `@${member.name}`) recipients.add(member.id)
      }
    }

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      channelId,
      senderId: sender.id,
      senderName: sender.name,
      text,
      sentAt: new Date().toISOString(),
      attachments: draft.files.map((file) => ({ id: crypto.randomUUID(), name: file.name, size: file.size })),
      mention: all ? 'all' : recipients.size ? 'members' : undefined,
      mentionRecipientIds: all ? [...eligible.keys()] : recipients.size ? [...recipients] : undefined,
    }
    await this.publish(message, draft.files)

    const replier = candidates.find((member) => member.presence === 'online')
    if (replier) {
      setTimeout(() => this.emit(channelId, { type: 'typing', senderName: replier.name }), 600)
      setTimeout(() => {
        void this.publish({
          id: crypto.randomUUID(),
          channelId,
          senderId: replier.id,
          senderName: replier.name,
          text: REPLIES[Math.floor(Math.random() * REPLIES.length)],
          sentAt: new Date().toISOString(),
        }).catch(() => { /* 演示回复保存失败时跳过。 */ })
      }, 1700)
    }
    return message
  }

  async attachment(id: string) {
    if (!this.viewer) throw new Error('登录身份已失效。')
    const record = await store.attachment(id)
    if (record.channelId) await this.checkChannel(record.channelId)
    return record.file
  }

  subscribe(channelId: string, callback: (event: ChatEvent) => void): () => void {
    if (!this.viewer || (!this.isPublic(channelId) && !this.directIds.has(channelId))) return () => {}
    const listeners = subscribers.get(channelId) ?? new Set()
    listeners.add(callback)
    subscribers.set(channelId, listeners)
    return () => {
      listeners.delete(callback)
      if (!listeners.size) subscribers.delete(channelId)
    }
  }

  private emit(channelId: string, event: ChatEvent) {
    for (const callback of subscribers.get(channelId) ?? []) callback(event)
  }

  private async publish(message: ChatMessage, files?: readonly File[]) {
    await store.append(message, files)
    this.emit(message.channelId, { type: 'message', message })
    if (message.mention) for (const callback of mentionSubscribers) callback(message)
  }

  private asChannel(thread: DirectThread): ChatChannel {
    const peer = thread.people.find(({ id }) => id !== this.viewer?.id)!
    const member = this.members.find(({ id }) => id === peer.id)
    return { id: thread.id, name: member?.name ?? peer.name, info: '私聊', peerId: peer.id, roomId: member?.roomId }
  }

  private isPublic(channelId: string) {
    return channelId === GENERAL_CHANNEL_ID || this.rooms.some(({ id }) => roomChannelId(id) === channelId)
  }

  private async checkChannel(channelId: string) {
    if (this.isPublic(channelId) && this.viewer) return null
    const direct = this.viewer && (await store.directThreads(this.viewer.id)).find(({ id }) => id === channelId)
    if (!direct) throw new Error('此会话不可用。')
    return direct
  }

  private channelMembers(channelId: string) {
    return channelId === GENERAL_CHANNEL_ID
      ? this.members
      : this.members.filter(({ roomId }) => roomId && roomChannelId(roomId) === channelId)
  }

  private recipients(channelId: string, direct: DirectThread | null) {
    const audience = direct
      ? this.members.filter(({ id }) => direct.participantIds.includes(id))
      : this.channelMembers(channelId)
    return audience.filter(({ id }) => id !== this.viewer?.id)
  }

  private isMentionForViewer(message: ChatMessage) {
    if (!this.viewer || !isMentionFor(message, this.viewer.id)) return false
    if (message.mentionRecipientIds) return true
    return this.isPublic(message.channelId) && this.members.some(({ id }) => id === message.senderId) &&
      this.channelMembers(message.channelId).some(({ id }) => id === this.viewer?.id)
  }

  private seed(channelId: string): ChatMessage[] {
    const now = Date.now()
    const message = (sender: { id: string; name: string }, text: string, minutesAgo: number): ChatMessage => ({
      id: crypto.randomUUID(), channelId, senderId: sender.id, senderName: sender.name, text,
      sentAt: new Date(now - minutesAgo * 60_000).toISOString(),
    })
    if (channelId === GENERAL_CHANNEL_ID) {
      const lin = this.members.find(({ name }) => name === '林晓') ?? { id: 'demo-lin', name: '林晓' }
      const zhou = this.members.find(({ name }) => name === '周璐') ?? { id: 'demo-zhou', name: '周璐' }
      const zhang = this.members.find(({ name }) => name === '张涛') ?? { id: 'demo-zhang', name: '张涛' }
      return [
        message(lin, '各位，大促目标已同步到活动指挥台，值班同学留意首响与库存。', 26),
        message(lin, '遇到异常可以直接在大厅里同步。', 25),
        message(zhou, '收到，活动价格核对刚完成，有变动我随时在这里同步。', 22),
        message(zhang, '投放素材十点前全部上线，盯盘的同学有异常直接喊我。', 15),
      ]
    }
    const room = this.rooms.find(({ id }) => roomChannelId(id) === channelId)
    const [first, second] = this.channelMembers(channelId).filter(({ presence }) => presence === 'online')
    if (!room || !first) return []
    return [
      message(first, `今天的重点放在「${room.name}」待办上，有情况我在频道里同步。`, 34),
      ...(second ? [message(second, '收到，先按这个节奏推进。', 30)] : []),
    ]
  }
}
