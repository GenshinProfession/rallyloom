import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReportsPage } from '@/components/reports/ReportsPage'
import { TitleBar } from '@/components/TitleBar'
import { Sidebar } from '@/components/Sidebar'
import type { WorkspaceSearchItem } from '@/components/WorkspaceSearch'
import { LoginScreen } from '@/components/auth/LoginScreen'
import { ChatPage } from '@/components/chat/ChatPage'
import { TaskBoardPage } from '@/components/tasks/TaskBoardPage'
import { TeamManage } from '@/components/team/TeamManage'
import { DocsPage } from '@/components/docs/DocsPage'
import { NoticePage } from '@/components/notify/NoticePage'
import { OfficeNotice } from '@/components/notify/OfficeNotice'
import { seatIdOf } from '@/data/team'
import { can } from '@/lib/identity/rbac'
import type { IdentityConnector, TeamMember } from '@/lib/identity/types'
import { DemoChatClient } from '@/lib/chat/demo'
import { GENERAL_CHANNEL_ID, roomChannelId, type ChatParticipant } from '@/lib/chat/types'
import { useMentions } from '@/lib/chat/use-mentions'
import { OaTaskClient, OaDocClient, OaChatClient, OaNoticeClient } from '@/lib/oa/clients'
import { DemoTaskClient } from '@/lib/tasks/demo'
import { DemoDocClient } from '@/lib/docs/demo'
import { DemoNoticeClient } from '@/lib/notify/demo'
import type { NoticeRecord } from '@/lib/notify/types'
import { DemoWorkspaceClient, DemoGroupClient } from '@/lib/store/client'
import { GroupConsole } from '@/components/group/GroupConsole'
import { rosterOf } from '@/lib/store/roster'
import type { DatasourceConfig, WorkspaceSnapshot } from '@/lib/store/types'
import { workspaceValue, type JoinedWorkspace } from '@/lib/store/workspace-binding'
import { CONNECTORS } from '@/lib/identity/connector'
import { RoomSlotSettings } from '@/components/team/RoomSlotSettings'
import { FormalTeam } from '@/components/team/FormalTeam'

type Page = 'office' | 'chat' | 'tasks' | 'docs' | 'notify' | 'team' | 'reports'

const OfficePage = lazy(() => import('@/components/office/OfficePage').then(({ OfficePage }) => ({ default: OfficePage })))

type Entry =
  | { mode: 'demo'; snapshot: WorkspaceSnapshot; memberId: string; client: DemoWorkspaceClient }
  | ({ mode: 'formal' } & JoinedWorkspace)

