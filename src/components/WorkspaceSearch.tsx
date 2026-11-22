import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { LayoutGrid, Search, UserRound, X } from 'lucide-react'

export interface WorkspaceSearchItem {
  label: string
  roomId: string
  roomName: string
  memberId?: string
}

export function WorkspaceSearch({
  items,
  onSelect,
  collapsed,
  onExpand,
}: {
  items: readonly WorkspaceSearchItem[]
  onSelect: (item: WorkspaceSearchItem) => void
  collapsed: boolean
  onExpand: (event: MouseEvent<HTMLButtonElement>) => void
}) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const focusOnExpand = useRef(false)
  const list = useRef<HTMLUListElement>(null)
  const listId = useId()
  const value = query.trim().toLocaleLowerCase()
  const results = value ? items.filter(({ label, roomName }) =>
    label.toLocaleLowerCase().includes(value) || roomName.toLocaleLowerCase().includes(value),
  ).slice(0, 7) : []
  const showResults = !collapsed && active && Boolean(value)

  useEffect(() => {
    if (collapsed || !focusOnExpand.current) return
    focusOnExpand.current = false
    input.current?.focus()
  }, [collapsed])

  function open(item: WorkspaceSearchItem) {
    onSelect(item)
    setQuery('')
    setActive(false)
  }

  return (
    <div
      className="workspace-search"
      role="search"
      onFocus={() => setActive(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setActive(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && showResults) {
          event.stopPropagation()
          input.current?.focus()
          setActive(false)
        }
      }}
    >
      <div className="workspace-search-field sidebar-control">
        <button
          type="button"
          className="sidebar-search-trigger"
          aria-label="搜索成员或房间"
          aria-hidden={!collapsed || undefined}
          tabIndex={collapsed ? 0 : -1}
          onClick={(event) => {
            if (collapsed) {
              focusOnExpand.current = true
              onExpand(event)
            } else input.current?.focus()
          }}
        >
          <Search size={14} strokeWidth={1.7} aria-hidden="true" />
        </button>
        <input
          ref={input}
          className="sidebar-copy"
          type="search"
          disabled={collapsed}
          aria-hidden={collapsed || undefined}
          aria-label="搜索成员或房间"
          placeholder="搜索成员或房间"
          aria-controls={showResults ? listId : undefined}
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(true)
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter' && showResults && results.length) {
              event.preventDefault()
              open(results[0])
            }
            if (event.key === 'ArrowDown' && results.length) {
              event.preventDefault()
              if (showResults) list.current?.querySelector('button')?.focus()
              else setActive(true)
            }
          }}
        />
        {query && !collapsed && (
          <button type="button" className="ui-press" aria-label="清除搜索" onClick={() => {
            setQuery('')
            input.current?.focus()
          }}>
            <X size={12} strokeWidth={1.7} />
          </button>
        )}
      </div>
      {showResults && (
        <div className="workspace-search-results">
          <ul id={listId} ref={list} aria-label="搜索结果">
            {results.map((item) => {
              const Icon = item.memberId ? UserRound : LayoutGrid
              return (
                <li key={item.memberId ? `member-${item.memberId}` : `room-${item.roomId}`}>
                  <button type="button" title={item.memberId ? `${item.label} · ${item.roomName}` : item.label} onClick={() => open(item)}>
                    <Icon size={14} strokeWidth={1.65} />
                    <span>{item.label}</span>
                    {item.memberId && <small>{item.roomName}</small>}
                  </button>
                </li>
              )
            })}
          </ul>
          {!results.length && <p role="status">没有匹配的成员或房间</p>}
        </div>
      )}
    </div>
  )
}
