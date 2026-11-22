import type { ChatMessage, ChatPerson } from './types'

export interface DirectThread {
  id: string
  people: readonly ChatPerson[]
  participantIds: string[]
}

interface StoredAttachment {
  channelId?: string
  file: Blob
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error ?? new Error('无法保存交流室历史。'))
  })
}

function resultOf<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export class LocalChatStore {
  private opening?: Promise<IDBDatabase>

  private open() {
    if (!this.opening) {
      const request = indexedDB.open('rallyloom-demo-chat', 3)
      request.onupgradeneeded = ({ oldVersion }) => {
        const db = request.result
        const messages = oldVersion === 0
          ? db.createObjectStore('messages', { keyPath: 'id' })
          : request.transaction!.objectStore('messages')
        if (oldVersion === 0) db.createObjectStore('attachments')
        if (oldVersion < 2) {
          messages.createIndex('channelTime', ['channelId', 'sentAt', 'id'])
          messages.createIndex('mention', 'mention')
          db.createObjectStore('directs', { keyPath: 'id' }).createIndex('participant', 'participantIds', { multiEntry: true })
          db.createObjectStore('mentionReads', { keyPath: ['personId', 'messageId'] }).createIndex('person', 'personId')
        }
        messages.createIndex('mentionRecipient', 'mentionRecipientIds', { multiEntry: true })
      }
      this.opening = resultOf(request).catch((error: unknown) => {
        this.opening = undefined
        throw error
      })
    }
    return this.opening
  }

  async history(channelId: string, seed: () => ChatMessage[], limit?: number) {
    const db = await this.open()
    const tx = db.transaction('messages', 'readwrite')
    const done = transactionDone(tx)
    const messages = tx.objectStore('messages')
    const index = messages.index('channelTime')
    const range = IDBKeyRange.bound([channelId], [channelId, []])
    const query = limit ? new Promise<ChatMessage[]>((resolve, reject) => {
      const request = index.openCursor(range, 'prev')
      const newest: ChatMessage[] = []
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) { resolve(newest.reverse()); return }
        newest.push(cursor.value)
        if (newest.length === limit) resolve(newest.reverse())
        else cursor.continue()
      }
    }) : resultOf(index.getAll(range)) as Promise<ChatMessage[]>
    const load = query.then((existing) => {
      if (existing.length) return existing
      const initial = seed()
      for (const message of initial) messages.add(message)
      return limit ? initial.slice(-limit) : initial
    })
    const [history] = await Promise.all([load, done])
    return history
  }

  async directThreads(personId: string): Promise<DirectThread[]> {
    const db = await this.open()
    return resultOf(db.transaction('directs').objectStore('directs').index('participant').getAll(personId))
  }

  async saveDirect(thread: DirectThread) {
    const db = await this.open()
    const tx = db.transaction('directs', 'readwrite')
    const done = transactionDone(tx)
    tx.objectStore('directs').put(thread)
    await done
  }

  async unreadMentions(personId: string) {
    const db = await this.open()
    const tx = db.transaction(['messages', 'mentionReads'])
    const messages = tx.objectStore('messages')
    const [targeted, all, receipts]: [ChatMessage[], ChatMessage[], IDBValidKey[]] = await Promise.all([
      resultOf(messages.index('mentionRecipient').getAll(personId)),
      resultOf(messages.index('mention').getAll('all')),
      resultOf(tx.objectStore('mentionReads').index('person').getAllKeys(personId)),
    ])
    const read = new Set(receipts.map((key) => (key as [string, string])[1]))
    return [...targeted, ...all.filter(({ mentionRecipientIds }) => !mentionRecipientIds)].filter(({ id }) => !read.has(id))
  }

  async readMentions(personId: string, messageIds: readonly string[]) {
    const db = await this.open()
    const tx = db.transaction('mentionReads', 'readwrite')
    const done = transactionDone(tx)
    for (const messageId of messageIds) tx.objectStore('mentionReads').put({ personId, messageId })
    await done
  }

  async append(message: ChatMessage, files: readonly File[] = []) {
    const db = await this.open()
    const tx = db.transaction(['messages', 'attachments'], 'readwrite')
    const done = transactionDone(tx)
    const attachments = tx.objectStore('attachments')
    for (const [index, attachment] of (message.attachments ?? []).entries()) {
      attachments.add({ channelId: message.channelId, file: files[index] }, attachment.id)
    }
    tx.objectStore('messages').add(message)
    await done
  }

  async attachment(id: string): Promise<StoredAttachment> {
    const db = await this.open()
    const request = db.transaction('attachments').objectStore('attachments').get(id)
    const record: Blob | StoredAttachment | undefined = await resultOf(request)
    if (!record) throw new Error('找不到这个附件。')
    return record instanceof Blob ? { file: record } : record
  }
}
