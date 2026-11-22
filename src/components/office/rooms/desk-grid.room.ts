import { defineRoomTemplate } from './api'
import { plant, rug, seatRows, workstations } from './furniture'

export default defineRoomTemplate({
  id: 'desk-grid',
  floor: '#eee7f3',
  accent: '#8878a8',
  door: { side: 'south', offset: .50, width: 42 },
  seats: seatRows([.19, .50, .81], [.34, .78]),
  build(context) {
    const { group, model, width, depth } = context
    rug(group, model, width * .5, depth * .36, width * .86, depth * .35, '#e5dfec')
    workstations(context, 62)
    plant(group, model, 21, 31)
    plant(group, model, width - 23, depth - 22)
  },
})
