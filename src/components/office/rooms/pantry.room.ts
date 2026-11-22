import { defineRoomTemplate } from './api'
import { plant, rug } from './furniture'

export default defineRoomTemplate({
  id: 'pantry',
  floor: '#ebf1e6',
  accent: '#809375',
  door: { side: 'north', offset: .23, width: 42 },
  seats: [{ x: .63, y: .82 }, { x: .63, y: .44, facing: 'south' }],
  build({ group, model, width, depth }) {
    const counter = width * .55
    model.box(group, width * .68, 0, 31, counter, 23, 31, '#d7c4ac')
    for (const x of [.44, .55, .66, .77, .88]) {
      model.box(group, width * x, 1, 46.6, width * .102, 20, 1, '#e1cfb6')
      model.softBox(group, width * x, 16, 47.4, 8, 1.5, 1.8, '#9d9183')
    }
    model.box(group, width * .68, 23, 31, counter + 3, 3, 34, '#f8f5ee')
    model.asset(group, 'coffee', width * .54, 26, 28, 20, 18, 22)
    model.round(group, width * .63, 26, 33, 6, 5, '#ece8dc')
    model.box(group, width * .83, 26, 28, 24, 13, 21, '#dce2e1')
    model.box(group, width * .83, 30, 39, 19, 6, 1, '#9faeb4')
    model.softBox(group, width * .91, 26, 36, 16, 2, 15, '#b0c1c5')
    model.softBox(group, width * .91, 27.3, 36, 12, 1, 10, '#869ba4')
    model.round(group, width * .91, 27.5, 30, 2.5, 8, '#a8b9c0')
    rug(group, model, width * .63, depth * .64, 140, 116, '#d8e4d5')
    model.round(group, width * .63, 0, depth * .64, 9, 20, '#a59c8d')
    model.round(group, width * .63, 20, depth * .64, 62, 3, '#e7d4b8')
    model.round(group, width * .63 - 13, 23, depth * .64, 7, 5, '#fff9ee')
    model.round(group, width * .63 + 11, 23, depth * .64 - 6, 9, 4, '#c3a185')
    plant(group, model, 23, depth - 28)
    plant(group, model, width - 24, depth - 30)
  },
})
