import { useEffect, useState } from 'react'
import { demoSlotRows, fetchSlotRows } from '@/lib/store/client'
import type { DataSlot, SlotRow } from '@/lib/store/types'
import { workspaceValue } from '@/lib/store/workspace-binding'

export interface RoomMetrics { rows: SlotRow[] | null; error: string }

export function useRoomMetrics(roomId: string | undefined, slot: DataSlot | undefined, demo: boolean): RoomMetrics {
  const [data, setData] = useState<{ slot: DataSlot; roomId: string; metrics: RoomMetrics }>()
  useEffect(() => {
    if (!roomId || !slot) return
    let current = true
    let timeout: ReturnType<typeof setTimeout>
    const update = async () => {
      let metrics: RoomMetrics
      try {
        let rows: SlotRow[]
        if (slot.kind === 'demo-feed' && demo) rows = demoSlotRows(roomId)
        else if (demo) rows = await fetchSlotRows(slot)
        else {
          const bridge = window.rallyloom?.workspace
          if (!bridge) throw new Error('请在桌面应用中查看经营看板。')
          rows = workspaceValue(await bridge.slot(roomId))
        }
        metrics = { rows, error: '' }
      } catch (err) {
        metrics = { rows: null, error: err instanceof Error ? err.message : '经营看板暂时无法加载。' }
      }
      if (!current) return
      setData({ slot, roomId, metrics })
      timeout = setTimeout(update, Math.max(15, Math.min(slot.refreshSec ?? 60, 600)) * 1000)
    }
    void update()
    return () => { current = false; clearTimeout(timeout) }
  }, [roomId, slot, demo])

  return data && data.roomId === roomId && data.slot === slot ? data.metrics : { rows: null, error: '' }
}

export function gmvMetric(rows: readonly SlotRow[] | null) {
  return rows?.find(({ key }) => key === 'today_gmv') ?? rows?.find(({ label }) => /^(今日\s*gmv|今日成交额|today(?:['’]s)?\s*gmv)$/iu.test(label.trim()))
}
