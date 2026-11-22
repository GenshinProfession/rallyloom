import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { AtSign } from 'lucide-react'
import { ALL_MENTION, type ChatClient, type DraftMention, type MentionOptions, type MentionTarget } from '@/lib/chat/types'
import './mention-picker.css'

type Editor = HTMLInputElement | HTMLTextAreaElement
type Candidate = { target: MentionTarget; label: string; detail?: string }

function shiftMentions(mentions: DraftMention[], before: string, after: string) {
  let start = 0
  while (start < Math.min(before.length, after.length) && before[start] === after[start]) start++
  let previousEnd = before.length
  let nextEnd = after.length
  while (previousEnd > start && nextEnd > start && before[previousEnd - 1] === after[nextEnd - 1]) {
    previousEnd--
    nextEnd--
  }
  const offset = nextEnd - previousEnd
  return mentions.flatMap((mention) => {
    if (mention.end <= start) return [mention]
    if (mention.start >= previousEnd) return [{ ...mention, start: mention.start + offset, end: mention.end + offset }]
    return []
  })
}

export function useMentionPicker<T extends Editor>(client: ChatClient, channelId: string) {
  const editor = useRef<T>(null)
  const id = useId()
  const [text, setText] = useState('')
  const [mentions, setMentions] = useState<DraftMention[]>([])
  const [options, setOptions] = useState<MentionOptions>()
  const [query, setQuery] = useState<{ start: number; end: number; value: string }>()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let active = true
    setOptions(undefined)
    void client.mentionOptions(channelId).then((result) => {
      if (active) setOptions(result)
    }, () => { /* The composer remains available if the member list is unavailable. */ })
    return () => { active = false }
  }, [client, channelId])

  const candidates: Candidate[] = []
  if (query && options) {
    const term = query.value.toLocaleLowerCase()
    if (options.allowAll && ['全体成员', '全体', '所有人', 'all'].some((label) => label.includes(term))) {
      candidates.push({ target: { kind: 'all' }, label: ALL_MENTION.slice(1), detail: '仅当前频道' })
    }
    for (const person of options.people) {
      if (!person.name.toLocaleLowerCase().includes(term) && !person.detail?.toLocaleLowerCase().includes(term)) continue
      candidates.push({ target: { kind: 'member', id: person.id }, label: person.name, detail: person.detail })
    }
  }
  const selected = Math.min(index, candidates.length - 1)
  const open = query !== undefined && options !== undefined

  function findQuery(input: Editor, tokens: DraftMention[]) {
    const end = input.selectionEnd ?? 0
    if (end !== input.selectionStart) { setQuery(undefined); return }
    const match = /(?:^|[^\w@＠])[@＠]([^\s@＠,，。;；!?！？]*)$/u.exec(input.value.slice(0, end))
    const value = match?.[1]
    if (value === undefined) { setQuery(undefined); return }
    const start = end - value.length - 1
    if (tokens.some((mention) => mention.start <= start && end <= mention.end)) { setQuery(undefined); return }
    setIndex(0)
    setQuery((current) => current?.start === start && current.end === end && current.value === value ? current : { start, end, value })
  }

  function change(input: Editor, composing: boolean) {
    const next = shiftMentions(mentions, text, input.value)
    setText(input.value)
    setMentions(next)
    if (!composing) findQuery(input, next)
  }

  function focusAt(cursor: number) {
    requestAnimationFrame(() => {
      editor.current?.focus({ preventScroll: true })
      editor.current?.setSelectionRange(cursor, cursor)
    })
  }

  function startMention() {
    const start = editor.current?.selectionStart ?? text.length
    const end = editor.current?.selectionEnd ?? start
    const marker = /[\w@＠]/u.test(text.charAt(start - 1)) ? ' @' : '@'
    const next = text.slice(0, start) + marker + text.slice(end)
    const cursor = start + marker.length
    setMentions(shiftMentions(mentions, text, next))
    setText(next)
    setIndex(0)
    setQuery({ start: cursor - 1, end: cursor, value: '' })
    focusAt(cursor)
  }

  function choose(candidate: Candidate) {
    if (!query) return
    const label = `@${candidate.label}`
    const end = query.start + label.length
    const next = text.slice(0, query.start) + label + ' ' + text.slice(query.end)
    setMentions([...shiftMentions(mentions, text, next), { target: candidate.target, start: query.start, end }])
    setText(next)
    setQuery(undefined)
    focusAt(end + 1)
  }

  function handleKey(event: KeyboardEvent<T>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229 || !open) return false
    if (event.key === 'Escape') {
      event.preventDefault()
      setQuery(undefined)
      return true
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!candidates.length) return false
      event.preventDefault()
      const next = (selected + (event.key === 'ArrowDown' ? 1 : -1) + candidates.length) % candidates.length
      setIndex(next)
      document.getElementById(`${id}-${next}`)?.scrollIntoView({ block: 'nearest' })
      return true
    }
    if (event.key !== 'Enter' || event.shiftKey) return false
    event.preventDefault()
    if (selected >= 0) choose(candidates[selected])
    else setQuery(undefined)
    return true
  }

  return {
    text, mentions, editor, enabled: Boolean(options && (options.allowAll || options.people.length)),
    editorProps: {
      'aria-autocomplete': 'list' as const,
      'aria-controls': open ? id : undefined,
      'aria-activedescendant': open && selected >= 0 ? `${id}-${selected}` : undefined,
      onChange: (event: React.ChangeEvent<T>) => change(event.currentTarget, (event.nativeEvent as InputEvent).isComposing),
      onCompositionEnd: (event: React.CompositionEvent<T>) => findQuery(event.currentTarget, mentions),
      onClick: (event: React.MouseEvent<T>) => { if (open) findQuery(event.currentTarget, mentions) },
      onKeyUp: (event: KeyboardEvent<T>) => {
        if (open && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) findQuery(event.currentTarget, mentions)
      },
      onBlur: () => setQuery(undefined),
    },
    handleKey, startMention,
    clear: () => { setText(''); setMentions([]); setQuery(undefined) },
    picker: open ? (
      <div className="chat-mention-picker" aria-label="提及候选" role="listbox" id={id}>
        {!candidates.length && <div className="chat-mention-empty">没有匹配的成员</div>}
        {candidates.map((candidate, position) => (
          <div key={candidate.target.kind === 'all' ? 'all' : `person:${candidate.target.id}`} id={`${id}-${position}`}
            role="option" aria-selected={selected === position} className="chat-mention-option"
            onMouseDown={(event) => event.preventDefault()} onClick={() => choose(candidate)}
          >
            <span className="chat-mention-avatar" aria-hidden="true">{candidate.target.kind === 'all' ? <AtSign size={13} /> : candidate.label.slice(0, 1)}</span>
            <span className="chat-mention-name">{candidate.label}</span>
            {candidate.detail && <small title={candidate.detail}>{candidate.detail}</small>}
          </div>
        ))}
      </div>
    ) : null,
  }
}
