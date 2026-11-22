import { defineRoomTemplate } from './api'
import { monitor, plant, rug, seatRows, table } from './furniture'

export default defineRoomTemplate({
  id: 'command',
  floor: '#eee1cd',
  accent: '#9e7951',
  material: 'wood',
  display: 'gmv',
  door: { side: 'south', offset: .50, width: 50 },
  seats: seatRows([.22, .40, .60, .78], [.73]),
  build({ group, model, width, depth }) {
    rug(group, model, width / 2, depth * .62, width * .80, depth * .48, '#e4d8c4')
    table(group, model, width / 2, depth * .56, width * .72, 47, '#e6cbab')
    monitor(group, model, width * .36, depth * .55, 25, 24)
    monitor(group, model, width * .66, depth * .56, 25, 24)
    model.softBox(group, width * .53, 24.6, depth * .58, 15, 1, 17, '#fffdf2')
    for (const x of [width * .25, width * .75]) {
      model.softBox(group, x, 24.6, depth * .61, 13, .9, 9, '#a0b2be')
      model.round(group, x + 8, 24.6, depth * .56, 4.5, 4, '#faf5e9')
    }
    model.softBox(group, width * .13, 0, 35, 44, 19, 22, '#bda887')
    model.box(group, width * .13, 19, 35, 45, 2, 23, '#e4d3bb')
    for (const dx of [-10, 3, 14]) model.softBox(group, width * .13 + dx, 21, 35, 7, 14, 7, '#7d9baa')
    plant(group, model, 23, depth - 25)
    plant(group, model, width - 24, 32)
  },
})
