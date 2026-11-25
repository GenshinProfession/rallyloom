import { Group } from 'three'
import type { RoomBuildContext, RoomSeat } from './api'
import type { ModelKit } from '../three/model'

export const seatRows = (xs: number[], ys: number[]): RoomSeat[] =>
  ys.flatMap((y) => xs.map((x) => ({ x, y })))

export function plant(group: Group, model: ModelKit, x: number, z: number) {
  model.asset(group, 'plant', x, 0, z, 23, 38, 24).rotation.y = (x + z) * .04
}

export function rug(group: Group, model: ModelKit, x: number, z: number, width: number, depth: number, color: string) {
  model.softBox(group, x, .09, z, width, .42, depth, color).castShadow = false
  const edge = model.softBox(group, x, .08, z, width + 1.2, .20, depth + 1.2, '#a49d8d')
  edge.castShadow = false
}

export function table(
  group: Group, model: ModelKit, x: number, z: number, width: number, depth: number,
  color = '#f9f8f1', height = 21,
) {
  // 薄桌面 + 包边 + 走线槽 + 细金属方腿：比原来的厚板更像真实办公桌
  model.softBox(group, x, height, z, width, 1.7, depth, color)
  model.box(group, x, height - 1.35, z, width - 1.4, .55, depth - 1.2, '#dcd4c4')
  model.box(group, x, height - 4.4, z, Math.max(24, width * .62), 1.5, 5.4, '#9ba6a7')
  for (const dx of [-width / 2 + 4, width / 2 - 4]) {
    model.box(group, x + dx, height / 2, z, 2.6, height, 2.6, '#8e9a9c')
  }
  model.box(group, x, 2.4, z, Math.max(10, width - 10), 1.5, 2.2, '#a3adae')
  model.softBox(group, x, height * .66, z + depth / 2 - 3.4, width - 9, height * .5, 1.3, '#d8d0c1')
}

export function monitor(group: Group, model: ModelKit, x: number, z: number, y: number, width = 28) {
  model.softBox(group, x, y, z, 10, 1.5, 8, '#ccd1d3')
  model.box(group, x, y + 1, z - 1, 2.5, 7, 3, '#aeb8bf')
  const screen = new Group()
  screen.position.set(x, y + 12, z - 2.2)
  screen.rotation.x = -.32
  group.add(screen)
  model.softBox(screen, 0, -6.5, 0, width, 13, 2.6, '#435565')
  model.box(screen, 0, -5.1, 1.45, width - 2.6, 10, .4, '#edf3f3')
  model.box(screen, -width * .17, 1.7, 1.7, width * .55, 1.3, .35, '#7fa2ba')
  model.box(screen, -width * .18, -.8, 1.72, width * .38, .85, .35, '#b2c2c8')
  model.box(screen, width * .24, -3.7, 1.7, width * .23, 4.2, .35, '#a8bdcc')
}

export function workstations({ group, model, width, depth, seats }: RoomBuildContext, deskWidth = 58) {
  // 同一排座位共用一张长条工位桌（bench 桌面），比原来一人一张小桌子更像现代办公室。
  const rows = new Map<string, RoomSeat[]>()
  for (const seat of seats) {
    const key = `${seat.facing ?? 'north'}:${seat.y.toFixed(3)}`
    const list = rows.get(key) ?? []
    list.push(seat)
    rows.set(key, list)
  }
  for (const list of rows.values()) {
    const bay = new Group()
    bay.position.set(0, 0, list[0].y * depth)
    bay.rotation.y = list[0].facing === 'south' ? Math.PI : 0
    group.add(bay)
    const xs = [...list].sort((a, b) => a.x - b.x).map((seat) => seat.x * width)
    const left = xs[0] - deskWidth / 2
    const right = xs[xs.length - 1] + deskWidth / 2
    const center = (left + right) / 2
    const length = Math.max(deskWidth, right - left)
    table(bay, model, center, -24, length, 34)
    // 长桌中段补几组支撑腿，避免「一张悬空长板」的观感
    for (const x of xs.slice(1, -1)) {
      model.box(bay, x - deskWidth / 2 + 3, 10.5, -24, 2.2, 21, 2.2, '#8e9a9c')
    }
    for (const seat of list) {
      const x = seat.x * width
      monitor(bay, model, x - 3, -31, 24)
      model.softBox(bay, x - 4, 24.6, -17, 23, .55, 8, '#92a4ae')
      model.softBox(bay, x - 5, 25.1, -17, 16, .8, 4.5, '#e1e6e6')
      model.orb(bay, x + 5, 25, -18, 3, 1.9, 4.3, '#e1e6e6')
      model.softBox(bay, x - deskWidth / 2 + 8, 24.7, -23, 8.5, 1.5, 11, '#d6c8b2')
      model.round(bay, x + deskWidth / 2 - 9, 24.7, -19, 7, .7, '#e1dace')
      model.round(bay, x + deskWidth / 2 - 9, 25.3, -19, 4.8, 4, '#fbfaf4')
      model.round(bay, x + deskWidth / 2 - 9, 29.15, -19, 3.6, .2, '#967a63')
    }
    // 座位之间的低挡板：长桌工位的典型细节
    for (let index = 0; index < xs.length - 1; index++) {
      const mid = (xs[index] + xs[index + 1]) / 2
      model.softBox(bay, mid, 25.4, -26, 1.2, 9.2, 25, '#b7c4c2')
      model.softBox(bay, mid, 30.2, -26, 1.5, .6, 25.4, '#9faead')
    }
  }
}

