import { defineOfficeLayout } from '@/components/office/rooms/api'

// 坐标原点在左上方。房间之间的空隙是共享走廊。
export const OFFICE_LAYOUT = defineOfficeLayout({
  width: 1250,
  height: 771,
  rooms: [
    {
      id: 'store', name: '店铺运营', note: '店铺日常运营与活动落地',
      template: 'desk-grid', frame: { x: 0, y: 0, width: 382, height: 242 },
    },
    {
      id: 'visual', name: '商品视觉', note: '商品图、详情页与品牌视觉',
      template: 'studio', frame: { x: 402, y: 0, width: 358, height: 242 },
    },
    {
      id: 'fulfill', name: '仓储履约', note: '库存、拣货与发货履约',
      template: 'fulfillment', frame: { x: 780, y: 0, width: 470, height: 242 },
    },
    {
      id: 'service', name: '售后客服', note: '售后咨询与工单处理',
      template: 'support-pods', frame: { x: 0, y: 274, width: 328, height: 238 },
    },
    {
      id: 'command', name: '活动指挥台', note: '大促节奏与实时数据盯盘',
      workbench: { linkedRoomIds: ['store', 'fulfill', 'service'], documentSpaces: ['运营标准'] },
      template: 'command', frame: { x: 348, y: 274, width: 506, height: 238 },
    },
    {
      id: 'select', name: '选品间', note: '新品评估与打样陈列',
      template: 'showroom', frame: { x: 874, y: 274, width: 376, height: 238 },
    },
    {
      id: 'meeting', name: '会议室', note: '评审、复盘与对齐',
      template: 'meeting', frame: { x: 0, y: 544, width: 454, height: 227 },
    },
    {
      id: 'lobby', name: '前台大厅', note: '访客接待与签到',
      template: 'reception', frame: { x: 474, y: 544, width: 385, height: 227 },
    },
    {
      id: 'pantry', name: '茶水间', note: '咖啡、茶点与临时碰头',
      template: 'pantry', frame: { x: 879, y: 544, width: 371, height: 227 },
    },
  ],
})
