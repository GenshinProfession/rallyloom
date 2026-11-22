import { defineRoomTemplate } from './api'

export default defineRoomTemplate({
  id: 'empty',
  floor: '#ebedec',
  accent: '#7d8c8a',
  door: { side: 'south', offset: .5, width: 42 },
  seats: [],
  build() {},
})