export function carton(group: Group, model: ModelKit, x: number, y: number, z: number, size = 16, color = '#d3af88') {
  model.box(group, x, y, z, size, size * .6, size * .75, color)
  model.box(group, x, y + size * .6, z, size * .15, .3, size * .75, '#ead8bb')
  model.box(group, x + size * .26, y + size * .6, z + 1, size * .25, .35, size * .3, '#f7f2e7')
  model.box(group, x + size * .24, y + size * .34, z + size * .376, size * .27, size * .18, .22, '#f7f2e7')
}

export function shelf(group: Group, model: ModelKit, x: number, z: number, width: number, samples = false) {
  const count = Math.max(1, Math.floor(width / 28))
  for (const offset of [-width / 2 + 2, width / 2 - 2]) {
    model.box(group, x + offset, 0, z, 3, 42, 19, '#8e969b')
  }
  for (const y of [8, 25, 41]) {
    model.box(group, x, y, z, width, 2.5, 20, '#ccb796')
    for (let index = 0; index < count; index++) {
      const left = x - width / 2 + (index + .5) * width / count
      if (samples) {
        model.softBox(group, left, y + 2.5, z, 13, 9 + index % 3, 11, ['#9ab2ac', '#c8a98e', '#d3afb5'][index % 3])
      } else {
        carton(group, model, left, y + 2.5, z, 13 + index % 3 * 2, ['#d3ae84', '#c09771', '#deb995'][index % 3])
      }
    }
  }
}

export function wallScreen(group: Group, model: ModelKit, x: number, z: number, width: number) {
  const screen = new Group()
  screen.position.set(x, 26, z)
  screen.rotation.x = -.5
  group.add(screen)
  model.softBox(screen, 0, -15, 0, width, 30, 3, '#2c3d50')
  model.box(screen, 0, -12.5, 1.8, width - 5, 25, .8, '#304e69')
  for (const [index, color] of ['#d2e5f1', '#91b9db', '#94b6a3', '#d2bb83'].entries()) {
    model.box(screen, -width * .23, 6 - index * 4.6, 2.4, width * (.30 - index * .044), 1.4, .5, color)
  }
  for (let index = 0; index < 6; index++) {
    model.box(screen, width * (.01 + .059 * index), -8, 2.4, width * .036, 6 + index * 1.8, .5, '#83adc9')
  }
}

export function officeChair(group: Group, model: ModelKit) {
  // 五爪椅脚 + 气压杆 + 座垫 + 靠背 + 扶手
  for (let spoke = 0; spoke < 5; spoke++) {
    const angle = spoke * Math.PI * 2 / 5
    model.softBox(group, Math.cos(angle) * 4.4, .9, 1 + Math.sin(angle) * 4.4, 9.4, 1.5, 2.2, '#6f7b7e').rotation.y = angle
    model.orb(group, Math.cos(angle) * 9, .8, 1 + Math.sin(angle) * 9, 1.9, 1.9, 1.9, '#4f5b5f')
  }
  model.round(group, 0, 1.6, 1, 2.4, 8.6, '#aeb9bf')
  model.softBox(group, 0, 10.4, 0, 16.4, 3.6, 14.6, '#465255')
  model.softBox(group, 0, 11.4, 7.6, 16.8, 12.6, 3.4, '#394447')
  model.softBox(group, 0, 15.2, 6.2, 13.4, 5.6, 1.4, '#59666a')
  model.softBox(group, 0, 17.4, 6.7, 9.6, 3.2, 1.6, '#3f4b4f')
  for (const x of [-8.6, 8.6]) {
    model.box(group, x, 9.6, 3.2, 1.3, 6.4, 2.4, '#9fabb0')
    model.softBox(group, x, 15.4, 2.2, 2.6, 1.5, 10.4, '#c6cfcd')
  }
}
