import { cn } from '@/lib/utils'
import { Logo } from '@/components/Logo'

function isElectron() {
  return typeof window !== 'undefined' && !!window.rallyloom
}

function Glyph({ kind }: { kind: 'min' | 'max' | 'close' }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.05 } as const
  if (kind === 'min')
    return (
      <svg width="10" height="10" viewBox="0 0 10 10">
        <path d="M0 5.25h10" {...common} />
      </svg>
    )
  if (kind === 'max')
    return (
      <svg width="10" height="10" viewBox="0 0 10 10">
        <rect x="0.55" y="0.55" width="8.9" height="8.9" rx="0.8" {...common} />
      </svg>
    )
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      <path d="M0.4 0.4 9.6 9.6M9.6 0.4 0.4 9.6" {...common} />
    </svg>
  )
}

export function TitleBar({ demo = false, login = false }: { demo?: boolean; login?: boolean }) {
  const electron = isElectron()
  return (
    <header className={cn('drag relative flex h-8 shrink-0 items-center border-b pl-3', login ? 'border-[#ffffff14] bg-[#14201d] [&_img]:brightness-0 [&_img]:invert' : 'border-[#dde2e8] bg-[#edf0f4]')}>
      <div className="flex items-center gap-2">
        <Logo className="size-[18px]" />
        <span className={cn('text-ui-label font-semibold tracking-[0.01em]', login ? 'text-[#e0e9e1]' : 'text-[#34445a]')}>Rallyloom</span>
        {demo && <span className="rounded border border-[#d4dce5] px-1.5 text-ui-meta text-[#4b5a6d]">演示模式</span>}
      </div>

      {electron && (
        <div className="no-drag ml-auto flex h-full items-stretch">
          <button
            type="button"
            aria-label="最小化"
            onClick={() => window.rallyloom?.window.minimize()}
            className={cn(
              'grid w-[46px] place-items-center text-zinc-500 transition-colors hover:bg-zinc-900/[0.055] hover:text-zinc-800',
            )}
          >
            <Glyph kind="min" />
          </button>
          <button
            type="button"
            aria-label="最大化或还原"
            onClick={() => window.rallyloom?.window.toggleMaximize()}
            className="grid w-[46px] place-items-center text-zinc-500 transition-colors hover:bg-zinc-900/[0.055] hover:text-zinc-800"
          >
            <Glyph kind="max" />
          </button>
          <button
            type="button"
            aria-label="关闭窗口"
            onClick={() => window.rallyloom?.window.close()}
            className="grid w-[46px] place-items-center text-zinc-500 transition-colors hover:bg-[#e81123] hover:text-white"
          >
            <Glyph kind="close" />
          </button>
        </div>
      )}
    </header>
  )
}
