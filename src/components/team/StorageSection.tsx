/* Rallyloom — 存储中心（仅超管可见）
   「应用本身不做存储」：这里配置并展示工作区数据的存放地点 ——
   类 OA 协作后端（其背后是云端数据库），由超管统一配置，普通成员无感知。 */

import { useState } from 'react'
import {
  CloudOff,
  Database,
  Globe,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { DatasourceConfig } from '@/lib/store/types'
import { DATASOURCE_LABEL } from '@/lib/store/types'
import { cn } from '@/lib/utils'

const CHIP_OK = 'border-[#b7d7b7] bg-[#eaf6ea] text-[#16a34a]'
const CHIP_DEMO = 'border-[#c9dcf8] bg-[#eaf3fe] text-[#2563eb]'

/** 客户端唯一读写通道 —— 六条路径全部经过 WorkspaceClient */
const WRITE_PATHS: { api: string; note: string }[] = [
  { api: 'bootstrap()', note: '启动时拉全量快照' },
  { api: 'syncExternalIdentity()', note: '登录身份同步（JIT）' },
  { api: 'setMemberRole()', note: '本地角色覆盖' },
  { api: 'removeMember()', note: '移除成员' },
  { api: 'savePolicy()', note: '同步策略开关' },
  { api: 'saveDatasource()', note: '数据源配置本身' },
]

const REGION_OPTIONS: { value: string; label: string }[] = [
  { value: 'cn-east', label: '华东（上海）' },
  { value: 'cn-north', label: '华北（北京）' },
  { value: 'cn-south', label: '华南（广州）' },
  { value: 'ap-southeast', label: '东南亚（新加坡）' },
]

export function StorageSection({
  datasource,
  connError,
  busy,
  onTryConnect,
}: {
  datasource: DatasourceConfig
  connError: string | null
  busy: boolean
  onTryConnect: (config: DatasourceConfig) => Promise<boolean>
}) {
  const [oaOpen, setOaOpen] = useState(false)
  const [baseUrl, setBaseUrl] = useState('https://oa.rallyloom-demo.invalid')
  const [region, setRegion] = useState('cn-east')
  const [apiVersion, setApiVersion] = useState('v1')
  const [useLoginToken, setUseLoginToken] = useState(true)

  const isCloud = datasource.kind === 'oa-rest'

  const tryConnect = async (config: DatasourceConfig) => {
    const ok = await onTryConnect(config)
    if (ok) setOaOpen(false)
  }

  return (
    <>
      <div className="space-y-2.5" data-slot="storage">
      {/* 零存储说明 */}
      <div className="rounded-xl border border-border/70 bg-white p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[#eef4fe] text-[#2563eb]">
            <ShieldCheck className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-ui-section font-medium">应用零存储</span>
              <Badge variant="outline" className={cn('text-ui-meta', isCloud ? CHIP_OK : CHIP_DEMO)}>
                {isCloud ? '云端后端' : '当前：演示数据（内存）'}
              </Badge>
            </div>
            <p className="mt-1 text-ui-label leading-relaxed text-muted-foreground">
              Rallyloom 桌面端不落地任何业务数据：成员、角色、权限策略与办公室数据全部由{' '}
              <span className="tabular">WorkspaceClient</span> 读写超管配置的云端后端；
              客户端状态只是快照投影，退出即清空。
            </p>
          </div>
        </div>
      </div>

      {/* 当前数据源 + 写路径 */}
      <div className="rounded-xl border border-border/70 bg-white p-3.5" data-storage="current">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'flex size-8 items-center justify-center rounded-lg',
              isCloud ? 'bg-[#eaf6ea] text-[#16a34a]' : 'bg-muted text-muted-foreground',
            )}
          >
            <Database className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-ui-section font-medium">{DATASOURCE_LABEL[datasource.kind]}</div>
            <div className="mt-0.5 text-ui-label text-muted-foreground">
              {isCloud ? (
                <span className="tabular">
                  {datasource.baseUrl} · {datasource.region} · api/{datasource.apiVersion}
                  {datasource.useLoginToken ? ' · 携带登录令牌' : ''}
                </span>
              ) : (
                '本会话内存中的演示团队，重启后由后端快照重建'
              )}
            </div>
          </div>
          {isCloud ? (
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-ui-meta"
              disabled={busy}
              onClick={() => void tryConnect({ kind: 'demo-local' })}
            >
              <RefreshCw className="mr-1 size-3" />
              恢复演示数据源
            </Button>
          ) : (
            <Badge variant="outline" className={cn('text-ui-meta', CHIP_DEMO)}>
              active
            </Badge>
          )}
        </div>

        <Separator className="my-3" />

        <div className="eyebrow px-0.5">客户端唯一读写通道</div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
          {WRITE_PATHS.map((w) => (
            <div key={w.api} className="flex items-baseline gap-1.5">
              <span className="tabular shrink-0 text-ui-meta font-medium text-[#2563eb]">{w.api}</span>
              <span className="truncate text-ui-meta text-muted-foreground">{w.note}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-ui-meta leading-relaxed text-muted-foreground/80">
          任何组件不得自行落地存储：登录同步、角色覆盖、策略开关与数据源切换都走同一条通道，
          后端换址/升级只改这一处配置。
        </p>
      </div>

      {/* 连接错误（如实展示） */}
      {connError && (
        <div className="flex items-start gap-2 rounded-xl border border-[#f0c6c6] bg-[#fdf1f1] px-3 py-2.5">
          <CloudOff className="mt-px size-3.5 shrink-0 text-[#dc2626]" />
          <div className="min-w-0">
            <div className="text-ui-label font-medium text-[#b91c1c]">云端后端连接失败</div>
            <div className="mt-0.5 break-all text-ui-meta leading-relaxed text-[#b91c1c]/80">
              {connError}
            </div>
            <div className="mt-0.5 text-ui-meta text-muted-foreground">
              已保持当前数据源不变；演示环境可保留内存数据继续体验。
            </div>
          </div>
        </div>
      )}

      {/* 类 OA 后端配置 */}
      <div className="rounded-xl border border-border/70 bg-white p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[#eef4fe] text-[#2563eb]">
            <Server className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-ui-section font-medium">OA 协作后端（类 OA 系统）</span>
              <span className="text-ui-meta font-medium tracking-wide text-muted-foreground/70">REST</span>
            </div>
            <div className="mt-0.5 text-ui-label leading-snug text-muted-foreground">
              团队数据的统一存放地点：身份、目录、权限策略与办公室数据都由该后端读写其云端数据库。
            </div>
          </div>
          <Button
            size="sm"
            className="h-6 rounded-md bg-[#2563eb] px-2.5 text-ui-label hover:bg-[#1d4ed8]"
            disabled={busy}
            onClick={() => setOaOpen(true)}
          >
            {busy ? <Loader2 className="mr-1 size-3 animate-spin" /> : <Globe className="mr-1 size-3" />}
            {busy ? '连接中…' : '配置连接'}
          </Button>
        </div>
        <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2">
          <Info className="mt-px size-3.5 shrink-0 text-[#2563eb]" />
          <p className="text-ui-meta leading-relaxed text-muted-foreground">
            仅超管可配置（storage.configure 权限）；保存后立即用真实请求尝试连接
            <span className="tabular"> /api/v1/workspace/bootstrap</span>，成功前不动当前数据源。
          </p>
        </div>
      </div>

      {/* 云数据库直连（不推荐占位） */}
      <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-border/80 bg-white/60 px-3.5 py-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Lock className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-ui-body font-medium text-muted-foreground">云数据库直连</span>
            <Badge variant="outline" className="h-[15px] border-border/60 bg-muted px-1 text-ui-meta text-muted-foreground">
              不推荐
            </Badge>
          </div>
          <div className="mt-0.5 text-ui-label leading-snug text-muted-foreground">
            桌面分发会把数据库账号密码暴露给每一台机器；生产环境一律经 OA 后端 API 代理访问云端数据库。
          </div>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 px-2 text-ui-meta opacity-60" disabled>
              配置
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-ui-meta">
            出于安全考虑默认禁用；如有内网直连需求请在 OA 后端侧开只读副本账号
          </TooltipContent>
        </Tooltip>
      </div>
      </div>

      {/* OA 后端配置对话框 */}
      <Dialog open={oaOpen} onOpenChange={setOaOpen}>
        <DialogContent className="w-[420px] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-ui-section">配置 OA 协作后端</DialogTitle>
            <DialogDescription className="text-ui-label leading-relaxed">
              保存后立即尝试 <span className="tabular">GET /api/{apiVersion}/workspace/bootstrap</span>
              ，成功前不改动当前数据源。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            <div>
              <Label className="text-ui-label text-muted-foreground">服务地址</Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://oa.corp.example.com"
                className="mt-1 h-8 text-ui-label"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <Label className="text-ui-label text-muted-foreground">部署区域</Label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger className="mt-1 h-8 text-ui-label">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-ui-label">
                    {REGION_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value} className="text-ui-label">
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-ui-label text-muted-foreground">API 版本</Label>
                <Select value={apiVersion} onValueChange={setApiVersion}>
                  <SelectTrigger className="mt-1 h-8 text-ui-label">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="text-ui-label">
                    <SelectItem value="v1" className="text-ui-label">v1（当前契约）</SelectItem>
                    <SelectItem value="v2" className="text-ui-label">v2（预留）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2.5">
              <div className="min-w-0 pr-2">
                <div className="text-ui-label">携带登录令牌</div>
                <div className="mt-0.5 text-ui-meta leading-snug text-muted-foreground">
                  用身份连接器换来的 access token 请求后端；桌面端不保存任何数据库凭据
                </div>
              </div>
              <Switch checked={useLoginToken} onCheckedChange={setUseLoginToken} className="scale-[0.85]" />
            </div>
            {connError && (
              <div className="rounded-lg bg-[#fdf1f1] px-3 py-2 text-ui-meta leading-relaxed text-[#b91c1c]">
                {connError}
              </div>
            )}
            <div className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
              <Info className="mt-px size-3.5 shrink-0 text-[#2563eb]" />
              <p className="text-ui-meta leading-relaxed text-muted-foreground">
                演示环境地址不可达属预期行为：真实接入时换成贵司 OA 后端地址（或云函数网关），
                后端按 Workspace 契约返回 team / policy / datasource 即可全量接管存储。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-7 text-ui-label" onClick={() => setOaOpen(false)}>
              取消
            </Button>
            <Button
              size="sm"
              className="h-7 rounded-md bg-[#2563eb] px-3 text-ui-label hover:bg-[#1d4ed8]"
              disabled={busy || !baseUrl.trim()}
              onClick={() =>
                void tryConnect({
                  kind: 'oa-rest',
                  baseUrl: baseUrl.trim(),
                  region,
                  apiVersion,
                  useLoginToken,
                })
              }
            >
              {busy ? (
                <>
                  <Loader2 className="mr-1 size-3 animate-spin" />
                  正在连接…
                </>
              ) : (
                '保存并连接'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
