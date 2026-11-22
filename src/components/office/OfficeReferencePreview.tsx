import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { OfficeScene } from './OfficeScene'
import { referenceOffice } from './reference-layout'
import { resolveOfficeLayout, roomTemplates } from './rooms'

const layout = referenceOffice()
const rooms = resolveOfficeLayout(layout, roomTemplates)
const roster = new Map()

export function OfficeReferencePreview({ onClose }: { onClose: () => void }) {
  const [selection, setSelection] = useState<string | null>(null)
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className="flex h-[90vh] w-[94vw] max-w-[1400px] flex-col rounded-xl">
      <DialogHeader>
        <DialogTitle>参考户型</DialogTitle>
        <DialogDescription>按提供的草图搭建。独立房间共墙，门洞直通相邻空间；下方为连续开放办公区。</DialogDescription>
      </DialogHeader>
      <OfficeScene layout={layout} rooms={rooms} roster={roster} slots={{}} selectedRoom={selection}
        onSelectRoom={setSelection} focusedMember={null} meId={null} meName="" mode="daily" zoom={100} walking={false} />
    </DialogContent>
  </Dialog>
}
