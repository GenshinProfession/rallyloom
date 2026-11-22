import { defineRoomTemplate } from './api'
import { plant, rug, seatRows, shelf, workstations } from './furniture'

export default defineRoomTemplate({
  id: 'showroom',
  floor: '#f3e8ee',
  accent: '#9a7890',
  door: { side: 'north', offset: .51, width: 42 },
  seats: seatRows([.19, .50, .81], [.77]),
  build(context) {
    const { group, model, width } = context
    rug(group, model, width * .78, 47, width * .33, 76, '#e8d8dc')
    shelf(group, model, width * .24, 28, width * .34, true)
    const rack = width * .78
    for (const dx of [-34, 34]) {
      model.box(group, rack + dx, 0, 33, 4, 45, 3, '#78878b')
      model.softBox(group, rack + dx, .5, 37, 8, 3, 21, '#879296')
    }
    model.box(group, rack, 42, 33, 70, 3, 3, '#829095')
    for (const [index, color] of ['#bb947e', '#809ba9', '#b19dae', '#dcceab'].entries()) {
      const x = rack + (index - 1.5) * 15
      model.softBox(group, x, 16 + index % 2 * 4, 35, 12, 23 - index % 2 * 4, 7, color)
      model.box(group, x, 39, 34, 2, 4, 2, '#78878b')
    }
    workstations(context, 54)
    plant(group, model, width - 20, 70)
  },
})