export default function App() {
  const [entry, setEntry] = useState<Entry | null>(null)
  const [entryError, setEntryError] = useState('')
  const [restoring, setRestoring] = useState(Boolean(window.rallyloom?.workspace))
  const initialRestore = useRef<ReturnType<NonNullable<typeof window.rallyloom>['workspace']['resume']> | null>(null)
  const demoClient = useRef<DemoWorkspaceClient | null>(null)
  const switching = useRef<AbortController | null>(null)

  useEffect(() => {
    const bridge = window.rallyloom?.workspace
    if (!bridge) return
    let active = true
    initialRestore.current ??= bridge.resume()
    void initialRestore.current.then((result) => {
      if (!active) return
      if (result.ok && result.value) setEntry({ mode: 'formal', ...result.value })
      if (!result.ok && result.code !== 'AUTH_REQUIRED') setEntryError(result.error)
    }).catch(() => {
      if (active) setEntryError('暂时无法恢复登录状态，请重试。')
    }).finally(() => { if (active) setRestoring(false) })
    return () => { active = false }
  }, [])

  async function enterDemo(role: IdentityConnector, signal: AbortSignal) {
    const identity = await role.authorize()
    signal.throwIfAborted()
    // 演示租户切换：连接器声明属于哪家演示公司，客户端按租户分家持有数据。
    // formal 模式无此选择：一个 OA 地址 = 一家公司，归属由服务端解析。
    const tenantId = role.tenantId ?? 'tenant-a'
    if (tenantId === 'group') {
      // 集团视图（平台运维轴，可选管辖层）：只读合并目录，不占 demoClient 分家位。
      const groupClient = new DemoGroupClient()
      const { member, snapshot } = await groupClient.syncExternalIdentity(identity)
      signal.throwIfAborted()
      setEntryError('')
      setEntry({ mode: 'demo', memberId: member.id, snapshot, client: groupClient })
      return
    }
    const client = demoClient.current?.tenantId === tenantId
      ? demoClient.current
      : (demoClient.current = new DemoWorkspaceClient(tenantId))
    const { member, snapshot } = await client.syncExternalIdentity(identity)
    signal.throwIfAborted()
    setEntryError('')
    setEntry({ mode: 'demo', memberId: member.id, snapshot, client })
  }

  /** 集团控制台「进入工作区」：以对应公司超管身份下钻（复用演示租户切换） */
  function enterTenantAsOwner(tenantId: string) {
    switching.current?.abort()
    const current = new AbortController()
    switching.current = current
    const role = CONNECTORS.find(({ id }) => id === (tenantId === 'tenant-b' ? 'demo-idp-b-owner' : 'demo-idp-owner'))
    if (!role) return
    void enterDemo(role, current.signal).catch((error: unknown) => {
      if (!current.signal.aborted) returnToEntry(error instanceof Error ? error.message : '无法进入工作区。')
    })
  }

  function returnToEntry(error = '') {
    switching.current?.abort()
    setEntryError(error)
    setEntry(null)
  }

  function preview() {
    switching.current?.abort()
    const current = new AbortController()
    switching.current = current
    const role = CONNECTORS.find(({ id }) => id === 'demo-idp-admin')
    if (!role) return
    void enterDemo(role, current.signal).catch((error: unknown) => {
      if (!current.signal.aborted) returnToEntry(error instanceof Error ? error.message : '无法打开演示。')
    })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <TitleBar demo={entry?.mode === 'demo'} login={!entry} />
      {restoring ? <div className="grid flex-1 place-items-center text-sm text-muted-foreground" role="status">正在恢复工作区登录…</div> : entry ? (
        <WorkspaceShell key={`${entry.mode}:${entry.memberId}`} entry={entry}
          onHome={() => returnToEntry()} onPreview={preview} onAccessLost={returnToEntry}
          onEnterWorkspace={enterTenantAsOwner}
        />
      ) : (
        <LoginScreen entryError={entryError} onDemo={enterDemo} onEnter={(workspace) => {
          setEntryError('')
          setEntry({ mode: 'formal', ...workspace })
        }} />
      )}
    </div>
  )
}

