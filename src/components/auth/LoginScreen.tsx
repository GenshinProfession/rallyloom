import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Building2, Check, ChevronDown, CircleAlert, ExternalLink, Globe2, LayoutGrid } from 'lucide-react'
import officePreview from '@/assets/office-preview.webp'
import { Logo } from '@/components/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CONNECTORS } from '@/lib/identity/connector'
import type { IdentityConnector } from '@/lib/identity/types'
import { demoTenantName } from '@/lib/store/client'
import { workspaceValue, type JoinedWorkspace, type WorkspaceBinding } from '@/lib/store/workspace-binding'
import './login.css'

const roles = CONNECTORS.filter(({ status }) => status === 'mock')
const defaultRole = roles.find(({ id }) => id === 'demo-idp-admin') ?? roles[0]

/** 演示角色按所属公司分组。 */
const roleGroups = (() => {
  const groups: { tenantId: string; label: string; roles: IdentityConnector[] }[] = []
  for (const role of roles) {
    const tenantId = role.tenantId ?? 'tenant-a'
    let group = groups.find((g) => g.tenantId === tenantId)
    if (!group) {
      group = { tenantId, label: demoTenantName(tenantId), roles: [] }
      groups.push(group)
    }
    group.roles.push(role)
  }
  return groups
})()
type Stage = 'home' | 'address' | 'review'
type Busy = 'detect' | 'signin' | 'demo' | 'resume' | null

