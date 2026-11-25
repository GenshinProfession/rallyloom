const { app, ipcMain, shell, safeStorage } = require('electron')
const { readFileSync, renameSync, rmSync, writeFileSync } = require('node:fs')
const { readFile, rename, rm, writeFile } = require('node:fs/promises')
const path = require('node:path')

const CALLBACK = 'rallyloom://callback'
const API = '/api/v1/workspace'

class WorkspaceError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

const validText = (value) => typeof value === 'string' && value.trim().length > 0
const validId = (value) => validText(value) && value.length <= 128
const object = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value))

function httpsUrl(value, isBase = false) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || (isBase && url.search)) throw new Error()
    return url
  } catch {
    throw new WorkspaceError('INVALID_ADDRESS', '请输入有效的 HTTPS 服务地址。')
  }
}

function describe(raw, baseUrl) {
  if (object(raw) && raw.api_version && raw.api_version !== 'v1') {
    throw new WorkspaceError('UNSUPPORTED_VERSION', '这套工作区使用了当前客户端不支持的 API 版本。')
  }
  if (!object(raw) || raw.api_version !== 'v1' || !validId(raw.installation_id) ||
    !validId(raw.workspace_id) || !validText(raw.display_name) || raw.display_name.length > 160 ||
    !object(raw.authorization) || !validId(raw.authorization.client_id) ||
    !validText(raw.authorization.issuer) || !validText(raw.authorization.resource)) {
    throw new WorkspaceError('INVALID_DISCOVERY', '服务未返回完整的工作区和登录配置。')
  }
  const { authorization } = raw
  httpsUrl(authorization.issuer, true)
  httpsUrl(authorization.resource, true)
  return {
    baseUrl,
    installation_id: raw.installation_id,
    workspace_id: raw.workspace_id,
    display_name: raw.display_name,
    api_version: 'v1',
    authorization: { issuer: authorization.issuer, client_id: authorization.client_id, resource: authorization.resource },
  }
}

