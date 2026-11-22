import { defineRoomTemplate } from './api'
import { carton, plant, seatRows, shelf, table, workstations } from './furniture'

export default defineRoomTemplate({
  id: 'fulfillment',
  floor: '#e2edf3',
  accent: '#6489aa',
  door: { side: 'south', offset: .50, width: 46 },
  seats: seatRows([.11, .30, .50, .70, .89], [.77]),
  build(context) {
    const { group, model, width } = context
    workstations(context, 54)
    shelf(group, model, width * .33, 26, width * .45)
    shelf(group, model, width * .81, 27, width * .26)
    table(group, model, width * .54, 82, width * .49, 30, '#e1ccb2')
    carton(group, model, width * .4, 24, 82, 25)
    carton(group, model, width * .52, 24, 80, 19)
    model.round(group, width * .58, 25, 83, 10, 3.3, '#bc8c58')
    model.round(group, width * .58, 28, 83, 5.3, 1, '#f5e9d8')
    model.box(group, width * .70, 24, 82, 25, 14, 20, '#dbe0e1')
    model.box(group, width * .70, 33, 93, 16, 3, 2, '#38454d')
    model.box(group, width * .70, 31, 95, 13, .7, 7, '#fdfcf6')
    const trolley = width - 28
    for (const x of [trolley - 14, trolley + 14]) {
      for (const z of [68, 95]) model.round(group, x, 0, z, 5, 4, '#4b5964')
    }
    model.softBox(group, trolley, 3.8, 82, 33, 3, 34, '#7c96a5')
    model.box(group, trolley, 6, 66, 32, 22, 2.5, '#899da9')
    carton(group, model, trolley, 7, 84, 23)
    plant(group, model, width * .10, 84)
  },
})
