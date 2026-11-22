import type { FloorMaterial } from './rooms/api'

export const OFFICE_TEMPLATES = {
  'desk-grid': '办公区', empty: '空区域', studio: '工作室', fulfillment: '仓储区', 'support-pods': '客服区',
  command: '指挥室', showroom: '展示间', meeting: '会议室', reception: '前台', pantry: '茶水间',
}

export const OFFICE_FLOORS = {
  wood: { label: '浅木地板', color: '#e2cdb0' },
  tile: { label: '灰白地砖', color: '#e8ebee' },
  concrete: { label: '水泥地面', color: '#aeb6b8' },
} satisfies Record<FloorMaterial, { label: string; color: string }>

