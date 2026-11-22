import { defineRoomTemplate } from './api'
import { plant, seatRows, workstations } from './furniture'

export default defineRoomTemplate({
  id: 'desk-grid',
  floor: '#eee7f3',
  accent: '#8878a8',
  door: { side: 'south', offset: .50, width: 42 },
  seats: seatRows([.19, .50, .81], [.34, .78]),
  build(context) {
    const { group, model, width, depth } = context
    workstations(context, 62)
    plant(group, model, 21, 31)
    plant(group, model, width - 23, depth - 22)
  },
})
