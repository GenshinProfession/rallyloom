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
  for (const dx of [-width / 2 + 5, width / 2 - 5]) {
    for (const dz of [-depth / 2 + 5, depth / 2 - 5]) {
      model.box(group, x + dx, 1.4, z + dz, 3.2, height - 1.4, 3.2, '#a5b2b6')
      model.box(group, x + dx, 0, z + dz, 4.2, 1.5, 4.2, '#7b8387')
    }
    model.box(group, x + dx, height - 4, z, 3.2, 3, depth - 8, '#a5b2b6')
  }
  model.softBox(group, x, height, z, width - 1.2, 2.1, depth - .6, '#c6b9a6')
  model.softBox(group, x, height + 1.7, z, width, 1.9, depth, color)
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
  for (const seat of seats) {
    const bay = new Group()
    bay.position.set(seat.x * width, 0, seat.y * depth)
    bay.rotation.y = seat.facing === 'south' ? Math.PI : 0
    group.add(bay)
    table(bay, model, 0, -24, deskWidth, 34)
    monitor(bay, model, -3, -31, 24)
    model.softBox(bay, -4, 24.6, -17, 23, .55, 8, '#92a4ae')
    model.softBox(bay, -5, 25.1, -17, 16, .8, 4.5, '#e1e6e6')
    model.orb(bay, 5, 25, -18, 3, 1.9, 4.3, '#e1e6e6')
    model.softBox(bay, -deskWidth / 2 + 8, 24.7, -23, 8.5, 1.5, 11, '#d6c8b2')
    model.round(bay, deskWidth / 2 - 9, 24.7, -19, 7, .7, '#e1dace')
    model.round(bay, deskWidth / 2 - 9, 25.3, -19, 4.8, 4, '#fbfaf4')
    model.round(bay, deskWidth / 2 - 9, 29.15, -19, 3.6, .2, '#967a63')
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
  for (let spoke = 0; spoke < 3; spoke++) {
    const angle = spoke * Math.PI / 3
    model.softBox(group, 0, .2, 1, 16, 2.1, 2.7, '#818d94').rotation.y = angle
    for (const sign of [-1, 1]) model.orb(group, sign * Math.cos(angle) * 7, 0, 1 + sign * Math.sin(angle) * 7, 3, 3, 3, '#627074')
  }
  model.round(group, 0, 1.8, 1, 4.5, 9, '#acb6bd')
  model.softBox(group, 0, 10, 0, 17.5, 4.6, 16, '#414c4e')
  model.softBox(group, 0, 11.5, 8, 18.5, 13.5, 4.2, '#303a3e')
  model.softBox(group, 0, 15.3, 6, 15, 7.8, 1.6, '#526064')
  for (const x of [-9, 9]) {
    model.box(group, x, 11, 3, 1.6, 7, 2.8, '#a5b1b4')
    model.softBox(group, x, 17, 2, 3, 1.8, 11, '#c8d1cd')
  }
}