export function LoginScreen({ onEnter, onDemo, entryError }: {
  onEnter: (workspace: JoinedWorkspace) => void
  onDemo: (role: IdentityConnector, signal: AbortSignal) => Promise<void>
  entryError?: string
}) {
  const bridge = window.rallyloom?.workspace
  const [saved, setSaved] = useState<WorkspaceBinding | null>(null)
  const [candidate, setCandidate] = useState<WorkspaceBinding | null>(null)
  const [stage, setStage] = useState<Stage>('home')
  const [busy, setBusy] = useState<Busy>(null)
  const [address, setAddress] = useState('')
  const [error, setError] = useState(entryError ?? '')
  const [chooseRole, setChooseRole] = useState(false)
  const [manualUrl, setManualUrl] = useState('')
  const [manualError, setManualError] = useState('')
  const request = useRef<AbortController | null>(null)
  const reviewReturn = useRef<'home' | 'address'>('home')
  const previousStage = useRef(stage)
  const title = useRef<HTMLHeadingElement>(null)
  const addressField = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (previousStage.current === stage) return
    previousStage.current = stage
    if (stage === 'address') addressField.current?.focus({ preventScroll: true })
    else title.current?.focus({ preventScroll: true })
  }, [stage])

  useEffect(() => {
    if (!bridge) return
    let active = true
    void bridge.binding().then((result) => {
      if (active) setSaved(workspaceValue(result))
    }).catch((failure: unknown) => {
      if (active) setError(failure instanceof Error ? failure.message : '无法读取保存的绑定。')
    })
    return () => { active = false }
  }, [bridge])

  function cancel() {
    request.current?.abort()
    request.current = null
    void bridge?.cancel().catch(() => {})
    setBusy(null)
  }

  async function submitCallback() {
    const value = manualUrl.trim()
    if (!bridge || !value) return
    setManualError('')
    try {
      const result = await bridge.callback(value)
      if (!result.ok) { setManualError(result.error); return }
      setManualUrl('')
    } catch (failure) {
      setManualError(failure instanceof Error ? failure.message : '回调地址无法识别。')
    }
  }

  async function run(action: Exclude<Busy, null>, execute: (signal: AbortSignal) => Promise<void>) {
    request.current?.abort()
    const current = new AbortController()
    request.current = current
    setError('')
    setBusy(action)
    try { await execute(current.signal) }
    catch (failure) {
      if (!current.signal.aborted) setError(failure instanceof Error ? failure.message : '操作失败，请重试。')
    } finally {
      if (request.current === current) {
        request.current = null
        setBusy(null)
      }
    }
  }

  function detect() {
    if (!bridge || !address.trim()) return
    void run('detect', async (signal) => {
      const found = workspaceValue(await bridge.discover(address.trim()))
      if (signal.aborted) return
      setCandidate(found)
      reviewReturn.current = 'address'
      setStage('review')
    })
  }

  function resume() {
    if (!bridge || !saved) return
    void run('resume', async (signal) => {
      const result = await bridge.resume()
      const joined = !result.ok && result.code === 'AUTH_REQUIRED' ? null : workspaceValue(result)
      if (signal.aborted) return
      if (joined) { onEnter(joined); return }
      const found = workspaceValue(await bridge.discover(saved.baseUrl))
      if (signal.aborted) return
      if (found.installation_id !== saved.installation_id || found.workspace_id !== saved.workspace_id ||
        found.authorization.issuer !== saved.authorization.issuer ||
        found.authorization.client_id !== saved.authorization.client_id ||
        found.authorization.resource !== saved.authorization.resource) {
        throw new Error('该地址返回了不同的工作区或登录配置，请核对后重新绑定。')
      }
      setCandidate(found)
      reviewReturn.current = 'home'
      setStage('review')
    })
  }

  function demo(role = defaultRole) {
    void bridge?.cancel().catch(() => {})
    void run('demo', (signal) => onDemo(role, signal))
  }

  function back() {
    cancel()
    setError('')
    setStage(stage === 'review' ? reviewReturn.current : 'home')
  }

  return (
    <main className="workspace-entry" data-workspace-entry={stage}>
      <div className="entry-frame">
        <section className="entry-form" aria-labelledby="entry-title">
          <div className="entry-brand"><Logo className="size-7" /><span>Rallyloom</span></div>
          <div className="entry-content">
            {stage !== 'home' && <div className="entry-navigation">
              <button className="entry-back ui-press" type="button" onClick={back}><ArrowLeft size={14} /> 返回</button>
              <ol className="entry-steps" aria-label="绑定进度">
                <li aria-current={stage === 'address' ? 'step' : undefined}>{stage === 'review' && <Check size={12} aria-hidden />} 服务检测</li>
                <li aria-current={stage === 'review' ? 'step' : undefined}>企业授权</li>
              </ol>
            </div>}
            <div key={stage} className="entry-stage" aria-busy={busy === 'detect' || busy === 'resume' || busy === 'signin' || undefined}>
              <h1 id="entry-title" ref={title} tabIndex={-1}>{stage === 'home' ? '进入工作区' : stage === 'address' ? '绑定公司工作区' : '使用企业账号授权'}</h1>

              {stage === 'home' && (
                <>
                  <p className="entry-lead">{saved ? '使用公司账号进入已绑定的工作区。' : '连接公司的 OA 服务，用企业账号登录。'}</p>
                  {saved && <div className="entry-binding">
                    <span className="entry-binding-icon"><Building2 size={18} aria-hidden /></span>
                    <div><strong>{saved.display_name}</strong><small title={saved.baseUrl}>{saved.baseUrl}</small></div>
                  </div>}
                  <Button type="button" data-entry-main className="entry-primary" disabled={!!busy || !bridge} onClick={() => {
                    if (saved) resume()
                    else { setError(''); setStage('address') }
                  }}>
                    {busy === 'resume' ? '正在验证工作区…' : saved ? '进入公司工作区' : '绑定公司工作区'}
                    {busy !== 'resume' && <ArrowRight aria-hidden />}
                  </Button>
                  {saved && <div className="entry-inline-actions">
                    <button type="button" disabled={!!busy} onClick={() => { setAddress(saved.baseUrl); setError(''); setStage('address') }}>更换工作区</button>
                    <button type="button" disabled={!!busy} onClick={() => void run('detect', async (signal) => {
                      workspaceValue(await bridge!.forget())
                      if (!signal.aborted) { setSaved(null); setAddress(''); setCandidate(null) }
                    })}>解除本机绑定</button>
                  </div>}
                  {!bridge && <p className="entry-help">正式授权请在 Rallyloom 桌面应用中打开。</p>}
                </>
              )}

              {stage === 'address' && (
                <form onSubmit={(event) => { event.preventDefault(); detect() }}>
                  <p id="workspace-address-help" className="entry-lead">请输入管理员提供的 HTTPS 地址。</p>
                  <label htmlFor="workspace-address">OA 服务地址</label>
                  <div className="entry-address-field">
                    <Globe2 size={16} aria-hidden />
                    <Input id="workspace-address" ref={addressField} className="entry-address" value={address} onChange={(event) => setAddress(event.target.value)}
                      placeholder="https://oa.example.com" autoComplete="url" inputMode="url" spellCheck={false} disabled={!!busy}
                      aria-describedby={`workspace-address-help${error ? ' entry-error' : ''}`} aria-invalid={!!error || undefined} />
                  </div>
                  <Button type="submit" data-detect-workspace className="entry-primary" disabled={!!busy || !address.trim()}>
                    {busy === 'detect' ? '正在检测服务…' : '检测服务'}
                    {busy !== 'detect' && <ArrowRight aria-hidden />}
                  </Button>
                </form>
              )}

              {stage === 'review' && candidate && (
                <>
                  <p className="entry-lead">核对工作区后，在系统浏览器完成登录。</p>
                  <div className="entry-binding" data-verified-workspace>
                    <span className="entry-binding-icon"><Building2 size={18} aria-hidden /></span>
                    <div><strong>{candidate.display_name}</strong><small title={candidate.baseUrl}>{candidate.baseUrl}</small></div>
                    <span className="entry-connected"><Check size={13} aria-hidden /> 服务可连接</span>
                  </div>
                  <p className="entry-issuer"><span>授权服务</span><bdi title={candidate.authorization.issuer}>{candidate.authorization.issuer}</bdi></p>
                  <Button type="button" data-authorize-workspace className="entry-primary" disabled={!!busy} onClick={() => void run('signin', async (signal) => {
                    const joined = workspaceValue(await bridge!.signIn())
                    if (!signal.aborted) onEnter(joined)
                  })}>
                    {busy === 'signin' ? '等待企业授权…' : <>打开企业登录页 <ExternalLink aria-hidden /></>}
                  </Button>
                  {busy === 'signin' && (
                    <>
                      <p className="entry-help" data-signin-waiting>
                        在浏览器完成登录后，浏览器会请求打开 Rallyloom，请允许 / 点击「打开」；若窗口没有自动回到前台，请从任务栏切回本应用。
                      </p>
                      <div className="entry-manual" data-signin-manual>
                        <label htmlFor="entry-callback">
                          如果浏览器提示无法打开应用：把地址栏里以 <code>rallyloom://</code> 开头的地址粘贴到这里（授权码 3 分钟内有效）
                        </label>
                        <div className="entry-manual-row">
                          <Input
                            id="entry-callback"
                            value={manualUrl}
                            onChange={(event) => setManualUrl(event.target.value)}
                            placeholder="rallyloom://callback?code=…&state=…"
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <Button type="button" variant="outline" onClick={() => void submitCallback()} disabled={!manualUrl.trim()}>
                            完成授权
                          </Button>
                        </div>
                        {manualError && <p className="entry-manual-error" role="alert">{manualError}</p>}
                      </div>
                    </>
                  )}
                  {busy === 'signin' && <button type="button" className="entry-cancel" onClick={back}>取消授权</button>}
                </>
              )}

              {error && <p id="entry-error" className="entry-error" role="alert"><CircleAlert size={15} aria-hidden /> {error}</p>}
            </div>

            <aside className="entry-demo" aria-label="演示工作区">
              <div className="entry-demo-actions">
                <Button type="button" variant="outline" className="entry-demo-open" data-enter-demo disabled={busy === 'demo'} onClick={() => demo()}>
                  <LayoutGrid aria-hidden /> <span>{busy === 'demo' ? '正在打开演示…' : '进入演示'}</span>
                  {busy !== 'demo' && <small>无需登录</small>}
                </Button>
                <Button type="button" variant="outline" className="entry-demo-role" aria-label="选择演示角色" title="选择演示角色"
                  aria-expanded={chooseRole} aria-controls="entry-roles" disabled={busy === 'demo'} onClick={() => setChooseRole(!chooseRole)}><ChevronDown aria-hidden /></Button>
              </div>
              <div className="entry-roles" id="entry-roles" hidden={!chooseRole}>
                {roleGroups.map((group) => (
                  <section key={group.tenantId} aria-labelledby={`entry-role-${group.tenantId}`}>
                    <h2 id={`entry-role-${group.tenantId}`} data-tenant={group.tenantId}>{group.label}</h2>
                    <ul>{group.roles.map((role) => (
                      <li key={role.id}><button type="button" className="ui-press" data-connector={role.id} disabled={busy === 'demo'} onClick={() => demo(role)}>{role.name.replace('演示 IdP · ', '')}</button></li>
                    ))}</ul>
                  </section>
                ))}
              </div>
            </aside>
          </div>
        </section>
        <figure className="entry-preview">
          <div className="entry-preview-mat">
            <img src={officePreview} width="1260" height="731" alt="Rallyloom 中包含工位、会议室和休息区的虚拟办公室楼层" draggable={false} />
          </div>
          <figcaption><LayoutGrid size={15} aria-hidden /> 办公室预览</figcaption>
        </figure>
      </div>
    </main>
  )
}
