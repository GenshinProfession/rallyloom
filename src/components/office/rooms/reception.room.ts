import { defineRoomTemplate } from './api'
import { monitor, plant, rug, table } from './furniture'

export default defineRoomTemplate({
  id: 'reception',
  floor: '#eeeae2',
  accent: '#a58b70',
  material: 'wood',
  door: { side: 'north', offset: .50, width: 55 },
  seats: [{ x: .51, y: .57, facing: 'south' }],
  build({ group, model, width, depth }) {
    const desk = width * .53
    model.softBox(group, width * .51, 0, depth * .73, desk, 24, 34, '#dac4a7')
    model.softBox(group, width * .51, 24, depth * .73, desk + 5, 4, 38, '#faf7ef')
    for (let index = 0; index < 13; index++) {
      model.box(group, width * .51 + (index - 6) * desk / 14, 3, depth * .73 + 17.4, 2, 20, 1, '#b99c77')
    }
    monitor(group, model, width * .54, depth * .71, 28, 22)
    rug(group, model, width * .19, depth * .34, 100, 85, '#dedbd1')
    model.asset(group, 'sofa', width * .19, .5, depth * .25, 68, 28, 29)
    model.asset(group, 'lamp', width * .29, 0, depth * .22, 13, 50, 13)
    table(group, model, width * .18, depth * .48, 41, 25, '#d3ba99', 11)
    model.softBox(group, width * .18 + 8, 14.5, depth * .48, 12, 1, 9, '#a1b2b7')
    plant(group, model, width - 23, 37)
    plant(group, model, width - 24, depth - 26)
  },
})
