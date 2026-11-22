import type { WorkspaceBridge } from '@/lib/store/workspace-binding'

declare global {
  interface Window {
    rallyloom?: {
      window: {
        minimize: () => void
        toggleMaximize: () => void
        close: () => void
      }
      workspace: WorkspaceBridge
    }
  }
}
