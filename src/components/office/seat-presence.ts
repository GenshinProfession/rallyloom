export interface SeatPresence { memberId: string; roomId: string; seatIndex: number; seated: boolean }
export function validateSeatPresence(value: unknown): SeatPresence[] {
  if (!Array.isArray(value) || value.some(row => !row || typeof row.memberId !== 'string' || typeof row.roomId !== 'string' || !Number.isInteger(row.seatIndex) || row.seatIndex < 0 || row.seatIndex > 59 || typeof row.seated !== 'boolean')) throw new Error('企业系统返回了无效的座位状态。')
  return value
}
