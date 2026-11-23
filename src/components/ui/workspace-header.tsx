import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Shared page chrome. Keep page-specific controls inside the trailing action group. */
export function WorkspaceHeader({ title, description, children, className }: {
  title: string
  description?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return <header data-workspace-header className={cn('workspace-header workspace-page-header', className)}>
    <div className="workspace-page-heading"><h1>{title}</h1>{description && <span className="workspace-page-description">{description}</span>}</div>
    {children && <div className="workspace-page-actions">{children}</div>}
  </header>
}
