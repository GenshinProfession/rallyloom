import { defineOfficeLayout } from '@/components/office/rooms/api'

// 坐标原点在左上方。房间之间的空隙是共享走廊。
// 地板统一用石英材质（floorMaterial: 'quartz'），每间给略有差异的浅色底，
// 靠玻璃隔断 + 门口宽度 + 新增素材（长工位桌 / 书柜 / 白板 / 饮水机 / 大绿植）出层次。
export const OFFICE_LAYOUT = defineOfficeLayout({
  width: 1250,
  height: 771,
  rooms: [
    {
      id: 'store', name: '店铺运营', note: '店铺日常运营与活动落地',
      template: 'desk-grid', frame: { x: 0, y: 0, width: 382, height: 242 },
      floor: '#f1ede6', floorMaterial: 'quartz',
      door: { side: 'south', offset: .50, width: 50 },
      walls: { south: 'glass' },
      furniture: [
        { id: 'store-board', kind: 'whiteboard', x: .50, y: .09, rotation: 0 },
        { id: 'store-books', kind: 'bookcase', x: .94, y: .13, rotation: 90 },
        { id: 'store-tree', kind: 'plant-large', x: .06, y: .13, rotation: 0 },
      ],
    },
    {
      id: 'visual', name: '商品视觉', note: '商品图、详情页与品牌视觉',
      template: 'studio', frame: { x: 402, y: 0, width: 358, height: 242 },
      floor: '#f5efe9', floorMaterial: 'quartz',
      door: { side: 'south', offset: .45, width: 46 },
      walls: { south: 'glass' },
      furniture: [
        { id: 'visual-books', kind: 'bookcase', x: .94, y: .13, rotation: 90 },
        { id: 'visual-tree', kind: 'plant-large', x: .06, y: .12, rotation: 0 },
        { id: 'visual-cooler', kind: 'water-cooler', x: .06, y: .92, rotation: 0 },
      ],
    },
    {
      id: 'fulfill', name: '仓储履约', note: '库存、拣货与发货履约',
      template: 'fulfillment', frame: { x: 780, y: 0, width: 470, height: 242 },
      floor: '#edf1f2', floorMaterial: 'quartz',
      door: { side: 'south', offset: .50, width: 56 },
      walls: { south: 'glass' },
      furniture: [
        { id: 'fulfill-books', kind: 'bookcase', x: .97, y: .13, rotation: 90 },
        { id: 'fulfill-cooler', kind: 'water-cooler', x: .06, y: .52, rotation: 0 },
        { id: 'fulfill-tree', kind: 'plant-large', x: .52, y: .12, rotation: 0 },
      ],
    },
    {
      id: 'service', name: '售后客服', note: '售后咨询与工单处理',
      template: 'support-pods', frame: { x: 0, y: 274, width: 328, height: 238 },
      floor: '#eef2ec', floorMaterial: 'quartz',
      door: { side: 'north', offset: .50, width: 48 },
      walls: { north: 'glass' },
      furniture: [
        { id: 'service-books', kind: 'bookcase', x: .50, y: .07, rotation: 0 },
        { id: 'service-tree', kind: 'plant-large', x: .06, y: .93, rotation: 0 },
      ],
    },
    {
      id: 'command', name: '活动指挥台', note: '大促节奏与实时数据盯盘',
      workbench: { linkedRoomIds: ['store', 'fulfill', 'service'], documentSpaces: ['运营标准'] },
      template: 'command', frame: { x: 348, y: 274, width: 506, height: 238 },
      floor: '#f4efe6', floorMaterial: 'quartz',
      door: { side: 'south', offset: .50, width: 60 },
      walls: { north: 'glass' },
      furniture: [
        { id: 'command-tree', kind: 'plant-large', x: .05, y: .13, rotation: 0 },
        { id: 'command-cooler', kind: 'water-cooler', x: .95, y: .13, rotation: 0 },
        { id: 'command-board', kind: 'whiteboard', x: .50, y: .07, rotation: 0 },
      ],
    },
    {
      id: 'select', name: '选品间', note: '新品评估与打样陈列',
      template: 'showroom', frame: { x: 874, y: 274, width: 376, height: 238 },
      floor: '#f4eef0', floorMaterial: 'quartz',
      door: { side: 'north', offset: .51, width: 46 },
      walls: { north: 'glass' },
      furniture: [
        { id: 'select-tree', kind: 'plant-large', x: .06, y: .13, rotation: 0 },
        { id: 'select-books', kind: 'bookcase', x: .95, y: .90, rotation: 90 },
      ],
    },
    {
      id: 'meeting', name: '会议室', note: '评审、复盘与对齐',
      template: 'meeting', frame: { x: 0, y: 544, width: 454, height: 227 },
      floor: '#eef2f4', floorMaterial: 'quartz',
      door: { side: 'north', offset: .21, width: 48 },
      walls: { north: 'glass', west: 'glass' },
      furniture: [
        { id: 'meeting-cooler', kind: 'water-cooler', x: .95, y: .14, rotation: 0 },
        { id: 'meeting-tree', kind: 'plant-large', x: .05, y: .88, rotation: 0 },
        { id: 'meeting-board', kind: 'whiteboard', x: .90, y: .60, rotation: 90 },
      ],
    },
    {
      id: 'lobby', name: '前台大厅', note: '访客接待与签到',
      template: 'reception', frame: { x: 474, y: 544, width: 385, height: 227 },
      floor: '#f3efe7', floorMaterial: 'quartz',
      door: { side: 'north', offset: .50, width: 62 },
      furniture: [
        { id: 'lobby-tree', kind: 'plant-large', x: .05, y: .13, rotation: 0 },
        { id: 'lobby-cooler', kind: 'water-cooler', x: .95, y: .13, rotation: 0 },
        { id: 'lobby-books', kind: 'bookcase', x: .93, y: .86, rotation: 90 },
      ],
    },
    {
      id: 'pantry', name: '茶水间', note: '咖啡、茶点与临时碰头',
      template: 'pantry', frame: { x: 879, y: 544, width: 371, height: 227 },
      floor: '#f1f1ea', floorMaterial: 'quartz',
      door: { side: 'north', offset: .30, width: 48 },
      walls: { north: 'glass' },
      furniture: [
        { id: 'pantry-cooler', kind: 'water-cooler', x: .06, y: .14, rotation: 0 },
        { id: 'pantry-books', kind: 'bookcase', x: .07, y: .86, rotation: 0 },
        { id: 'pantry-tree', kind: 'plant-large', x: .95, y: .86, rotation: 0 },
      ],
    },
  ],
})
