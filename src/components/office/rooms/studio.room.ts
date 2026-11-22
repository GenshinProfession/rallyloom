import { Group } from 'three'
import { defineRoomTemplate } from './api'
import { plant, rug, seatRows, shelf, table, workstations } from './furniture'

export default defineRoomTemplate({
  id: 'studio',
  floor: '#f5e7e1',
  accent: '#b77568',
  door: { side: 'south', offset: .45, width: 42 },
  seats: seatRows([.15, .38, .62, .85], [.76]),
  build(context) {
    const { group, model, width } = context
    workstations(context, 51)
    rug(group, model, width * .36, 62, width * .46, 103, '#e9d8cd')
    model.softBox(group, width * .42, 1, 20, width * .29, 43, 5, '#f6ece0')
    model.round(group, width * .42, 43, 20, 7, 3, '#c7ae9a')
    table(group, model, width * .42, 51, width * .25, 48)
    model.softBox(group, width * .42, 24.6, 52, 21, 15, 12, '#be9167')
    model.softBox(group, width * .42, 38, 52, 12, 8, 2.4, '#b98a62')
    model.softBox(group, width * .42, 39.8, 53, 7, 6, 1.5, '#f4e7d2')

    const light = new Group()
    group.add(light)
    light.position.set(width * .19, 0, 69)
    light.rotation.y = -.58
    model.round(light, 0, 0, 0, 15, 2.5, '#53616c')
    model.round(light, 0, 2, 0, 3, 46, '#54616c')
    const shade = model.softBox(light, 0, 35, 0, 29, 25, 5, '#53616c')
    const diffuser = model.softBox(light, 0, 37, 2.9, 25, 21, 1.5, '#fff6e6')
    shade.rotation.x = diffuser.rotation.x = -.38

    const camera = new Group()
    group.add(camera)
    camera.position.set(width * .50, 0, 96)
    for (const angle of [0, Math.PI / 3, -Math.PI / 3]) {
      model.box(camera, 0, 1, 0, 19, 1.5, 2, '#4d5d67').rotation.y = angle
    }
    model.round(camera, 0, 1, 0, 2.4, 29, '#465660')
    model.softBox(camera, 0, 29, 0, 12, 8, 7, '#465660')
    model.round(camera, 0, 29, -4, 6, 7, '#2d4350').rotation.x = Math.PI / 2
    shelf(group, model, width * .77, 26, width * .27, true)
    plant(group, model, width - 23, 51)
  },
})
