/* Rallyloom — 交流室契约
   聊天与办公室数据一样「不由 Rallyloom 本地生成」：正式环境消息来自
   OA 协作后端（Phase C：OaChatClient，走超管配置的云端数据源）；
   演示环境用 DemoChatClient 在本机保存历史和附件。 */

export const GENERAL_CHANNEL_ID = 'general'
export const roomChannelId = (roomId: string) => `room:${roomId}`
export const ALL_MENTION = '@全体成员'

export interface ChatPerson {
  id: string
  name: string
}

export interface ChatParticipant extends ChatPerson {
  roomId?: string
  presence: import('@/data/office').Presence
  detail?: string
}

export type MentionTarget = { kind: 'all' } | { kind: 'member'; id: string }

export interface DraftMention {
  target: MentionTarget
  start: number
  end: number
}

export interface MentionOptions {
  people: readonly ChatParticipant[]
  allowAll: boolean
}

export interface ChatChannel {
  id: string
  name: string
  info: string
  roomId?: string
  peerId?: string
}

export interface ChatAttachment {
  id: string
  name: string
  size: number
}

export interface ChatDraft {
  text: string
  files: readonly File[]
  mentions?: readonly DraftMention[]
}

export interface ChatMessage {
  id: string
  channelId: string
  senderId: string
  senderName: string
  text: string
  sentAt: string
  attachments?: ChatAttachment[]
  mention?: 'all' | 'members'
  mentionRecipientIds?: string[]
}

export type ChatEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'typing'; senderName: string }
  | { type: 'seen' }

export interface ChatClient {
  readonly kind: 'demo-local' | 'oa-rest'
  readonly label: string
  /** 频道列表（正式环境由后端下发；演示环境 = 全员大厅 + 各房间频道） */
  channels(): Promise<ChatChannel[]>
  /** Provider-authorized channel roster, including the current member. Never infer it from directory visibility. */
  participants(channelId: string): Promise<readonly ChatParticipant[]>
  /** 拉取某频道的历史消息 */
  history(channelId: string, limit?: number): Promise<ChatMessage[]>
  /** 频道已有聊天记录条数；用于删除房间前的安全提示（演示实现不会触发示例消息播种） */
  historyCount(channelId: string): Promise<number>
  /** 发送消息；正式实现走后端，演示实现本地回显 + 自动回复 */
  send(channelId: string, draft: ChatDraft, sender: ChatPerson): Promise<ChatMessage>
  mentionOptions(channelId: string): Promise<MentionOptions>
  directChannel(personId: string): Promise<ChatChannel>
  unreadMentions(): Promise<ChatMessage[]>
  readMentions(messageIds: readonly string[]): Promise<void>
  subscribeMentions(callback: (message: ChatMessage) => void): () => void
  attachment(id: string): Promise<Blob>
  /** 订阅频道事件（新消息 / 正在输入 / 已读）；返回取消订阅 */
  subscribe(channelId: string, onEvent: (event: ChatEvent) => void): () => void
}

export function mentionsEveryone(text: string) {
  return /(?:^|[\s(（])(?:@全体成员|@全体|@所有人|@all)(?=$|[\s,.!?;:，。！？、；：)）])/iu.test(text)
}

export function isMentionFor(message: ChatMessage, personId: string) {
  if (message.senderId === personId) return false
  return message.mentionRecipientIds?.includes(personId) ?? (message.mention === 'all')
}

export function latestMessages(existing: readonly ChatMessage[], additions: readonly ChatMessage[], limit?: number) {
  const byId = new Map(existing.map((message) => [message.id, message]))
  for (const message of additions) byId.set(message.id, message)
  const sorted = [...byId.values()].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt) || a.id.localeCompare(b.id))
  return limit ? sorted.slice(-limit) : sorted
}

const MAX_ATTACHMENTS = 5
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

export function attachmentError(files: readonly File[]): string | null {
  if (files.length > MAX_ATTACHMENTS) return '每条消息最多添加 5 个附件。'
  if (files.reduce((size, file) => size + file.size, 0) > MAX_ATTACHMENT_BYTES) {
    return '每条消息的附件合计最多 20 MB。'
  }
  return null
}

export function attachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const unit = bytes < 1024 ** 2 ? 'KB' : 'MB'
  const value = bytes / (unit === 'KB' ? 1024 : 1024 ** 2)
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(value)} ${unit}`
}
