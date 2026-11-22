import { defineRoomTemplate, type RoomSeat } from './api'
import { plant, rug, seatRows, table, wallScreen } from './furniture'

const southFacing: RoomSeat[] = seatRows([.28, .50, .72], [.38]).map((seat) => ({ ...seat, facing: 'south' }))

export default defineRoomTemplate({
  id: 'meeting',
  floor: '#e1edf0',
  accent: '#738f9d',
  door: { side: 'north', offset: .21, width: 42 },
  seats: [...seatRows([.37, .64, .79], [.76]), ...southFacing],
  build({ group, model, width, depth }) {
    wallScreen(group, model, width * .61, 15, width * .38)
    rug(group, model, width * .52, depth * .57, width * .77, depth * .6, '#c9dadd')
    table(group, model, width * .52, depth * .57, width * .63, depth * .28)
    model.softBox(group, width * .42, 24.6, depth * .55, 17, 1.3, 13, '#8ba9b8')
    model.softBox(group, width * .61, 24.6, depth * .61, 14, 1.1, 16, '#ded0a9')
    for (const x of [width * .33, width * .70]) {
      model.round(group, x, 24.6, depth * .53, 5.5, 5.2, '#d4e1e2')
      model.round(group, x, 29.6, depth * .53, 4, .3, '#a6bcc1')
    }
    model.softBox(group, width * .52, 24.6, depth * .56, 24, 1.4, 10, '#c3ac8c')
    model.orb(group, width * .52, 25.6, depth * .56, 9, 7, 9, '#8ea77c')
    plant(group, model, 27, depth - 27)
    plant(group, model, width - 28, 33)
  },
})