function WorkspaceShell({ entry, onHome, onPreview, onAccessLost, onEnterWorkspace }: {
  entry: Entry
  onHome: () => void
  onPreview: () => void
  onAccessLost: (message: string) => void
  onEnterWorkspace: (tenantId: string) => void
}) {
  const demo = entry.mode === 'demo'
  // 集团视图（可选管辖层）：平台运维轴登录后的只读跨租户控制台。
  const isGroup = demo && entry.snapshot.tenant.id === 'group'
  const groupName = isGroup ? (entry.snapshot.tenant.name) : ''
  // 工作区名即租户名：formal 由服务端 display_name 决定；demo 由快照 tenant 决定
  const workspaceName = entry.mode === 'formal' ? entry.binding.display_name : entry.snapshot.tenant.name
  const [snapshot, applySnapshot] = useState(entry.snapshot)
  const [permissions, setPermissions] = useState(entry.mode === 'formal' ? entry.permissions : [])
  const [roleSettings, setRoleSettings] = useState(entry.mode === 'formal' ? entry.roleSettings : undefined)
  const applyJoined = useCallback((updated: JoinedWorkspace) => {
    applySnapshot(updated.snapshot)
    setPermissions(updated.permissions)
    setRoleSettings(updated.roleSettings)
  }, [])
  const { team, policy, datasource, layout, dataSlots } = snapshot
  const [page, setPage] = useState<Page>(isGroup ? 'team' : 'office')
  const [animateNavigation, setAnimateNavigation] = useState(false)

  function navigate(next: Page, pointer = false) {
    setAnimateNavigation(pointer)
    setPage(next)
  }
  const [officeSearchHit, setOfficeSearchHit] = useState<WorkspaceSearchItem | null>(null)
  const [officeRoomId, setOfficeRoomId] = useState<string | null>(null)
  const [chatChannelId, setChatChannelId] = useState(GENERAL_CHANNEL_ID)
  const [chatTargetId, setChatTargetId] = useState<string | null>(null)

  const me = team.find(({ id }) => id === entry.memberId)
  const canReports = !demo && permissions.includes('reports.use') && snapshot.collaboration?.reporting?.version === 1
  const canTeam = me ? (demo ? can(me.role, 'team.view') : permissions.includes('team.view')) : false
  // 集团视图不承载租户内板块：办公室/交流室/任务/文档/通知按公司工作区进入后体验
  const canChat = !isGroup && !!me && (demo ? can(me.role, 'chat.use') : permissions.includes('chat.use'))
  const canTasks = !isGroup && !!me && (demo ? can(me.role, 'tasks.use') : permissions.includes('tasks.use'))
  const canDocs = !isGroup && !!me && (demo ? can(me.role, 'docs.use') : permissions.includes('docs.use'))
  const canNotify = !isGroup && !!me && (demo ? can(me.role, 'notify.view') : permissions.includes('notify.view'))
  const activePage: Page =
    page === 'reports' && !canReports ? 'office' : page === 'team' && !canTeam ? 'office'
      : page === 'chat' && !canChat ? 'office'
        : page === 'tasks' && !canTasks ? 'office'
          : page === 'docs' && !canDocs ? 'office'
            : page === 'notify' && !canNotify ? 'office'
              : page
  const officeMembers = useMemo(() => rosterOf(layout, team, demo), [layout, team, demo])
  const meSeatId = me && (demo ? me.role !== 'guest' : me.officeAssignable !== false)
    ? officeMembers.some(({ id }) => id === me.id) ? me.id : demo ? seatIdOf(me.id, team) : null
    : null
  const searchItems = useMemo<WorkspaceSearchItem[]>(() => {
    const roomNames = new Map(layout.rooms.map(({ id, name }) => [id, name]))
    return [
      ...layout.rooms.map(({ id, name }) => ({ roomId: id, roomName: name, label: name })),
      ...officeMembers.flatMap((member) => {
        const roomName = roomNames.get(member.roomId)
        return roomName ? [{
          label: member.id === meSeatId ? me?.displayName ?? member.name : member.name,
          roomId: member.roomId,
          roomName,
          memberId: member.id,
        }] : []
      }),
    ]
  }, [layout.rooms, officeMembers, meSeatId, me?.displayName])
  const { chatMembers, officeChatPeers } = useMemo(() => {
    const directory = new Map<string, TeamMember>()
    const officeChatPeers = new Map<string, string>()

    for (const person of team) {
      directory.set(person.id, person)
      if (person.connectorId.startsWith('demo-idp-') && person.idpId.startsWith('demo-u-')) {
        directory.set(person.idpId.slice('demo-u-'.length), person)
      }
    }
    const assignedRooms = new Map<string, string>()
    for (const member of officeMembers) {
      const person = directory.get(member.id)
      if (!person || (demo && !can(person.role, 'chat.use'))) continue
      officeChatPeers.set(member.id, person.id)
      assignedRooms.set(person.id, member.roomId)
    }
    const chatMembers = team.filter(({ role }) => !demo || can(role, 'chat.use')).map((person): ChatParticipant => {
      const seatId = seatIdOf(person.id, team)
      return {
        id: person.id,
        name: person.displayName,
        presence: person.presence,
        roomId: assignedRooms.get(person.id) ?? (seatId ? layout.assignments[seatId] : undefined),
        detail: person.email ?? person.attrs['部门'] ?? person.attrs['岗位'],
      }
    })
    return { chatMembers, officeChatPeers }
  }, [demo, layout.assignments, officeMembers, team])
  const chatSender = useMemo(() => me ? { id: me.id, name: me.displayName } : null, [me?.id, me?.displayName])
  /* 房间频道随当前办公室配置生成。 */
  const chatClient = useMemo(
    () => demo ? new DemoChatClient(layout.rooms, chatMembers, chatSender) : new OaChatClient(),
    [layout.rooms, chatMembers, chatSender, demo],
  )
  const { newest: mentions, markRead } = useMentions(chatClient, canChat)

  function selectChannel(channelId: string) {
    setChatChannelId(channelId)
    setChatTargetId(mentions.get(channelId)?.id ?? null)
  }

  function openChat(channelId: string) {
    setOfficeSearchHit(null)
    selectChannel(channelId)
    navigate('chat')
  }
  const selectedOfficeRoom = layout.rooms.some(({ id }) => id === officeRoomId) ? officeRoomId : null
  /* 任务看板客户端：演示源内存模拟；接云端后换 OaTaskClient（同一契约） */
  const [taskScope, setTaskScope] = useState(snapshot.collaboration?.scopes[0]?.id)
  const taskClient = useMemo(() => demo ? new DemoTaskClient() : new OaTaskClient(taskScope), [demo, taskScope])
  const docClient = useMemo(() => demo ? new DemoDocClient(snapshot.tenant.id, me?.displayName) : new OaDocClient(),
    [demo, snapshot.tenant.id, me?.displayName])
  /* 通知中心客户端：演示源内存模拟；接云端后换 OaNoticeClient（同一契约） */
  const noticeClient = useMemo(() => demo ? new DemoNoticeClient() : new OaNoticeClient(), [demo])
  /* 存储中心（超管）：演示模式只做「连接测试」探测，不切换演示租户的种子快照；
     正式环境的数据源由登录页「绑定公司工作区」从服务端 bootstrap 决定，客户端不可改。 */
  const [connError, setConnError] = useState<string | null>(null)
  const [storageBusy, setStorageBusy] = useState(false)
  const handleTryConnect = useCallback(async (config: DatasourceConfig) => {
    if (config.kind !== 'oa-rest') { setConnError(null); return true }
    setStorageBusy(true)
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)
      const base = config.baseUrl.replace(/\/+$/, '')
      const res = await fetch(`${base}/api/v1/workspace/discovery`, { signal: controller.signal })
      clearTimeout(timer)
      if (!res.ok) {
        setConnError(`云端后端响应 HTTP ${res.status}——连接测试失败（演示工作区未切换）`)
        return false
      }
      setConnError(null)
      return true
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      setConnError(`无法连接 OA 后端：${reason}（4s 超时）。正式接入请用登录页「绑定公司工作区」。`)
      return false
    } finally { setStorageBusy(false) }
  }, [])
  const [notices, setNotices] = useState<NoticeRecord[]>([])
  const [noticeUnread, setNoticeUnread] = useState(0)
  useEffect(() => {
    if (!canNotify || !noticeClient) { setNotices([]); setNoticeUnread(0); return }
    let alive = true
    const refresh = () => {
      void noticeClient.list().then((list) => { if (alive) setNotices(list) })
      void noticeClient.unreadIds().then((ids) => { if (alive) setNoticeUnread(ids.length) })
    }
    refresh()
    const off = noticeClient.subscribe(refresh)
    return () => { alive = false; off() }
  }, [canNotify, noticeClient])

  useEffect(() => {
    if (demo) return
    const bridge = window.rallyloom?.workspace
    let active = true
    let checking = false
    const refresh = async () => {
      if (!bridge || checking) return
      checking = true
      try {
        const result = await bridge.resume()
        if (!active) return
        if (result.ok && result.value) {
          applyJoined(result.value)
        } else if (result.ok || ['AUTH_REQUIRED', 'FORBIDDEN', 'WORKSPACE_CHANGED'].includes(result.code)) {
          onAccessLost(result.ok ? '请重新授权。' : result.error)
        }
      } catch { /* Keep the last verified view during intermittent network errors. */ }
      finally { checking = false }
    }
    const timer = setInterval(() => void refresh(), 60000)
    window.addEventListener('focus', refresh)
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [demo, onAccessLost, applyJoined])

  function logout() {
    if (demo) { onHome(); return }
    const bridge = window.rallyloom?.workspace
    if (bridge) void bridge.logout().then(onHome, onHome)
    else onHome()
  }

  if (!me) return null

  return (
    <div className="flex min-h-0 flex-1" data-workspace-mode={entry.mode}>
      <Sidebar
        me={me}
        page={activePage}
        teamVisible={canTeam}
        chatVisible={canChat}
        tasksVisible={canTasks}
        docsVisible={canDocs}
        reportsVisible={canReports}
        searchItems={searchItems}
        onSearchSelect={(item) => {
          setOfficeSearchHit({ ...item })
          setOfficeRoomId(item.roomId)
          navigate('office')
        }}
        onNavigate={(nextPage, pointer) => {
          setOfficeSearchHit(null)
          if (activePage === 'office' && nextPage === 'chat' && selectedOfficeRoom) {
            selectChannel(roomChannelId(selectedOfficeRoom))
          } else if (nextPage === 'chat' && activePage !== 'chat') {
            selectChannel(chatChannelId)
          }
          if (nextPage !== activePage) navigate(nextPage, pointer)
        }}
        workspaceName={workspaceName}
        demo={demo}
        teamLabel={isGroup ? '集团控制台' : undefined}
        onSwitchWorkspace={onHome}
        onPreview={demo ? undefined : onPreview}
        onLogout={logout}
      />

      <div key={activePage} className="workspace-route flex min-h-0 min-w-0 flex-1" data-enter={animateNavigation}>
        {activePage === 'office' ? (
          <div className="flex min-w-0 flex-1 flex-col">
            {canNotify && (
              <OfficeNotice notices={notices} unread={noticeUnread} onOpenAll={() => navigate('notify')} />
            )}
            <div className="flex min-h-0 flex-1">
              <Suspense fallback={<div className="grid flex-1 place-items-center text-[12px] text-muted-foreground" role="status">正在加载办公室…</div>}>
                <OfficePage
                  workspaceName={workspaceName}
                  demo={demo}
                  layoutState={layout}
                  members={officeMembers}
                  slots={dataSlots}
                  meSeatId={meSeatId}
                  meName={me.displayName}
                  searchHit={officeSearchHit}
                  selectedRoom={selectedOfficeRoom}
                  onSelectRoom={setOfficeRoomId}
                  editing={!demo && permissions.includes('layout.edit') ? { team, publish: async (draft) => {
                    const bridge = window.rallyloom?.workspace
                    if (!bridge) throw new Error('请在 Rallyloom 桌面应用中编排办公室。')
                    const updated = workspaceValue(await bridge.saveOfficeLayout(draft))
                    applyJoined(updated)
                  } } : undefined}
                  work={{ actorId: me.id, actorName: me.displayName, canCoordinate: demo ? me.role === 'admin' || me.role === 'owner' : permissions.includes('tasks.coordinate'),
                    tasks: canTasks ? taskClient ?? undefined : undefined, docs: canDocs ? docClient ?? undefined : undefined,
                    notices: canNotify ? noticeClient ?? undefined : undefined }}
                  chat={canChat && chatSender && chatClient ? {
                    client: chatClient,
                    sender: chatSender,
                    peers: officeChatPeers,
                    mentions,
                    openChannel: openChat,
                    markRead,
                  } : undefined}
                />
              </Suspense>
            </div>
          </div>
        ) : activePage === 'chat' && chatSender && chatClient ? (
          <ChatPage
            sender={chatSender}
            client={chatClient}
            members={chatMembers}
            channelId={chatChannelId}
            targetId={chatTargetId}
            mentions={mentions}
            onRead={markRead}
            onChannelChange={selectChannel}
            onLocateRoom={(roomId) => {
              setOfficeSearchHit(null)
              setOfficeRoomId(roomId)
              navigate('office')
            }}
          />
        ) : activePage === 'tasks' && taskClient ? (
          <TaskBoardPage key={taskScope} members={demo ? officeMembers : team.map((m) => ({ id: m.id, name: m.displayName, roomId: '', role: m.roleName ?? '', presence: m.presence, body: '#999' }))} client={taskClient} scopes={!demo ? snapshot.collaboration?.scopes : undefined} scope={taskScope} onScope={setTaskScope} canConfigure={!demo && permissions.includes('tasks.coordinate')} />
        ) : activePage === 'reports' ? (<ReportsPage canWrite={permissions.includes('reports.write')} key={taskScope} actorId={entry.memberId} scope={taskScope} scopes={snapshot.collaboration?.scopes} onScope={setTaskScope} />
        ) : activePage === 'docs' && docClient ? (
          <DocsPage client={docClient} />
        ) : activePage === 'notify' && noticeClient ? (
          <NoticePage canPublish={!demo && permissions.includes('notify.publish')} client={noticeClient} onBack={() => navigate('office')} />
        ) : (
          <main className="flex min-w-0 flex-1 flex-col bg-[#f4f4f6]">
            {isGroup ? <GroupConsole directory={team} groupName={groupName} onEnterWorkspace={onEnterWorkspace} /> : entry.mode === 'demo' ? <TeamManage
              team={team}
              me={me}
              policy={policy}
              datasource={datasource}
              connError={connError}
              storageBusy={storageBusy}
              onTryConnect={handleTryConnect}
              onUpdatePolicy={(patch) => void entry.client.savePolicy(patch).then(applySnapshot)}
              onSetRole={(id, role) => void entry.client.setMemberRole(id, role).then(applySnapshot)}
              onClearOverride={(id) => void entry.client.setMemberRole(id, null).then(applySnapshot)}
              onRemove={(id) => void entry.client.removeMember(id).then((updated) => {
                applySnapshot(updated)
                if (id === entry.memberId) onHome()
              })}
            /> : <FormalTeam tools={permissions.includes('slots.attach') ? <RoomSlotSettings snapshot={snapshot} save={async (roomId, enabled) => {
              const bridge = window.rallyloom?.workspace
              if (!bridge) throw new Error('请使用最新版桌面应用。')
              applyJoined(workspaceValue(await bridge.saveRoomSlot(roomId, enabled)))
            }} /> : undefined} members={team} roleSettings={roleSettings} onManage={permissions.includes('members.role') ? async (id, action) => {
              const bridge = window.rallyloom?.workspace
              if (!bridge) throw new Error('成员管理需要在 Rallyloom 桌面应用中打开。')
              const updated = workspaceValue(await bridge.manageMember(id, action))
              applyJoined(updated)
            } : undefined} onSaveSettings={roleSettings && permissions.includes('roles.configure') ? async (values) => {
              const bridge = window.rallyloom?.workspace
              if (!bridge) throw new Error('角色映射需要在 Rallyloom 桌面应用中打开。')
              const updated = workspaceValue(await bridge.saveRoleSettings(values))
              applyJoined(updated)
            } : undefined} />}
          </main>
        )}
      </div>
    </div>
  )
}
