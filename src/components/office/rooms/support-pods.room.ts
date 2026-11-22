import { defineRoomTemplate } from './api'
import { plant, seatRows, workstations } from './furniture'

export default defineRoomTemplate({
  id: 'support-pods',
  floor: '#e5efe6',
  accent: '#628b76',
  door: { side: 'north', offset: .50, width: 42 },
  seats: seatRows([.19, .5, .81], [.39, .80]),
  build(context) {
    const { group, model, width, depth } = context
    workstations(context, 49)
    for (const x of [width * .35, width * .65]) {
      for (const z of [depth * .24, depth * .65]) {
        model.softBox(group, x, 4, z, 3, 21, 43, '#b5c9c0')
        model.box(group, x, 25, z, 4, 1.4, 44, '#d8e3de')
        for (const dz of [-19, 19]) model.box(group, x, 0, z + dz, 3.5, 25, 3, '#8faaa0')
      }
    }
    plant(group, model, width - 21, depth - 22)
  },
})
