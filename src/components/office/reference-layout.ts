import type { LayoutState } from '@/lib/store/types'
import type { FurnitureKind } from './rooms/api'

const item = (id: string, kind: FurnitureKind, x: number, y: number, rotation = 0) => ({ id, kind, x, y, rotation })

/** Editable interpretation of the supplied sketch. Scene units are approximate. */
export function referenceOffice(): LayoutState {
  return {
    width: 1000, height: 760, assignments: {},
    rooms: [
      { id: 'ref-meeting', name: '小会议室', template: 'meeting',
        frame: { x: 0, y: 0, width: 230, height: 300 }, floorMaterial: 'tile', floor: '#eeefeb',
        useTemplateFurniture: false, seats: [{ x: .5, y: .7 }, { x: .5, y: .3, facing: 'south' }],
        door: { side: 'south', offset: .72, width: 52 }, walls: { east: 'glass', south: 'glass' },
        furniture: [{ ...item('ref-meeting-desk', 'desk', .5, .5), size: { width: 126, depth: 88 } }] },
      { id: 'ref-director', name: '独立办公室', template: 'desk-grid',
        frame: { x: 230, y: 0, width: 380, height: 300 }, floorMaterial: 'tile', floor: '#eeefeb',
        useTemplateFurniture: false, seats: [{ x: .5, y: .36, facing: 'south' }],
        door: { side: 'south', offset: .18, width: 60 }, walls: { south: 'glass' },
        furniture: [{ ...item('ref-director-desk', 'desk', .5, .48), size: { width: 168, depth: 80 } },
          item('ref-director-shelf', 'shelf', .84, .13)] },
      { id: 'ref-lounge', name: '会客区', template: 'reception',
        frame: { x: 610, y: 0, width: 390, height: 300 }, floorMaterial: 'tile', floor: '#eeefeb',
        useTemplateFurniture: false, seats: [],
        door: { side: 'south', offset: .16, width: 60 },
        furniture: [item('ref-lounge-sofa', 'sofa', .5, .36), item('ref-lounge-table', 'desk', .5, .57),
          item('ref-lounge-plant', 'plant', .88, .14)] },
      { id: 'ref-pantry', name: '茶水与储物', template: 'pantry',
        frame: { x: 0, y: 300, width: 230, height: 300 }, floorMaterial: 'tile', floor: '#eeefeb',
        useTemplateFurniture: false, seats: [], door: { side: 'east', offset: .38, width: 58 },
        furniture: [item('ref-pantry-shelf', 'shelf', .22, .3, 90), item('ref-pantry-coffee', 'coffee', .25, .68)] },
      { id: 'ref-entry', name: '入口绿植区', template: 'reception',
        frame: { x: 0, y: 600, width: 230, height: 160 }, floorMaterial: 'tile', floor: '#eeefeb',
        useTemplateFurniture: false, seats: [], walls: { east: 'open' },
        door: { side: 'south', offset: .55, width: 70 },
        furniture: [item('ref-entry-plant-1', 'plant', .22, .28), item('ref-entry-plant-2', 'plant', .5, .28),
          item('ref-entry-plant-3', 'plant', .78, .28)] },
      { id: 'ref-open', name: '开放办公区', template: 'desk-grid',
        frame: { x: 230, y: 300, width: 770, height: 460 }, floorMaterial: 'tile', floor: '#eeefeb',
        useTemplateFurniture: true, door: { side: 'north', offset: .18 * 380 / 770, width: 60 },
        seats: [.23, .32, .68, .77].flatMap((x) => [
          { x, y: .33, facing: 'south' as const }, { x, y: .51 },
          { x, y: .67, facing: 'south' as const }, { x, y: .85 },
        ]),
      },
    ],
  }
}