async function fetchJson(url, options = {}) {
  const { signal, ...init } = options
  let response
  try {
    const timeout = AbortSignal.timeout(10_000)
    response = await fetch(url, {
      ...init, redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (error) {
    if (signal?.aborted) throw new WorkspaceError('CANCELLED', '操作已取消。')
    if (error.name === 'TimeoutError') throw new WorkspaceError('NETWORK', '连接超时，请检查服务地址或网络。')
    if (/CERT|TLS|VERIFY/.test(error.cause?.code ?? '')) {
      throw new WorkspaceError('CERTIFICATE', '服务证书验证失败，请联系企业管理员。')
    }
    throw new WorkspaceError('NETWORK', '无法连接工作区服务，请检查地址或网络。')
  }
  if (response.status === 401) throw new WorkspaceError('AUTH_REQUIRED', '登录已失效，请重新授权。')
  if (response.status === 409) throw new WorkspaceError('CONFLICT', '内容已由其他人更新，请刷新后重试。')
  if (response.status === 400) {
    const rawText = await response.clone().text().catch(() => '')
    let data = null
    try { data = JSON.parse(rawText) } catch { /* not json */ }
    if (typeof data?.error === 'string' && data.error.length <= 200)
      throw new WorkspaceError('INVALID_REQUEST', data.error)
  }
  if (response.status === 403) throw new WorkspaceError('FORBIDDEN', '当前身份无权访问此工作区。')
  if (response.status === 404) throw new WorkspaceError('API_MISSING', '未找到工作区接口，请检查服务地址和企业部署。')
  if (!response.ok) throw new WorkspaceError('SERVER', `工作区服务暂时无法响应（HTTP ${response.status}）。`)
  try { return await response.json() }
  catch { throw new WorkspaceError('INVALID_RESPONSE', '工作区服务返回了无法读取的数据。') }
}

// 逐字段校验 bootstrap，失败时给出「第几个成员/哪个房间/缺哪个字段」，
// 并把结构摘要写进诊断文件——否则提供方只看到一句「数据不完整」完全无从下手。
function memberIssue(member) {
  if (!object(member)) return '不是 JSON 对象'
  if (!validId(member.id)) return '缺少 id（非空字符串，≤128）'
  if (!validText(member.connectorId)) return '缺少 connectorId（非空字符串）'
  if (!validText(member.idpId)) return '缺少 idpId（外部系统的用户 id）'
  if (!validText(member.displayName)) return '缺少 displayName（显示名）'
  if (member.email !== undefined && typeof member.email !== 'string') return 'email 类型应为字符串'
  if (!object(member.attrs)) return '缺少 attrs（对象，可为空 {}）'
  const badAttr = Object.entries(member.attrs).find(([, value]) => typeof value !== 'string')
  if (badAttr) return `attrs.${badAttr[0]} 不是字符串`
  const hasProviderRole = member.roleId !== undefined || member.roleName !== undefined
  if (hasProviderRole ? !validId(member.roleId) || !validText(member.roleName) : !validText(member.role))
    return '需要提供方的 roleId 和 roleName，或兼容字段 role'
  if (member.sourceRoleName !== undefined && !validText(member.sourceRoleName)) return 'sourceRoleName 应为非空字符串'
  if (!optionalBoolean(member.officeAssignable)) return 'officeAssignable 应为布尔值'
  if (member.memberActions !== undefined && !validMemberActions(member.memberActions)) return 'memberActions 格式无效'
  if (!['online', 'busy', 'away', 'offline'].includes(member.presence)) return `presence=${JSON.stringify(member.presence)} 不在 online/busy/away/offline`
  if (!Array.isArray(member.externalGroups) || !member.externalGroups.every(validText)) return 'externalGroups 应为字符串数组'
  return null
}

const optionalBoolean = (value) => value === undefined || typeof value === 'boolean'

function validRoleOptions(options) {
  return Array.isArray(options) && options.length <= 100
    && options.every((option) => object(option) && validId(option.id) && validText(option.label))
    && new Set(options.map(({ id }) => id)).size === options.length
}

function validMemberActions(value) {
  return object(value) && validRoleOptions(value.roleOptions)
    && optionalBoolean(value.canResetRole) && optionalBoolean(value.canRemove)
    && (value.selectedRoleId === undefined || value.roleOptions.some(({ id }) => id === value.selectedRoleId))
}

function validRoleSettings(settings) {
  return object(settings) && validText(settings.title) && optionalBoolean(settings.canReset)
    && (settings.description === undefined || typeof settings.description === 'string')
    && Array.isArray(settings.fields) && settings.fields.length <= 100 && settings.fields.every((field) =>
      object(field) && validId(field.id) && validText(field.label) && optionalBoolean(field.readOnly)
      && validRoleOptions(field.options) && field.options.some(({ id }) => id === field.value))
    && new Set(settings.fields.map(({ id }) => id)).size === settings.fields.length
}

function roomIssue(room) {
  if (!object(room)) return '不是 JSON 对象'
  if (!validId(room.id)) return '缺少 id（非空字符串，≤128）'
  if (!validText(room.name)) return '缺少 name（房间显示名）'
  if (!validText(room.template)) return '缺少 template（办公室模板 id，如 desk-grid）'
  if (!object(room.frame)) return '缺少 frame（{x,y,width,height}）'
  const frame = room.frame
  if (!['x', 'y', 'width', 'height'].every((key) => Number.isFinite(frame[key]) && frame[key] >= 0)) {
    return 'frame.x/y/width/height 必须是非负数字'
  }
  if(room.boundary!==undefined){
    const boundary=room.boundary
    const ring=points=>Array.isArray(points)&&points.length>=3&&points.length<=256&&points.every(point=>object(point)&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=frame.x-1e-4&&point.y>=frame.y-1e-4&&point.x<=frame.x+frame.width+1e-4&&point.y<=frame.y+frame.height+1e-4)
    if(!object(boundary)||!ring(boundary.outer)||(boundary.holes!==undefined&&(!Array.isArray(boundary.holes)||boundary.holes.length>32||!boundary.holes.every(ring)))||(boundary.outer.length+(boundary.holes??[]).reduce((count,hole)=>count+hole.length,0))>2048)return 'boundary 包含无效区域边界'
  }
  if (!optionalBoolean(room.useTemplateFurniture)) return 'useTemplateFurniture 必须为布尔值'
  if (room.floorMaterial !== undefined && !['wood', 'tile', 'concrete', 'quartz', 'terrazzo'].includes(room.floorMaterial)) return 'floorMaterial 包含不支持的地板材质'
  if (room.walls !== undefined && (!object(room.walls) || Object.keys(room.walls).length > 4
    || !Object.entries(room.walls).every(([side, finish]) => ['north', 'east', 'south', 'west'].includes(side)
      && ['solid', 'glass', 'open'].includes(finish)))) return 'walls 包含无效隔墙方向或材质'
  if (room.door !== undefined) {
    const door = room.door
    if (!object(door) || !['north', 'south', 'east', 'west'].includes(door.side)
      || !Number.isFinite(door.offset) || !Number.isFinite(door.width) || door.width <= 0) return 'door 包含无效门洞'
    const length = ['north', 'south'].includes(door.side) ? frame.width : frame.height
    const center = door.offset * length
    if (center - door.width / 2 < 6 || center + door.width / 2 > length - 6) return 'door 必须与墙角保留空间'
  }
  if (room.seats !== undefined && (!Array.isArray(room.seats) || room.seats.length > 60
    || !room.seats.every((seat) => object(seat)
      && [seat.x, seat.y].every((position) => Number.isFinite(position) && position >= 0 && position <= 1)
      && (seat.rotation === undefined || (Number.isFinite(seat.rotation) && seat.rotation >= 0 && seat.rotation < 360))
      && (seat.facing === undefined || ['north', 'south'].includes(seat.facing))))) return 'seats 包含无效工位'
  if (room.furniture !== undefined && (!Array.isArray(room.furniture) || room.furniture.length > 60
    || !room.furniture.every((item) => object(item) && validId(item.id)
      && ['desk', 'shelf', 'plant', 'sofa', 'coffee', 'lamp', 'workstation', 'chair', 'meeting-table', 'round-table', 'coffee-table', 'counter', 'cabinet', 'display-shelf', 'clothes-rack', 'rug', 'partition', 'screen', 'studio-light', 'camera', 'carton', 'printer', 'trolley', 'microwave', 'sink', 'cup', 'notebook', 'monitor',
        'bench', 'desk-l', 'bookcase', 'whiteboard', 'tv', 'water-cooler', 'plant-large', 'conference-table', 'data-screen'].includes(item.kind)
      && [item.x, item.y].every((position) => Number.isFinite(position) && position >= 0 && position <= 1)
      && (item.color === undefined || /^#[0-9a-fA-F]{6}$/.test(item.color))
      && (item.elevation === undefined || (Number.isFinite(item.elevation) && item.elevation >= 0 && item.elevation <= 200))
      && Number.isFinite(item.rotation) && item.rotation >= 0 && item.rotation < 360
      && (item.size === undefined || (object(item.size)
        && [item.size.width, item.size.depth, ...(item.size.height === undefined ? [] : [item.size.height])].every((v) => Number.isFinite(v) && v >= 1 && v <= 800)))))) return 'furniture 包含无效物件'
  return null
}

// 不含敏感信息，只描述「收到了什么形状」，用于远程排查
function bootstrapShape(raw) {
  if (!object(raw)) return `root=${Array.isArray(raw) ? 'array' : typeof raw}`
  const keys = Object.keys(raw)
  const team = Array.isArray(raw.team) ? raw.team : undefined
  const layout = object(raw.layout) ? raw.layout : undefined
  const rooms = layout && Array.isArray(layout.rooms) ? layout.rooms : undefined
  const first = (list) => (list && object(list[0]) ? Object.keys(list[0]).join('/') : '-')
  return [
    `keys=${keys.join(',') || '(empty)'}`,
    `team=${team ? team.length : typeof raw.team}`,
    `team[0]=${first(team)}`,
    `member_id=${raw.member_id === undefined ? 'missing' : String(raw.member_id).slice(0, 64)}`,
    `layout=${layout ? `w=${layout.width} h=${layout.height} rooms=${rooms ? rooms.length : typeof layout.rooms} room[0]=${first(rooms)} assignments=${object(layout.assignments) ? 'object' : typeof layout.assignments}` : typeof raw.layout}`,
    `policy=${object(raw.policy) ? 'object' : typeof raw.policy}`,
    `dataSlots=${object(raw.dataSlots) ? `object(${Object.keys(raw.dataSlots).length})` : typeof raw.dataSlots}`,
      `jukebox=${object(raw.jukebox) ? `playlists(${Array.isArray(raw.jukebox.playlists) ? raw.jukebox.playlists.length : 'invalid'})` : typeof raw.jukebox}`,
  ].join(' ')
}

function validateBootstrap(raw, binding, log) {
  const fail = (reason) => {
    const shape = bootstrapShape(raw)
    log?.(`bootstrap-invalid reason=${reason} shape=${shape}`)
    throw new WorkspaceError('INVALID_RESPONSE', `工作区返回的数据不符合接入规范：${reason}`)
  }
  if (!object(raw)) fail('响应不是 JSON 对象')
  if (raw.installation_id !== binding.installation_id || raw.workspace_id !== binding.workspace_id) {
    throw new WorkspaceError('WORKSPACE_CHANGED', '服务返回了不同的工作区，请重新核对地址。')
  }
  if (!Array.isArray(raw.permissions) || !raw.permissions.every(validText)) fail('permissions 应为字符串数组（至少包含 office.view）')
  if (!raw.permissions.includes('office.view')) fail('permissions 缺少 office.view（没有进入办公室的权限）')
  if (!object(raw.tenant) || !validText(raw.tenant.name) || raw.tenant.name.length > 200) fail('tenant.name 应为200字以内的当前区域名称')
  if (!validId(raw.member_id)) fail('member_id 缺失，或不是非空字符串')
  if (!Array.isArray(raw.team)) fail('team 应为成员数组')
  for (const [index, member] of raw.team.entries()) {
    const issue = memberIssue(member)
    if (issue) fail(`team[${index}] ${issue}`)
  }
  if (!raw.team.some((entry) => entry.id === raw.member_id)) {
    fail(`team 中没有 id=${raw.member_id} 的成员（bootstrap 必须把自己放进 team）`)
  }
  if (!object(raw.policy)) fail('缺少 policy 对象（可直接返回 {} 或默认同步策略）')
  if (raw.roleSettings !== undefined && !validRoleSettings(raw.roleSettings)) fail('roleSettings 格式无效')
  const layout = raw.layout
  if (!object(layout)) fail('缺少 layout 对象（{width,height,rooms,assignments}）')
  if (!(Number.isFinite(layout.width) && layout.width > 0)) fail(`layout.width 应为正数（当前 ${JSON.stringify(layout.width)}）`)
  if (!(Number.isFinite(layout.height) && layout.height > 0)) fail(`layout.height 应为正数（当前 ${JSON.stringify(layout.height)}）`)
  if(layout.unitsPerMeter!==undefined&&(!Number.isFinite(layout.unitsPerMeter)||layout.unitsPerMeter<10||layout.unitsPerMeter>1000))fail('unitsPerMeter 应为10至1000')
  if (!Array.isArray(layout.rooms)) fail('layout.rooms 应为房间数组')
  if(layout.wallSegments!==undefined){
    if(!Array.isArray(layout.wallSegments)||layout.wallSegments.length>240)fail('layout.wallSegments 最多 240 段')
    const ids=new Set()
    for(const wall of layout.wallSegments){
      if(!object(wall)||!validText(wall.id)||ids.has(wall.id))fail('墙段标识无效或重复');ids.add(wall.id)
      if(![wall.start,wall.end].every(point=>object(point)&&Number.isFinite(point.x)&&Number.isFinite(point.y)&&point.x>=0&&point.y>=0&&point.x<=layout.width&&point.y<=layout.height))fail('墙段端点超出画布')
      const length=Math.hypot(wall.end.x-wall.start.x,wall.end.y-wall.start.y)
      if(length<12||!Number.isFinite(wall.thickness)||wall.thickness<2||wall.thickness>24||!Number.isFinite(wall.height)||wall.height<8||wall.height>100||!['solid','glass'].includes(wall.finish))fail('墙段尺寸或材质无效')
      if(wall.opening!==undefined&&(!object(wall.opening)||!Number.isFinite(wall.opening.width)||!Number.isFinite(wall.opening.offset)||wall.opening.width<12||wall.opening.offset*length-wall.opening.width/2<6||wall.opening.offset*length+wall.opening.width/2>length-6))fail('墙段门洞无效')
    }
  }
  for (const [index, room] of layout.rooms.entries()) {
    const issue = roomIssue(room)
    if (issue) fail(`layout.rooms[${index}] ${issue}`)
  }
  if (!object(layout.assignments)) fail('layout.assignments 应为对象（成员 id → 房间 id，可为空 {}）')
  const badSeat = Object.entries(layout.assignments).find(([, value]) => !validText(value))
  if (badSeat) fail(`layout.assignments.${badSeat[0]} 必须是非空字符串（房间 id）`)
  const visibleTeam = raw.permissions.includes('team.view') ? raw.team : raw.team.filter(({ id }) => id === raw.member_id)
  const visibleIds = new Set(visibleTeam.map(({ id }) => id))
  const assignments = Object.fromEntries(Object.entries(layout.assignments).filter(([id]) => visibleIds.has(id)))
  if (layout.seatAssignments !== undefined && (!object(layout.seatAssignments) || Object.entries(layout.seatAssignments).some(([id,index]) => !Object.hasOwn(layout.assignments,id) || !Number.isInteger(index) || index<0 || index>=60))) fail('layout.seatAssignments 包含无效座位索引')
  const seatAssignments=Object.fromEntries(Object.entries(layout.seatAssignments??{}).filter(([id])=>visibleIds.has(id)))
  if (!object(raw.dataSlots)) fail('dataSlots 应为对象（可为空 {}）')
  const origin = new URL(binding.baseUrl).origin
  const dataSlots = Object.fromEntries(Object.entries(raw.dataSlots).flatMap(([roomId, slot]) => {
    if (!object(slot) || slot.kind !== 'external-api' || !validText(slot.name) || !validText(slot.url)) return []
    try {
      const url = httpsUrl(new URL(slot.url, `${binding.baseUrl}/`).href)
      const refreshSec = Number.isFinite(slot.refreshSec) ? Math.max(15, Math.min(slot.refreshSec, 600)) : undefined
      return url.origin === origin ? [[roomId, { kind: slot.kind, name: slot.name, url: url.href, refreshSec }]] : []
    } catch { return [] }
  }))
  const jukebox = sanitizeJukebox(raw.jukebox)
  return {
    binding, memberId: raw.member_id, permissions: raw.permissions,
    roleSettings: undefined,
    snapshot: {
      // 租户上下文：formal 模式由服务端绑定决定（workspace_id + display_name），
      // 客户端不可选择 —— 与 demo 模式的演示租户共用同一契约字段。
      tenant: { id: binding.workspace_id, name: raw.tenant.name },
      team: visibleTeam.map((member) => ({
        ...member,
        roleId: member.roleId ?? member.role,
        roleName: member.roleName ?? member.role,
        memberActions: undefined,
      })), collaboration: raw.collaboration, policy: raw.policy, layout: { ...layout, assignments, seatAssignments }, dataSlots,
      datasource: { kind: 'oa-rest', baseUrl: binding.baseUrl, apiVersion: 'v1', region: '', useLoginToken: true },
      jukebox,
    },
  }
}

/**
 * 可选的点歌台歌单：媒体文件永远不进 Rallyloom，只接收桌面端可直接播放的 HTTPS 地址。
 * 结构不合法时整体丢弃（点歌台是弱依赖板块，不应因此让工作区加载失败）。
 */
function sanitizeJukebox(value) {
  if (!object(value) || !Array.isArray(value.playlists)) return undefined
  const media = (input) => {
    if (!validText(input)) return undefined
    try { return httpsUrl(input).href } catch { return undefined }
  }
  const playlists = []
  for (const [playlistIndex, entry] of value.playlists.slice(0, 40).entries()) {
    if (!object(entry) || !validText(entry.name) || !Array.isArray(entry.tracks)) continue
    const tracks = []
    for (const [trackIndex, item] of entry.tracks.slice(0, 300).entries()) {
      if (!object(item) || !validText(item.title)) continue
      const url = media(item.url)
      if (!url) continue
      const attrs = object(item.attrs)
        ? Object.fromEntries(Object.entries(item.attrs).flatMap(([key, text]) => (typeof text === 'string' && text.trim() ? [[key, text.trim()]] : [])))
        : undefined
      tracks.push({
        id: validText(item.id) ? item.id : `track-${playlistIndex + 1}-${trackIndex + 1}`,
        title: item.title.trim(),
        artist: validText(item.artist) ? item.artist.trim() : undefined,
        url,
        poster: media(item.poster),
        duration: Number.isFinite(item.duration) ? Math.max(0, item.duration) : undefined,
        sourceId: validText(item.sourceId) ? item.sourceId : undefined,
        attrs: attrs && Object.keys(attrs).length ? attrs : undefined,
      })
    }
    if (!tracks.length) continue
    playlists.push({
      id: validText(entry.id) ? entry.id : `playlist-${playlistIndex + 1}`,
      name: entry.name.trim(),
      description: validText(entry.description) ? entry.description.trim() : undefined,
      tracks,
    })
  }
  if (!playlists.length) return undefined
  return { playlists, note: validText(value.note) ? value.note.trim() : undefined }
}

function keysOf(text) {
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object') return typeof value
    return Object.keys(value).join(',') || '(empty)'
  } catch {
    return `non-json:${String(text).slice(0, 60).replace(/\s+/g, ' ')}`
  }
}

// 令牌端点以 400 返回时，把服务端给出的 error / error_description / error_detail 带进日志与界面，
// 避免每次只能看到一句笼统的「验证失败」。
function responseDetail(text) {
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object') return ''
    const pick = (input, limit) => String(input ?? '-').replace(/\s+/g, ' ').slice(0, limit)
    return ` error=${pick(value.error, 60)} error-description=${pick(value.error_description, 200)} error-detail=${pick(value.error_detail, 300)}`
  } catch {
    return ''
  }
}

async function tokenResponse(protocol, as, client, response, body, contentType, nonce) {
  let parsed
  try { parsed = JSON.parse(body) } catch { parsed = undefined }
  const signed = /jwt/i.test(contentType)
  const hasIdToken = Boolean(parsed && typeof parsed.id_token === 'string')
  if (hasIdToken || signed) {
    return protocol.processAuthorizationCodeResponse(as, client, response, { expectedNonce: nonce, requireIdToken: true })
  }
  // 提供方只发 access_token（OAuth2 语义）时退化成 OAuth2 校验：nonce 没有 id_token 承载，
  // 但 CSRF 仍由 state + PKCE 保证，随后由 bootstrap 校验成员与权限。
  const fallback = new Response(body, {
    status: response.status,
    headers: { 'content-type': contentType || 'application/json' },
  })
  return protocol.processAuthorizationCodeResponse(as, client, fallback)
}

function registerWorkspaceAuth(getWindow, log) {
  const file = path.join(app.getPath('userData'), 'workspace-binding.json')
  const sessionFile = path.join(app.getPath('userData'), 'workspace-session.enc')
  let candidate
  let pending
  let session
  let sessionEpoch = 0
  let flow
  const oauth = () => import('oauth4webapi')

  function cancel() {
    flow?.abort()
    flow = undefined
    candidate = undefined
    pending = undefined
  }

  async function withFlow(run) {
    flow?.abort()
    const current = new AbortController()
    flow = current
    try {
      const value = await run(current.signal)
      current.signal.throwIfAborted()
      return value
    } catch (error) {
      if (current.signal.aborted) throw new WorkspaceError('CANCELLED', '操作已取消。')
      throw error
    } finally {
      if (flow === current) flow = undefined
      current.abort()
    }
  }

  async function readBinding() {
    try {
      const raw = JSON.parse(await readFile(file, 'utf8'))
      const baseUrl = httpsUrl(raw.baseUrl, true).href.replace(/\/+$/, '')
      return describe(raw, baseUrl)
    } catch (error) {
      if (error.code === 'ENOENT') return null
      throw new WorkspaceError('BINDING_FILE', '保存的工作区配置无法读取，请重新绑定。')
    }
  }

  async function persist(binding, signal) {
    const tmp = `${file}.${crypto.randomUUID()}.tmp`
    try {
      await writeFile(tmp, JSON.stringify(binding), 'utf8')
      signal.throwIfAborted()
      await rename(tmp, file)
    } finally {
      await rm(tmp, { force: true }).catch(() => {})
    }
  }

  function clearSavedSession() { rmSync(sessionFile, { force: true }) }

  function persistSession(current) {
    if (!current.refreshToken || !canProtectSession()) {
      clearSavedSession()
      return
    }
    const { binding, refreshToken, tokenEndpoint, revokeEndpoint } = current
    const encrypted = safeStorage.encryptString(JSON.stringify({ binding, refreshToken, tokenEndpoint, revokeEndpoint }))
    const temporary = `${sessionFile}.${crypto.randomUUID()}.tmp`
    try {
      writeFileSync(temporary, encrypted, { mode: 0o600, flag: 'wx' })
      renameSync(temporary, sessionFile)
    } finally {
      rmSync(temporary, { force: true })
    }
  }

  function canProtectSession() {
    return safeStorage.isEncryptionAvailable()
      && (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
  }

  function restoreSession(binding) {
    if (!binding || !canProtectSession()) return undefined
    try {
      const saved = JSON.parse(safeStorage.decryptString(readFileSync(sessionFile)))
      if (JSON.stringify(saved.binding) !== JSON.stringify(binding) || !validText(saved.refreshToken))
        throw new Error('Binding mismatch')
      return {
        binding, refreshToken: saved.refreshToken, expiresAt: 0,
        tokenEndpoint: httpsUrl(saved.tokenEndpoint).href,
        revokeEndpoint: saved.revokeEndpoint ? httpsUrl(saved.revokeEndpoint).href : undefined,
      }
    } catch (error) {
      if (error.code !== 'ENOENT') clearSavedSession()
      return undefined
    }
  }

  function tokenExpiry(tokens) {
    return Number.isFinite(tokens.expires_in) ? Date.now() + tokens.expires_in * 1000 : Infinity
  }

  async function currentAccess(current, signal) {
    signal?.throwIfAborted()
    if (current.token && current.expiresAt > Date.now() + 30_000) return current.token
    if (!current.refreshToken) {
      if (current.token && current.expiresAt > Date.now()) return current.token
      throw new WorkspaceError('AUTH_REQUIRED', '登录已失效，请重新授权。')
    }
    if (!current.refreshing) {
      const epoch = sessionEpoch
      current.refreshing = (async () => {
        try {
          const tokens = await fetchJson(current.tokenEndpoint, {
            method: 'POST',
            headers: { Accept: 'application/json' },
            body: new URLSearchParams({
              grant_type: 'refresh_token', refresh_token: current.refreshToken,
              client_id: current.binding.authorization.client_id, resource: current.binding.authorization.resource,
            }),
          })
          if (!object(tokens) || !validText(tokens.access_token) || typeof tokens.token_type !== 'string'
            || tokens.token_type.toLowerCase() !== 'bearer')
            throw new WorkspaceError('INVALID_RESPONSE', '会话续期返回了无效的访问令牌。')
          if (sessionEpoch !== epoch) throw new WorkspaceError('CANCELLED', '登录状态已切换。')
          if (validText(tokens.refresh_token)) current.refreshToken = tokens.refresh_token
          current.token = tokens.access_token
          current.expiresAt = tokenExpiry(tokens)
          persistSession(current)
        } catch (error) {
          if (error.code === 'AUTH_REQUIRED' || (error.code === 'INVALID_REQUEST' && error.message === 'invalid_grant')) {
            if (sessionEpoch === epoch) {
              session = undefined
              clearSavedSession()
            }
            throw new WorkspaceError('AUTH_REQUIRED', '登录已过期，请重新授权。')
          }
          throw error
        } finally {
          current.refreshing = undefined
        }
      })()
    }
    await current.refreshing
    signal?.throwIfAborted()
    return current.token
  }

  async function endSession(forget = false) {
    cancel()
    sessionEpoch += 1
    const current = session ?? restoreSession(await readBinding().catch(() => null))
    session = undefined
    clearSavedSession()
    if (forget) await rm(file, { force: true })
    await revokeSession(current)
  }

  async function revokeSession(current) {
    if (!current?.refreshToken || !current.revokeEndpoint) return
    try {
      await fetch(current.revokeEndpoint, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(2500),
        body: new URLSearchParams({
          token: current.refreshToken, token_type_hint: 'refresh_token', client_id: current.binding.authorization.client_id,
        }),
      })
    } catch { /* A device can always clear its own login while offline. */ }
  }

  // 失败时落盘一份「结构快照」，让用户/提供方不必再猜是哪个字段：
  // %APPDATA%\Rallyloom\workspace-diagnostic.json
  async function writeDiagnostic(raw, binding, error) {
    const file = path.join(app.getPath('userData'), 'workspace-diagnostic.json')
    const trim = (value, depth = 0) => {
      if (typeof value === 'string') return value.length > 200 ? `${value.slice(0, 200)}…` : value
      if (Array.isArray(value)) return depth >= 4 ? `[array(${value.length})]` : value.slice(0, 5).map((item) => trim(item, depth + 1))
      if (value && typeof value === 'object') {
        if (depth >= 4) return `{object(${Object.keys(value).length})}`
        return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [key, trim(item, depth + 1)]))
      }
      return value
    }
    const payload = {
      generatedAt: new Date().toISOString(),
      baseUrl: binding?.baseUrl, workspaceId: binding?.workspace_id, installationId: binding?.installation_id,
      failure: { code: error?.code ?? '-', message: String(error?.message ?? error) },
      bootstrapShape: bootstrapShape(raw),
      bootstrap: trim(raw),
    }
    await writeFile(file, JSON.stringify(payload, null, 2), 'utf8').catch(() => {})
    return file
  }

  async function bootstrap(current, signal, endpoint = '/bootstrap', options = {}) {
    const { binding } = current
    const token = await currentAccess(current, signal)
    const raw = await fetchJson(`${binding.baseUrl}${API}${endpoint}`, {
      ...options, headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...options.headers }, signal,
    })
    let joined
    try {
      joined = validateBootstrap(raw, binding, log)
    } catch (error) {
      const file = await writeDiagnostic(raw, binding, error)
      error.message = `${error.message}（诊断文件：${file}）`
      throw error
    }
    signal.throwIfAborted()
    current.slots = joined.snapshot.dataSlots
    return joined
  }

  function awaitCallback(state, signal) {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
        if (pending?.state === state) pending = undefined
      }
      const abort = () => { cleanup(); reject(signal.reason) }
      const timer = setTimeout(() => {
        cleanup()
        reject(new WorkspaceError('AUTH_TIMEOUT', '等待浏览器授权超时，请重试；若浏览器页面显示了报错（例如 Invalid CORS request），请联系企业管理员按接入规范 §11 检查登录页响应头。'))
      }, 180_000)
      signal.addEventListener('abort', abort, { once: true })
      pending = { state, accept: (params) => { cleanup(); resolve(params) } }
    })
  }

  // 接入规范 §11：提供方自渲染的登录页不得返回 Referrer-Policy: no-referrer。
  // Chromium 会按文档策略把表单 POST 的 Origin 序列化成 null，网关的 CORS 过滤器会直接
  // 返回 403「Invalid CORS request」——用户只看到一个纯文本错误页，而客户端还在傻等回调。
  // 所以打开浏览器前先探一次响应头，把根因直接告诉用户，而不是等 180s 超时。
  async function preflightAuthorizePage(target, signal) {
    let response
    try {
      response = await fetch(target, {
        method: 'GET',
        redirect: 'follow',
        headers: { accept: 'text/html' },
        signal: AbortSignal.any([signal, AbortSignal.timeout(6_000)]),
      })
    } catch {
      return
    }
    void response.body?.cancel?.().catch(() => {})
    if (!response.ok) return
    const policies = (response.headers.get('referrer-policy') ?? '')
      .toLowerCase()
      .split(',')
      .map((token) => token.trim())
    if (policies.includes('no-referrer')) {
      throw new WorkspaceError(
        'AUTH_PROVIDER_MISCONFIGURED',
        '企业登录页返回了 Referrer-Policy: no-referrer：浏览器提交登录表单时会发送 Origin: null，被网关的 CORS 过滤器拒绝（浏览器里显示「Invalid CORS request」）。请管理员把该页面的 Referrer-Policy 改为 same-origin（接入规范 §11）。',
      )
    }
  }

  function handle(name, run) {
    ipcMain.handle(`workspace:${name}`, async (event, ...args) => {
      const web = getWindow()?.webContents
      if (!web || event.sender !== web || event.senderFrame !== web.mainFrame) return { ok: false, code: 'FORBIDDEN', error: '请求来源无效。' }
      try { return { ok: true, value: await run(...args) } }
      catch (error) {
        if (error instanceof WorkspaceError) return { ok: false, code: error.code, error: error.message }
        return { ok: false, code: 'UNEXPECTED', error: '工作区操作未完成，请重试或联系企业管理员。' }
      }
    })
  }

  handle('binding', readBinding)
  handle('discover', (address) => withFlow(async (signal) => {
    candidate = undefined
    const baseUrl = httpsUrl(address, true).href.replace(/\/+$/, '')
    const binding = describe(await fetchJson(`${baseUrl}${API}/discovery`, { signal }), baseUrl)
    signal.throwIfAborted()
    candidate = binding
    return binding
  }))
  handle('signin', () => withFlow(async (signal) => {
    const binding = candidate
    if (!binding) throw new WorkspaceError('DISCOVER_FIRST', '请先检测工作区服务。')
    const previous = session ?? restoreSession(await readBinding().catch(() => null))
    const protocol = await oauth()
    const issuer = httpsUrl(binding.authorization.issuer, true)
    let as
    let params
    let tokens
    let tokenDiagnostic = '-'
    try {
      const discovery = await protocol.discoveryRequest(issuer, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) })
      as = await protocol.processDiscoveryResponse(issuer, discovery)
      for (const endpoint of [as.authorization_endpoint, as.token_endpoint, as.jwks_uri]) httpsUrl(endpoint)
      const client = { client_id: binding.authorization.client_id }
      const state = protocol.generateRandomState()
      const nonce = protocol.generateRandomNonce()
      const verifier = protocol.generateRandomCodeVerifier()
      const resource = binding.authorization.resource
      const supportsRemembering = canProtectSession() && as.grant_types_supported?.includes('refresh_token')
        && as.scopes_supported?.includes('offline_access')
      const target = new URL(as.authorization_endpoint)
      for (const [key, value] of Object.entries({
        client_id: client.client_id, redirect_uri: CALLBACK, response_type: 'code',
        scope: supportsRemembering ? 'openid profile offline_access' : 'openid profile',
        state, nonce, resource, code_challenge: await protocol.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
      })) target.searchParams.set(key, value)
      signal.throwIfAborted()
      log?.(`signin-authorize host=${target.host} scope=${target.searchParams.get('scope') ?? '-'}`)
      await preflightAuthorizePage(target.href, signal)
      const callback = awaitCallback(state, signal)
      params = await Promise.all([shell.openExternal(target.href), callback]).then(([, value]) => value)
      const validated = protocol.validateAuthResponse(as, client, params, state)
      const response = await protocol.authorizationCodeGrantRequest(as, client, protocol.None(), validated, CALLBACK, verifier, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
        additionalParameters: new URLSearchParams({ resource }),
      })
      const contentType = response.headers.get('content-type') ?? ''
      const body = await response.clone().text()
      tokenDiagnostic = `status=${response.status} content-type=${contentType || '-'} body-keys=${keysOf(body)}`
      if (!response.ok) tokenDiagnostic += responseDetail(body)
      tokens = await tokenResponse(protocol, as, client, response, body, contentType, nonce)
      // 应用级签名校验只适用于「令牌响应本身是签名 JWT」（FAPI 风格，Content-Type: application/jwt）。
      // 普通 JSON 令牌响应没有可校验的 JWS，oauth4webapi 会直接抛错，不能无条件调用。
      if (/jwt/i.test(contentType)) {
        await protocol.validateApplicationLevelSignature(as, response, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]) })
      }
      log?.(`signin-token-ok id-token=${Boolean(tokens.id_token)} content-type=${contentType || '-'}`)
    } catch (error) {
      if (error instanceof WorkspaceError || signal.aborted) throw error
      log?.(`signin-failed name=${error?.name ?? '-'} code=${error?.code ?? '-'} message=${String(error?.message ?? error).slice(0, 300)} token=${tokenDiagnostic}`)
      if (params?.get('error') === 'access_denied') throw new WorkspaceError('AUTH_DENIED', '企业登录授权未通过。')
      const cause = String(error?.message ?? error).replace(/\s+/g, ' ').slice(0, 180)
      const serverDetail = tokenDiagnostic.match(/error-detail=(.+)$/)?.[1]
      const extra = serverDetail && serverDetail !== '-' ? `；服务端：${serverDetail.slice(0, 160)}` : ''
      throw new WorkspaceError('OIDC', `企业身份服务验证失败，请核对登录配置或重试。（诊断：${cause}${extra}）`)
    }
    const current = {
      binding, token: tokens.access_token, expiresAt: tokenExpiry(tokens), refreshToken: tokens.refresh_token,
      tokenEndpoint: as.token_endpoint,
      revokeEndpoint: as.revocation_endpoint ? httpsUrl(as.revocation_endpoint).href : undefined,
    }
    let joined
    try {
      joined = await bootstrap(current, signal)
    } catch (error) {
      log?.(`bootstrap-failed code=${error?.code ?? '-'} message=${String(error?.message ?? error).slice(0, 300)}`)
      throw error
    }
    signal.throwIfAborted()
    await persist(binding, signal)
    signal.throwIfAborted()
    persistSession(current)
    sessionEpoch += 1
    session = current
    if (previous) void revokeSession(previous)
    return joined
  }))
  handle('resume', () => withFlow(async (signal) => {
    const binding = session ? undefined : await readBinding()
    signal.throwIfAborted()
    const current = session ?? restoreSession(binding)
    if (!current) return null
    session = current
    try { return await bootstrap(current, signal) }
    catch (error) {
      if (session === current && ['AUTH_REQUIRED', 'FORBIDDEN', 'WORKSPACE_CHANGED'].includes(error.code)) {
        session = undefined
        clearSavedSession()
      }
      throw error
    }
  }))
  // Enterprise identity is authoritative. Legacy IPC cannot mutate roles or membership.
  handle('manageMember', () => { throw new WorkspaceError('FORBIDDEN', '成员与权限请在企业系统管理。') })
  handle('saveRoleSettings', () => { throw new WorkspaceError('FORBIDDEN', '角色由企业系统决定，不支持本地映射。') })
  handle('saveOfficeLayout', (layout) => withFlow(async (signal) => {
    const current = session
    if (!current) throw new WorkspaceError('AUTH_REQUIRED', '登录已失效，请重新授权。')
    if (!object(layout)) throw new WorkspaceError('INVALID_REQUEST', '办公室布局格式无效。')
    return bootstrap(current, signal, '/layout', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    })
  }))
  handle('saveRoomSlot', (roomId, enabled) => withFlow(async (signal) => {
    const current = session
    if (!current) throw new WorkspaceError('AUTH_REQUIRED', '登录已失效，请重新授权。')
    if (!validId(roomId) || !/^[a-zA-Z0-9_-]+$/.test(roomId) || typeof enabled !== 'boolean') throw new WorkspaceError('INVALID_REQUEST', '房间看板配置无效。')
    const slot = enabled ? { kind: 'external-api', name: '企业工作概览', url: `${current.binding.baseUrl}${API}/data-slots/${roomId}`, refreshSec: 60 } : null
    return bootstrap(current, signal, `/rooms/${roomId}/slot`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot }) })
  }))
  // Constrained same-origin collaboration transport. Access/refresh tokens never enter the renderer.
  handle('oa', async (method, endpoint, body, tenant) => {
    const current=session
    if(!current)throw new WorkspaceError('AUTH_REQUIRED','登录已失效，请重新授权。')
    if(!['GET','POST','PATCH','PUT','DELETE'].includes(method) || typeof endpoint!=='string' || endpoint.length>1000 ||
       !/^\/oa\/[a-zA-Z0-9_/?=&%.-]+$/.test(endpoint) || endpoint.includes('..') || (tenant!==undefined && !/^[a-zA-Z0-9_-]{1,128}$/.test(tenant)))
      throw new WorkspaceError('INVALID_REQUEST','协作请求无效。')
    const access=await currentAccess(current)
    const url=`${current.binding.baseUrl}${API}${endpoint}`
    const headers={Accept:'application/json',Authorization:`Bearer ${access}`}
    if(tenant!==undefined)headers['X-Rallyloom-Scope']=tenant
    if(endpoint==='/oa/jukebox/tracks'){
      if(method!=='POST'||!body||!(body.bytes instanceof Uint8Array)||typeof body.fileName!=='string')throw new WorkspaceError('INVALID_REQUEST','歌曲文件请求无效。')
      const form=new FormData()
      form.set('title',typeof body.title==='string'?body.title:'')
      form.set('file',new Blob([Buffer.from(body.bytes)],{type:'video/mp4'}),body.fileName)
      let response
      try{response=await fetch(url,{method:'POST',headers,body:form,redirect:'error',signal:AbortSignal.timeout(120_000)})}
      catch(error){if(error.name==='TimeoutError')throw new WorkspaceError('NETWORK','歌曲上传超时，请重试。');throw new WorkspaceError('NETWORK','歌曲上传失败，请检查网络后重试。')}
      if(!response.ok){let message='歌曲上传失败，请重试。';try{const data=await response.json();if(typeof data.error==='string')message=data.error.slice(0,200)}catch{/* response is not JSON */}throw new WorkspaceError(response.status===400?'INVALID_REQUEST':'SERVER',message)}
      const value=await response.json()
      if(session!==current)throw new WorkspaceError('CANCELLED','登录状态已切换。')
      return value
    }
    if(endpoint.startsWith('/oa/jukebox/media/')){
      if(method!=='GET')throw new WorkspaceError('INVALID_REQUEST','歌曲媒体请求无效。')
      let response
      try{response=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(120_000)})}
      catch(error){if(error.name==='TimeoutError')throw new WorkspaceError('NETWORK','歌曲加载超时，请重试。');throw new WorkspaceError('NETWORK','歌曲加载失败，请检查网络后重试。')}
      if(!response.ok)throw new WorkspaceError(response.status===401?'AUTH_REQUIRED':'FORBIDDEN','歌曲不存在或当前身份无权播放。')
      const bytes=Buffer.from(await response.arrayBuffer())
      if(session!==current)throw new WorkspaceError('CANCELLED','登录状态已切换。')
      return {base64:bytes.toString('base64'),contentType:response.headers.get('content-type')||'video/mp4'}
    }
    if(body!==undefined)headers['Content-Type']='application/json'
    if(endpoint.startsWith('/oa/chat/attachments/')){
      if(method!=='GET')throw new WorkspaceError('INVALID_REQUEST','附件请求无效。')
      const response=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(15000)})
      if(!response.ok)throw new WorkspaceError('FORBIDDEN','附件不存在或无权下载。')
      const bytes=Buffer.from(await response.arrayBuffer())
      if(session!==current)throw new WorkspaceError('CANCELLED','登录状态已切换。')
      return {base64:bytes.toString('base64')}
    }
    const value=await fetchJson(url,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})
    if(session!==current)throw new WorkspaceError('CANCELLED','登录状态已切换。')
    return value
  })
  handle('slot', async (roomId) => {
    const current = session
    if (!current) throw new WorkspaceError('AUTH_REQUIRED', '登录已失效，请重新授权。')
    const url = validId(roomId) && Object.hasOwn(current.slots, roomId) ? current.slots[roomId].url : undefined
    if (!url) throw new WorkspaceError('FORBIDDEN', '当前工作区没有为此房间配置看板。')
    const access = await currentAccess(current)
    if (session !== current) throw new WorkspaceError('AUTH_REQUIRED', '登录已失效，请重新授权。')
    const data = await fetchJson(url, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${access}` },
    })
    if (session !== current || current.slots[roomId]?.url !== url) throw new WorkspaceError('CANCELLED', '工作区配置已更新。')
    if (!object(data) || !Array.isArray(data.rows) || !data.rows.every((row) =>
      object(row) && typeof row.label === 'string' && typeof row.value === 'string' &&
      (row.delta === undefined || typeof row.delta === 'string'))) {
      throw new WorkspaceError('INVALID_RESPONSE', '看板返回的数据格式有误。')
    }
    return data.rows
  })
  const receiveCallback = (raw) => {
    if (typeof raw !== 'string' || !raw.startsWith(CALLBACK)) return false
    if (!pending) { log?.('callback-without-pending-flow'); return false }
    const verdict = callbackState(raw, pending.state)
    if (!verdict.ok) { log?.(`callback-rejected ${verdict.reason}`); return false }
    pending.accept(new URL(raw).searchParams)
    log?.('callback-accepted')
    return true
  }

  // 手动回填回调地址：浏览器未能拉起应用（被拦截 / 协议未关联）时的兜底通道
  handle('callback', (raw) => {
    if (!receiveCallback(raw)) throw new WorkspaceError('CALLBACK_REJECTED', '回调地址无效，或授权已过期，请重新发起授权。')
    return true
  })

  handle('cancel', cancel)
  handle('logout', () => endSession())
  handle('forget', () => endSession(true))

  return receiveCallback
}

/**
 * 校验深链回调是否属于当前登录请求。
 * Chromium 序列化自定义协议时会把「空路径」补成 "/"（rallyloom://callback/?code=…），
 * Windows 再原样作为 argv 交给应用；空路径与 "/" 视为同一个回调地址。
 */
function callbackState(raw, expectedState) {
  try {
    const url = new URL(raw)
    const path = url.pathname === '' || url.pathname === '/' ? '' : url.pathname
    if (url.protocol !== 'rallyloom:' || url.hostname !== 'callback' || path ||
      url.port || url.username || url.password || url.hash) {
      return { ok: false, reason: `path=${JSON.stringify(url.pathname)}` }
    }
    const states = url.searchParams.getAll('state')
    if (states.length !== 1) return { ok: false, reason: `state-count=${states.length}` }
    if (states[0] !== expectedState) return { ok: false, reason: 'state-mismatch' }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: `parse-error ${error && error.message}` }
  }
}

module.exports = { registerWorkspaceAuth, callbackState, validateBootstrap, bootstrapShape }
