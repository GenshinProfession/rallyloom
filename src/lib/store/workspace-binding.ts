import type { LayoutState, SlotRow, WorkspaceSnapshot } from './types'
import type { ProviderRoleSettings } from '@/lib/identity/types'

export interface WorkspaceBinding {
  baseUrl: string
  installation_id: string
  workspace_id: string
  display_name: string
  api_version: 'v1'
  authorization: { issuer: string; client_id: string; resource: string }
}

export interface JoinedWorkspace {
  binding: WorkspaceBinding
  memberId: string
  permissions: string[]
  roleSettings?: ProviderRoleSettings
  snapshot: WorkspaceSnapshot
}

export type MemberAction = { kind: 'role'; roleId: string | null } | { kind: 'remove' }

type WorkspaceResult<T> = { ok: true; value: T } | { ok: false; code: string; error: string }

export interface WorkspaceBridge {
  binding(): Promise<WorkspaceResult<WorkspaceBinding | null>>
  discover(address: string): Promise<WorkspaceResult<WorkspaceBinding>>
  signIn(): Promise<WorkspaceResult<JoinedWorkspace>>
  /** 浏览器未能拉起应用时，手动回填 rallyloom://callback?... 授权回调地址 */
  callback(url: string): Promise<WorkspaceResult<boolean>>
  resume(): Promise<WorkspaceResult<JoinedWorkspace | null>>
  manageMember(memberId: string, action: MemberAction): Promise<WorkspaceResult<JoinedWorkspace>>
  saveRoleSettings(values: Record<string, string>): Promise<WorkspaceResult<JoinedWorkspace>>
  saveOfficeLayout(layout: LayoutState): Promise<WorkspaceResult<JoinedWorkspace>>
  slot(roomId: string): Promise<WorkspaceResult<SlotRow[]>>
  cancel(): Promise<WorkspaceResult<void>>
  logout(): Promise<WorkspaceResult<void>>
  forget(): Promise<WorkspaceResult<void>>
}

export function workspaceValue<T>(result: WorkspaceResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.value
}
