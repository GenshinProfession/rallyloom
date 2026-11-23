import { useId, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { Building2, ChevronDown, ChevronRight, ChartNoAxesCombined, BookOpenText, Kanban, LayoutGrid, LogOut, MessageCircle, PanelLeftClose, PanelLeftOpen, Settings, UsersRound } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { SelectionHighlight } from '@/components/ui/selection-highlight'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PRESENCE_META } from '@/data/office'
import { ROLE_LABEL } from '@/lib/identity/rbac'
import type { TeamMember } from '@/lib/identity/types'
import { cn } from '@/lib/utils'
import { WorkspaceSearch, type WorkspaceSearchItem } from './WorkspaceSearch'
import './sidebar.css'

type Page = 'office' | 'chat' | 'tasks' | 'docs' | 'notify' | 'team' | 'reports'

export function Sidebar({
  me,
  page,
  teamVisible,
  chatVisible,
  tasksVisible,
  docsVisible,
  reportsVisible,
  searchItems,
  onSearchSelect,
  onNavigate,
  onLogout,
  workspaceName,
  demo,
  teamLabel,
  onSwitchWorkspace,
  onPreview,
}: {
  me: TeamMember
  page: Page
  teamVisible: boolean
  chatVisible: boolean
  tasksVisible: boolean
  docsVisible: boolean
  reportsVisible?: boolean
  searchItems: readonly WorkspaceSearchItem[]
  onSearchSelect: (item: WorkspaceSearchItem) => void
  onNavigate: (page: Page, pointer: boolean) => void
  onLogout: () => void
  workspaceName: string
  demo: boolean
  /** 集团视图下该入口渲染为「集团控制台」（可选管辖层） */
  teamLabel?: string
  onSwitchWorkspace: () => void
  onPreview?: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [compactLayout, setCompactLayout] = useState(false)
  const [animateRail, setAnimateRail] = useState(false)
  const surface = useRef<HTMLSpanElement>(null)
  const sidebarId = useId()

  useLayoutEffect(() => {
    if (collapsed) return
    const reveal = surface.current?.getAnimations().find((motion) =>
      motion instanceof CSSTransition && motion.transitionProperty === 'clip-path',
    )
    if (!reveal) {
      setCompactLayout(false)
      return
    }
    let current = true
    const settle = () => { if (current) setCompactLayout(false) }
    void reveal.finished.then(settle, settle)
    return () => { current = false }
  }, [collapsed])

  function changeSidebar(next: boolean, event: MouseEvent<HTMLButtonElement>) {
    const animated = event.detail > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches
    setAnimateRail(animated)
    setCollapsed(next)
    // Reveal the wider page as the panel recedes, and dock it once the panel opens.
    if (next || !animated) setCompactLayout(next)
  }

  const nav = (value: Page) => cn(
    'sidebar-control relative flex h-[31px] w-full items-center gap-2 rounded-md px-2 text-ui-body text-[#48515c] hover:bg-[#eeefee]',
    page === value && 'font-semibold text-[#293e55]',
  )

  return (
    <div className="sidebar-slot" data-compact={compactLayout} data-collapsed={collapsed} data-motion={animateRail}>
      <aside id={sidebarId} className="workspace-sidebar flex flex-col">
        <span ref={surface} className="sidebar-surface" aria-hidden="true" />
        <span className="sidebar-edge" aria-hidden="true" />
        <div className="px-2.5 pt-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={workspaceName}
                aria-label="工作区菜单"
                className="sidebar-control flex h-[30px] w-full items-center gap-2 rounded-md border border-[#e5e6e6] bg-[#fcfcfb] px-[6px] text-left text-[#34404e] hover:bg-[#f0f2f3] data-[state=open]:bg-[#f0f2f3]"
              >
                <span className="grid size-[17px] shrink-0 place-items-center rounded-[4px] bg-[#e9edef] text-[#526475]">
                  <Building2 size={12} strokeWidth={1.65} />
                </span>
                <span className="sidebar-copy flex min-w-0 flex-1 items-center gap-2" aria-hidden={collapsed || undefined}>
                  <span className="truncate text-ui-body font-semibold">{workspaceName}</span>
                  <ChevronDown className="ml-auto size-3 shrink-0 text-[#687482]" strokeWidth={1.65} />
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              <DropdownMenuLabel className="truncate text-ui-meta font-normal text-muted-foreground">{workspaceName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-ui-body" onSelect={onSwitchWorkspace}>{demo ? '返回正式入口' : '切换工作区'}</DropdownMenuItem>
              {onPreview && <DropdownMenuItem className="text-ui-body" onSelect={onPreview}>进入演示</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>

          <WorkspaceSearch items={searchItems} onSelect={onSearchSelect} collapsed={collapsed} onExpand={(event) => changeSidebar(false, event)} />
        </div>

        <nav aria-label="工作区" className="sidebar-nav selection-track mt-2.5 flex flex-col gap-0.5 px-2.5">
          <SelectionHighlight selected='[aria-current="page"]' />
          <button type="button" className={nav('office')} title="办公室" aria-label="办公室" aria-current={page === 'office' ? 'page' : undefined} data-nav="office" onClick={(event) => onNavigate('office', event.detail > 0)}>
            <LayoutGrid className="size-[15px] shrink-0" strokeWidth={1.65} />
            <span className="sidebar-copy" aria-hidden={collapsed || undefined}>办公室</span>
          </button>
          {chatVisible && (
            <button type="button" className={nav('chat')} title="交流室" aria-label="交流室" aria-current={page === 'chat' ? 'page' : undefined} data-nav="chat" onClick={(event) => onNavigate('chat', event.detail > 0)}>
              <MessageCircle className="size-[15px] shrink-0" strokeWidth={1.65} />
              <span className="sidebar-copy" aria-hidden={collapsed || undefined}>交流室</span>
            </button>
          )}
          {tasksVisible && (
            <button type="button" className={nav('tasks')} title="任务看板" aria-label="任务看板" aria-current={page === 'tasks' ? 'page' : undefined} data-nav="tasks" onClick={(event) => onNavigate('tasks', event.detail > 0)}>
              <Kanban className="size-[15px] shrink-0" strokeWidth={1.65} />
              <span className="sidebar-copy" aria-hidden={collapsed || undefined}>任务看板</span>
            </button>
          )}
          {reportsVisible && <button type="button" className={nav('reports')} title="工作汇报" aria-label="工作汇报" data-nav="reports" onClick={(event) => onNavigate('reports', event.detail > 0)}><ChartNoAxesCombined className="size-[15px] shrink-0" strokeWidth={1.65} /><span className="sidebar-copy" aria-hidden={collapsed || undefined}>工作汇报</span></button>}
          {docsVisible && (
            <button type="button" className={nav('docs')} title="文档中心" aria-label="文档中心" aria-current={page === 'docs' ? 'page' : undefined} data-nav="docs" onClick={(event) => onNavigate('docs', event.detail > 0)}>
              <BookOpenText className="size-[15px] shrink-0" strokeWidth={1.65} />
              <span className="sidebar-copy" aria-hidden={collapsed || undefined}>文档中心</span>
            </button>
          )}
          {teamVisible && (
            <button type="button" className={nav('team')} title={demo ? (teamLabel ?? '团队管理') : '团队成员'} aria-label={demo ? (teamLabel ?? '团队管理') : '团队成员'} aria-current={page === 'team' ? 'page' : undefined} data-nav="team" onClick={(event) => onNavigate('team', event.detail > 0)}>
              <UsersRound className="size-[15px] shrink-0" strokeWidth={1.65} />
              <span className="sidebar-copy" aria-hidden={collapsed || undefined}>{demo ? (teamLabel ?? '团队管理') : '团队成员'}</span>
            </button>
          )}
        </nav>

        <div className="mt-auto px-2.5 pb-1.5">
          {teamVisible && demo && (
            <button
              type="button"
              onClick={(event) => onNavigate('team', event.detail > 0)}
              aria-label="设置"
              title="设置"
              className="sidebar-control flex h-[28px] w-full items-center gap-2 rounded-md px-2 text-ui-label text-[#505c6b] hover:bg-[#e9ecf0]"
            >
              <Settings size={14} strokeWidth={1.65} />
              <span className="sidebar-copy" aria-hidden={collapsed || undefined}>设置</span>
            </button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`账号菜单，${me.displayName}`}
                className="sidebar-control mt-1 flex w-full min-w-0 items-center gap-2 rounded-md px-[3px] py-1.5 text-left hover:bg-[#e9ecf0] data-[state=open]:bg-[#e9ecf0]"
              >
                <span className="relative shrink-0">
                  <Avatar className="size-[25px]">
                    <AvatarFallback className="bg-[#dce5ee] text-ui-meta font-semibold text-[#425a75]">{me.displayName.slice(0, 1)}</AvatarFallback>
                  </Avatar>
                  <span title={PRESENCE_META[me.presence]?.label} className="absolute -bottom-px -right-px size-2 rounded-full border-2 border-[#f8f9fa]" style={{ background: PRESENCE_META[me.presence]?.color ?? '#a2a7af' }} />
                </span>
                <span className="sidebar-copy flex min-w-0 flex-1 items-center gap-2 px-1" aria-hidden={collapsed || undefined}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ui-body font-semibold leading-tight text-[#293546]">{me.displayName}</span>
                      <span className="mt-0.5 block truncate text-ui-meta leading-tight text-[#657382]">{demo ? me.attrs['岗位'] ?? ROLE_LABEL[me.role] : me.sourceRoleName ?? me.roleName ?? me.roleId}</span>
                    </span>
                    <ChevronRight size={12} strokeWidth={1.65} className="shrink-0 text-[#667482]" />
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-44">
              <DropdownMenuLabel className="text-ui-meta font-normal text-muted-foreground">{me.displayName} · {demo ? ROLE_LABEL[me.role] : me.sourceRoleName ?? me.roleName ?? me.roleId}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="gap-2 text-ui-body" onClick={onLogout}>
                <LogOut className="size-3.5" />
                {demo ? '退出演示' : '退出登录'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="mt-1.5">
            <div className="sidebar-divider mb-1 border-t border-[#e3e6e9]" />
            <button
              type="button"
              aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
              aria-expanded={!collapsed}
              aria-controls={sidebarId}
              title={collapsed ? '展开侧栏' : '折叠侧栏'}
              onClick={(event) => changeSidebar(!collapsed, event)}
              className="sidebar-toggle ui-press grid size-[30px] place-items-center rounded-md text-[#647183] hover:bg-[#e9ecf0] hover:text-[#27384b]"
            >
              <span className="sidebar-toggle-symbol" aria-hidden="true">
                <PanelLeftClose size={15} strokeWidth={1.65} />
                <PanelLeftOpen size={15} strokeWidth={1.65} />
              </span>
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

