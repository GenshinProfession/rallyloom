/* Rallyloom — 名册投影
   布局（assignments）+ 团队（含 JIT 新成员）→ 办公室场景人物。
   有视觉档案的成员用 office.ts 种子形象；JIT 入队还没有形象的成员
   用中性默认形象呈现（编排完成后即刻上工位）。 */

import { MEMBERS, type Member } from '@/data/office'
import type { TeamMember } from '@/lib/identity/types'
import type { LayoutState } from './types'

/** 未登记视觉档案的成员使用的中性默认形象 */
const DEFAULT_VISUAL = { body: '#737172', skin: '#c89868', hair: '#4b4f5a' }

/** 场景 / 概览面板使用的名册：assignments 决定谁出现在哪个房间 */
export function rosterOf(layout: LayoutState, team: TeamMember[], demo = true, includeUnassigned = false): Member[] {
  const out: Member[] = []
  for (const [pid, roomId] of Object.entries(layout.assignments)) {
    const room = layout.rooms.find((r) => r.id === roomId)
    if (!room) continue
    const visual = demo ? MEMBERS.find((m) => m.id === pid) : undefined
    if (visual) {
      out.push({ ...visual, roomId })
      continue
    }
    const tm = team.find((t) => t.id === pid)
    if (tm) {
      out.push({
        id: tm.id,
        name: tm.displayName,
        role: tm.roleName ?? tm.attrs['岗位'] ?? '成员',
        roomId,
        presence: tm.presence,
        current: demo ? '新入队 · 已入座' : tm.roleName ?? tm.attrs['岗位'] ?? '成员',
        ...DEFAULT_VISUAL,
      })
    }
  }
  if (includeUnassigned) {
    const known = new Set(out.map(member => member.id))
    for (const member of team) if (!known.has(member.id) && member.officeAssignable !== false)
      out.push({ id: member.id, name: member.displayName, role: member.roleName ?? '', roomId: '', presence: member.presence, current: '', ...DEFAULT_VISUAL })
  }
  return out
}

/** 布局对话框可编排的全员池：31 位办公室成员 + JIT 入队的外部成员 */
export function assignablePool(team: TeamMember[]): { id: string; name: string }[] {
  const officeIds = new Set(MEMBERS.map((m) => m.id))
  const pool = MEMBERS.map((m) => ({ id: m.id, name: m.name }))
  for (const t of team) {
    // 演示身份 idpId = demo-u-<officeId>：能对上办公室档案的已在池中
    const officeId = t.idpId.startsWith('demo-u-') ? t.idpId.slice('demo-u-'.length) : null
    if (officeId && officeIds.has(officeId)) continue
    if (MEMBERS.some((m) => m.id === t.id)) continue
    pool.push({ id: t.id, name: t.displayName })
  }
  return pool
}
