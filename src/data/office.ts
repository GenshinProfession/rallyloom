/* 办公室演示成员及动态。楼层平面由 office-layout.ts 提供。 */

export type Presence = 'online' | 'busy' | 'away' | 'offline'

export interface Member {
  id: string
  name: string
  role: string
  roomId: string
  presence: Presence
  current: string
  body: string
  skin: string
  hair: string
}

export interface Activity {
  time: string
  kind: 'join' | 'leave' | 'room' | 'task' | 'meet'
  text: string
}

/* 人形配色 —— 低饱和职业装 */
const BODY = ['#476779', '#8d6054', '#596e60', '#646079', '#8a795d', '#527474', '#6c6a58', '#786174']
const SKIN = ['#f0c9a4', '#e8b98f', '#d9a476', '#c99265', '#f4d5b7']
const HAIR = ['#2f2a26', '#40332a', '#1f242b', '#54453a', '#3a2f2a']

let seed = 0
const people = (
  roomId: string,
  list: [string, string, Presence, string][],
): Member[] =>
  list.map(([name, role, presence, current]) => {
    const i = seed++
    return {
      id: `${roomId}-${i}`,
      name,
      role,
      roomId,
      presence,
      current,
      body: BODY[i % BODY.length],
      skin: SKIN[i % SKIN.length],
      hair: HAIR[(i * 3) % HAIR.length],
    }
  })

export const MEMBERS: Member[] = [
  ...people('store', [
    ['周璐', '店铺运营', 'online', '调整活动价与库存'],
    ['何思妍', '店铺运营', 'online', '核对首页排版'],
    ['陆颉', '店铺运营', 'away', '工位暂离'],
    ['陈暖', '店铺运营', 'online', '提交活动报名'],
    ['孙佳怡', '运营助理', 'busy', '整理优惠券规则'],
    ['郑洁', '运营助理', 'online', '跟进预售数据'],
  ]),
  ...people('visual', [
    ['王琪', '视觉设计', 'online', '精修主图三版'],
    ['李子涵', '视觉设计', 'online', '拆解竞品详情页'],
    ['刘畅', '摄影修图', 'offline', '—'],
    ['赵雨', '插画设计', 'busy', '绘制活动 KV'],
  ]),
  ...people('fulfill', [
    ['赵磊', '仓储主管', 'online', '排布今日拣货波次'],
    ['吴昊', '仓库专员', 'online', '清点待发批次'],
    ['黄博文', '仓库专员', 'online', '登记异常件'],
    ['张恒', '物流对接', 'busy', '催揽收时效'],
    ['马超', '履约专员', 'away', '在仓库走动'],
  ]),
  ...people('service', [
    ['刘敏', '客服主管', 'online', '巡检工单队列'],
    ['郑文', '客服专员', 'online', '处理退款咨询'],
    ['唐宁', '客服专员', 'online', '回访差评用户'],
    ['徐静', '客服专员', 'busy', '跟进升级工单'],
    ['康悦', '客服专员', 'online', '更新话术库'],
  ]),
  ...people('command', [
    ['张涛', '活动策划', 'online', '盯大促进度面板'],
    ['林晓', '团队主管', 'online', '对齐今日目标'],
    ['周舟', '数据分析', 'busy', '拉取实时成交'],
    ['朱琳', '投放运营', 'online', '核对投放消耗'],
  ]),
  ...people('select', [
    ['王磊', '选品买手', 'online', '评估秋冬新品'],
    ['程晨', '商品企划', 'away', '去样品间'],
    ['李萌', '买手助理', 'online', '整理打样清单'],
  ]),
  ...people('meeting', [
    ['许诺', '项目经理', 'online', '主持周会'],
    ['林可', '项目助理', 'online', '记录会议纪要'],
  ]),
  ...people('lobby', [['苏晚', '前台行政', 'online', '接待来访客人']]),
  ...people('pantry', [['何静', '行政专员', 'online', '冲泡咖啡']]),
]

export const PRESENCE_META: Record<
  Presence,
  { label: string; color: string; dot: string }
> = {
  online: { label: '在线', color: '#16a34a', dot: 'bg-[#16a34a]' },
  busy: { label: '忙碌', color: '#f59e0b', dot: 'bg-[#f59e0b]' },
  away: { label: '离开', color: '#a1a1aa', dot: 'bg-[#a1a1aa]' },
  offline: { label: '离线', color: '#d4d4d8', dot: 'bg-[#d4d4d8]' },
}

export const ACTIVITIES: Activity[] = [
  { time: '16:02', kind: 'task', text: '林晓 将「大促目标拆解」同步给活动指挥台' },
  { time: '15:58', kind: 'task', text: '周璐 完成「活动价格核对」并提交验收' },
  { time: '15:51', kind: 'meet', text: '许诺 在会议室发起「周会」' },
  { time: '15:44', kind: 'room', text: '周舟 从选品间回到活动指挥台' },
  { time: '15:38', kind: 'task', text: '刘敏 认领「退款工单处理」' },
  { time: '15:30', kind: 'join', text: '王磊 上线并进入选品间' },
  { time: '15:24', kind: 'task', text: '吴昊 更新了库存盘点结果' },
  { time: '15:16', kind: 'leave', text: '刘畅 下线休息' },
]

export const presenceOf = (roomId: string): Member[] =>
  MEMBERS.filter((member) => member.roomId === roomId)

