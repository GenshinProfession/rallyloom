#!/usr/bin/env node
// Rallyloom 接入体检：A 模式（OIDC 账号漫游）登录页自检（接入规范 §11）
//
// 用法：
//   node reference/verify-provider.mjs https://oa.example.com
//   node reference/verify-provider.mjs https://oa.example.com --no-browser
//   node reference/verify-provider.mjs https://oa.example.com --client-id rallyloom-desktop
//   node reference/verify-provider.mjs --bootstrap bootstrap-sample.json   # 离线校验 bootstrap 响应
//   node reference/verify-provider.mjs --layout layout-sample.json         # 离线校验 PATCH /layout 请求体
//   node reference/verify-provider.mjs --layout layout-sample.json --team bootstrap-sample.json
//
// 检查项：
//   1. discovery 端点可读且字段齐全
//   2. 授权页响应头：Referrer-Policy 不能是 no-referrer（否则表单 POST 的 Origin 会变成 null）
//      同时提示 CSP: sandbox 这类同样会让 Origin 变 null 的配置
//   3. 可选（默认开启）：用本机 Chrome 无头模式真实提交一次表单，打印 POST 的 Origin 与最终页面
//   4. --bootstrap <file>：离线校验 /bootstrap 响应 JSON，逐字段指出缺失或类型错误
//   5. --layout <file>：离线校验办公室布局（房间/墙体/家具/工位/分配），可加 --team <bootstrap.json> 校验成员归属
//
// 依赖：零依赖。浏览器检查需要 Node 22+（全局 WebSocket）与本机 Chrome/Chromium。
// 退出码：0 = PASS，2 = FAIL，1 = 无法完成检查。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const origin = (args.find((a) => !a.startsWith('--')) || '').replace(/\/+$/, '');
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : undefined;
};
const CLIENT_ID = flag('--client-id') || 'rallyloom-desktop';
const REDIRECT_URI = flag('--redirect-uri') || 'rallyloom://callback';
const NO_BROWSER = Boolean(flag('--no-browser'));
const BOOTSTRAP_ARG = flag('--bootstrap');
const BOOTSTRAP_FILE = typeof BOOTSTRAP_ARG === 'string' ? BOOTSTRAP_ARG : undefined;
const LAYOUT_ARG = flag('--layout');
const LAYOUT_FILE = typeof LAYOUT_ARG === 'string' ? LAYOUT_ARG : undefined;
const TEAM_ARG = flag('--team');
const TEAM_FILE = typeof TEAM_ARG === 'string' ? TEAM_ARG : undefined;
const HELP = Boolean(flag('--help')) || Boolean(flag('-h'));

if (HELP) {
  console.log([
    '用法:',
    '  node verify-provider.mjs https://your-oa.example.com [--no-browser] [--client-id <id>] [--redirect-uri <uri>]',
    '  node verify-provider.mjs --bootstrap bootstrap.json        # 离线校验 /bootstrap 响应体',
    '  node verify-provider.mjs --layout layout.json              # 离线校验 PATCH /layout 请求体',
    '  node verify-provider.mjs --layout layout.json --team bootstrap.json  # 同时校验成员分配归属',
    '',
    '--bootstrap 期望的 JSON 就是 GET /api/v1/workspace/bootstrap 的返回体（去掉 Bearer 头也能抓：',
    '  浏览器开发者工具 → Network → bootstrap 请求 → 复制响应）。',
  ].join('\n'));
  process.exit(0);
}

if (!BOOTSTRAP_FILE && !LAYOUT_FILE && (!origin || !/^https:\/\//.test(origin))) {
  console.error('用法: node verify-provider.mjs https://your-oa.example.com [--no-browser] [--client-id <id>] [--bootstrap <json>] [--layout <json>]');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

// 房间模板 / 地板 / 家具白名单（与桌面端 src/components/office/rooms/* 保持一致）
const ROOM_TEMPLATES = ['desk-grid', 'studio', 'fulfillment', 'support-pods', 'command', 'showroom',
  'meeting', 'reception', 'pantry', 'empty', 'room-shell'];
const FLOOR_MATERIALS = ['wood', 'tile', 'concrete', 'quartz', 'terrazzo'];
const FURNITURE_SIZES = {
  desk: [60, 36, 24], shelf: [56, 22, 44], plant: [23, 24, 38], sofa: [75, 32, 29],
  coffee: [20, 19, 28], lamp: [18, 18, 48], workstation: [62, 80, 40], chair: [24, 26, 28],
  'meeting-table': [150, 62, 25], 'round-table': [62, 62, 24], 'coffee-table': [48, 30, 14],
  counter: [130, 38, 28], cabinet: [62, 26, 26], 'display-shelf': [78, 22, 44],
  'clothes-rack': [78, 30, 48], rug: [130, 92, 1], partition: [5, 46, 28], screen: [125, 8, 62],
  'studio-light': [32, 24, 60], camera: [24, 24, 42], carton: [22, 18, 15], printer: [28, 24, 17],
  trolley: [36, 38, 32], microwave: [27, 24, 17], sink: [30, 24, 18], cup: [8, 8, 7],
  notebook: [18, 13, 2], monitor: [30, 14, 28], bench: [200, 56, 40], 'desk-l': [96, 76, 25],
  bookcase: [96, 26, 88], whiteboard: [120, 6, 72], tv: [96, 6, 56], 'water-cooler': [24, 24, 56],
  'plant-large': [44, 44, 74], 'conference-table': [240, 74, 26], 'data-screen': [200, 8, 112],
};
const FURNITURE_KINDS = Object.keys(FURNITURE_SIZES);
// 布局里的坐标既可能是 [x, y]，也可能是 {x, y}（客户端两种历史写法都接受）。
const asPoint = (value) => Array.isArray(value)
  ? (value.length >= 2 && value.slice(0, 2).every((n) => Number.isFinite(n)) ? { x: value[0], y: value[1] } : null)
  : (value && typeof value === 'object' && Number.isFinite(value.x) && Number.isFinite(value.y) ? { x: value.x, y: value.y } : null);

function youtubeVideoId(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || (url.port && url.port !== '443') || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split('/').filter(Boolean);
    let id = '';
    if (host === 'youtu.be') id = parts[0] ?? '';
    else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') ?? '';
      else if (['embed', 'shorts', 'live'].includes(parts[0] ?? '')) id = parts[1] ?? '';
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function isHttpsUrlWithoutCredentials(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}
const record = (level, name, detail) => {
  results.push({ level, name, detail });
  const mark = level === 'pass' ? 'PASS' : level === 'warn' ? 'WARN' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const verifier = crypto.randomBytes(48).toString('base64url');

// ---- 0. 离线契约校验（不访问网络）------------------------------------------
if (LAYOUT_FILE) {
  await checkLayoutFile(LAYOUT_FILE, TEAM_FILE);
  finish();
}
if (BOOTSTRAP_FILE) {
  await checkBootstrapFile(BOOTSTRAP_FILE);
  finish();
}

const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
const state = crypto.randomBytes(16).toString('hex');
const nonce = crypto.randomBytes(16).toString('hex');

// ---- 1. discovery -----------------------------------------------------------
let discovery;
try {
  const response = await fetch(`${origin}/api/v1/workspace/discovery`, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  discovery = await response.json();
  const missing = ['api_version', 'installation_id', 'workspace_id', 'display_name', 'authorization']
    .filter((key) => discovery[key] === undefined || discovery[key] === '');
  if (missing.length) throw new Error(`缺少字段: ${missing.join(', ')}`);
  const auth = discovery.authorization ?? {};
  const authMissing = ['issuer', 'client_id', 'resource'].filter((key) => !auth[key]);
  if (authMissing.length) throw new Error(`authorization 缺少字段: ${authMissing.join(', ')}`);
  record('pass', 'discovery 可读', `${discovery.workspace_id} / ${discovery.display_name}（api ${discovery.api_version}）`);
} catch (error) {
  record('fail', 'discovery 不可用', `${error.message}。请确认地址、证书与 /api/v1/workspace/discovery 部署。`);
  finish();
}

if (discovery.authorization.client_id !== CLIENT_ID) {
  record('warn', 'client_id 不一致', `服务端声明 ${discovery.authorization.client_id}，本脚本用 ${CLIENT_ID}（可用 --client-id 指定）`);
}

// ---- 2. 授权页响应头 --------------------------------------------------------
const authorize = new URL(`${origin}/api/v1/oidc/authorize`);
authorize.searchParams.set('client_id', discovery.authorization.client_id);
authorize.searchParams.set('redirect_uri', REDIRECT_URI);
authorize.searchParams.set('response_type', 'code');
authorize.searchParams.set('scope', 'openid profile');
authorize.searchParams.set('state', state);
authorize.searchParams.set('nonce', nonce);
authorize.searchParams.set('resource', discovery.authorization.resource);
authorize.searchParams.set('code_challenge', challenge);
authorize.searchParams.set('code_challenge_method', 'S256');

let loginPageOk = false;
try {
  const response = await fetch(authorize, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  const policyHeader = response.headers.get('referrer-policy') ?? '';
  const policies = policyHeader.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);
  const csp = (response.headers.get('content-security-policy') ?? '').toLowerCase();
  loginPageOk = response.status === 200 && /text\/html/.test(response.headers.get('content-type') ?? '');
  record(loginPageOk ? 'pass' : 'warn', '授权页可打开', `HTTP ${response.status} · ${response.headers.get('content-type') ?? 'no content-type'}`);

  if (policies.includes('no-referrer')) {
    record('fail', 'Referrer-Policy 会破坏表单提交', `当前 "${policyHeader}" → 表单 POST 的 Origin 会变成 null，企业网关会返回 403 Invalid CORS request（接入规范 §11）`);
  } else if (!loginPageOk) {
    record('warn', '未能确认 Referrer-Policy', '授权页不是 200 text/html，可能登录走 SPA/重定向；仍建议在浏览器 Network 面板确认 POST 的 Origin');
  } else {
    record('pass', 'Referrer-Policy 可用于表单提交', `"${policyHeader || '(未设置，浏览器默认值 same-origin 系列)'}"`);
  }
  if (/sandbox/.test(csp)) {
    record('fail', 'CSP 含 sandbox', 'sandbox 会让文档成为不透明源，表单 POST 的 Origin 同样为 null；请从该页面移除（接入规范 §11.3）');
  }
} catch (error) {
  record('fail', '授权页请求失败', error.message);
}

// ---- 3. 浏览器真实提交 ------------------------------------------------------
if (!NO_BROWSER) {
  const chrome = findChrome();
  if (!chrome) {
    record('warn', '跳过浏览器检查', '未找到 Chrome/Chromium，可用 CHROME_PATH 指定二进制路径');
  } else if (typeof WebSocket === 'undefined') {
    record('warn', '跳过浏览器检查', '当前 Node 无全局 WebSocket（需 Node 22+）');
  } else {
    await browserCheck(chrome);
  }
}

finish();

// ---- helpers ----------------------------------------------------------------
function finish() {
  const failed = results.filter((r) => r.level === 'fail');
  const warned = results.filter((r) => r.level === 'warn');
  console.log('');
  if (failed.length) {
    console.log(`结论: FAIL（${failed.length} 项失败）— 修复后重跑本脚本。`);
    process.exit(2);
  }
  console.log(`结论: PASS${warned.length ? `（${warned.length} 项提示，未阻断）` : ''} — ${
    LAYOUT_FILE ? '办公室布局符合 provider-api.md §5。'
      : BOOTSTRAP_FILE ? 'bootstrap 响应符合接入规范（§4 / §12）。' : '登录页侧配置符合接入规范 §11。'}`);
  process.exit(0);
}

// ---- 布局校验（bootstrap 与 PATCH /layout 共用，规则与桌面端保持一致） ----
function auditLayout(layout, need, options = {}) {
  const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const text = (value) => typeof value === 'string' && value.trim().length > 0;
  const id = (value) => text(value) && value.length <= 128;
  const optionalBoolean = (value) => value === undefined || typeof value === 'boolean';
  const teamIds = options.teamIds instanceof Set ? options.teamIds : undefined;
  need(isObject(layout), 'layout：{width,height,rooms,assignments}');
  if (!isObject(layout)) return { roomCount: 0, assignmentCount: 0 };
  need(Number.isFinite(layout.width) && layout.width >= 500 && layout.width <= 4000, 'layout.width：500–4000 的整数画布宽度');
  need(Number.isFinite(layout.height) && layout.height >= 300 && layout.height <= 4000, 'layout.height：300–4000 的整数画布高度');
  need(layout.revision === undefined || Number.isFinite(layout.revision), 'layout.revision：可选数字（乐观锁版本）');
  need(layout.unitsPerMeter === undefined || (Number.isFinite(layout.unitsPerMeter) && layout.unitsPerMeter >= 10 && layout.unitsPerMeter <= 1000),
    'layout.unitsPerMeter：可选 10–1000（缺省 50）');
  const rooms = Array.isArray(layout.rooms) ? layout.rooms : [];
  need(Array.isArray(layout.rooms) && rooms.length >= 1 && rooms.length <= 80, 'layout.rooms：1–80 个房间');
  const roomIds = new Set();
  rooms.forEach((room, index) => {
    const at = `layout.rooms[${index}]`;
    need(isObject(room), `${at}：必须是对象`);
    if (!isObject(room)) return;
    need(id(room.id) && !roomIds.has(room.id), `${at}.id：唯一非空字符串`);
    roomIds.add(room.id);
    need(text(room.name), `${at}.name：房间显示名`);
    need(ROOM_TEMPLATES.includes(room.template), `${at}.template：必须是 ${ROOM_TEMPLATES.join(' / ')} 之一`);
    need(isObject(room.frame) && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(room.frame[key]) && room.frame[key] >= 0),
      `${at}.frame：{x,y,width,height} 非负数字`);
    need(optionalBoolean(room.useTemplateFurniture), `${at}.useTemplateFurniture：可选布尔值`);
    need(room.floorMaterial === undefined || FLOOR_MATERIALS.includes(room.floorMaterial),
      `${at}.floorMaterial：可选 ${FLOOR_MATERIALS.join(' / ')}`);
    need(room.walls === undefined || (isObject(room.walls) && Object.entries(room.walls).every(([side, finish]) =>
      ['north', 'east', 'south', 'west'].includes(side) && ['solid', 'glass', 'open'].includes(finish))),
      `${at}.walls：可选各方向隔墙 solid|glass|open`);
    if (room.boundary !== undefined && isObject(room.frame)) {
      const insideFrame = (value) => {
        const point = asPoint(value);
        return Boolean(point) && point.x >= room.frame.x - 0.5 && point.x <= room.frame.x + room.frame.width + 0.5
          && point.y >= room.frame.y - 0.5 && point.y <= room.frame.y + room.frame.height + 0.5;
      };
      const points = isObject(room.boundary) && Array.isArray(room.boundary.outer) ? room.boundary.outer : null;
      const holes = isObject(room.boundary) ? room.boundary.holes : undefined;
      need(points && points.length >= 3 && points.length <= 256 && points.every(insideFrame)
        && (holes === undefined || (Array.isArray(holes) && holes.length <= 32
          && holes.every((hole) => Array.isArray(hole) && hole.length >= 3 && hole.every(insideFrame)))),
        `${at}.boundary：可选 {outer:[{x,y}...], holes?:[[...]]}，顶点必须落在 frame 内`);
    }
    if (room.door !== undefined) {
      const length = ['north', 'south'].includes(room.door?.side) ? room.frame?.width : room.frame?.height;
      const center = room.door?.offset * length;
      need(isObject(room.door) && ['north', 'east', 'south', 'west'].includes(room.door.side)
        && Number.isFinite(room.door.offset) && room.door.offset >= 0 && room.door.offset <= 1
        && Number.isFinite(room.door.width) && room.door.width > 0
        && center - room.door.width / 2 >= 6 && center + room.door.width / 2 <= length - 6,
        `${at}.door：可选 {side, offset, width}，门洞距墙角至少 6`);
    }
    if (room.seats !== undefined) {
      need(Array.isArray(room.seats) && room.seats.length <= 60 && room.seats.every((seat) =>
        isObject(seat)
        && [seat.x, seat.y].every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)
        && (seat.facing === undefined || ['north', 'south'].includes(seat.facing))
        && (seat.rotation === undefined || (Number.isFinite(seat.rotation) && seat.rotation >= 0 && seat.rotation <= 360))),
        `${at}.seats：≤60 个工位，归一化坐标 + 可选朝向/旋转`);
    }
    if (room.furniture !== undefined) {
      const list = room.furniture;
      need(Array.isArray(list) && list.length <= 60, `${at}.furniture：≤60 件家具数组`);
      if (Array.isArray(list)) list.slice(0, 60).forEach((item, itemIndex) => {
        const fat = `${at}.furniture[${itemIndex}]`;
        need(isObject(item), `${fat}：必须是对象`);
        if (!isObject(item)) return;
        need(id(item.id), `${fat}.id：非空字符串`);
        need(FURNITURE_KINDS.includes(item.kind), `${fat}.kind：必须是 ${FURNITURE_KINDS.length} 种白名单之一`);
        need([item.x, item.y].every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1),
          `${fat}.x/y：归一化 0–1`);
        need(Number.isFinite(item.rotation) && item.rotation >= 0 && item.rotation <= 360, `${fat}.rotation：0–360`);
        need(item.color === undefined || (typeof item.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(item.color)),
          `${fat}.color：可选 #rrggbb`);
        need(item.elevation === undefined || (Number.isFinite(item.elevation) && item.elevation >= 0 && item.elevation <= 200),
          `${fat}.elevation：可选 0–200`);
        need(item.size === undefined || (isObject(item.size)
          && Number.isFinite(item.size.width) && item.size.width >= 1 && item.size.width <= 800
          && Number.isFinite(item.size.depth) && item.size.depth >= 1 && item.size.depth <= 800
          && (item.size.height === undefined || (Number.isFinite(item.size.height) && item.size.height >= 1 && item.size.height <= 800))),
          `${fat}.size：可选 {width,depth,height?} 1–800`);
      });
    }
  });

  if (layout.wallSegments !== undefined) {
    const walls = layout.wallSegments;
    need(Array.isArray(walls) && walls.length <= 240, 'layout.wallSegments：可选数组（≤240 段）');
    if (Array.isArray(walls)) {
      const ids = new Set();
      walls.slice(0, 240).forEach((wall, index) => {
        const at = `layout.wallSegments[${index}]`;
        const startPoint = asPoint(wall?.start);
        const endPoint = asPoint(wall?.end);
        const length = startPoint && endPoint ? Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y) : 0;
        need(isObject(wall) && id(wall.id) && !ids.has(wall.id), `${at}.id：唯一非空字符串`);
        ids.add(wall?.id);
        need(Boolean(startPoint) && Boolean(endPoint) && [startPoint, endPoint].every((point) =>
          point.x >= 0 && point.x <= layout.width && point.y >= 0 && point.y <= layout.height),
          `${at}：start/end 必须是画布内的 {x,y}（或 [x,y]）`);
        need(length >= 12, `${at}：长度至少 12`);
        need(Number.isFinite(wall?.thickness) && wall.thickness >= 2 && wall.thickness <= 24, `${at}.thickness：2–24`);
        need(Number.isFinite(wall?.height) && wall.height >= 8 && wall.height <= 100, `${at}.height：8–100`);
        need(wall?.finish === undefined || ['solid', 'glass'].includes(wall.finish), `${at}.finish：solid|glass`);
        need(wall?.opening === undefined || (isObject(wall.opening) && Number.isFinite(wall.opening.width)
          && wall.opening.width >= 12 && Number.isFinite(wall.opening.offset) && wall.opening.offset >= 0 && wall.opening.offset <= 1),
          `${at}.opening：可选 {offset:0..1, width≥12}`);
      });
    }
  }

  const assignments = layout.assignments;
  need(isObject(assignments), 'layout.assignments：对象（成员 id → 房间 id，可为 {}）');
  const counts = {};
  if (isObject(assignments)) {
    Object.entries(assignments).forEach(([memberId, roomId]) => {
      need(text(memberId), 'layout.assignments 的键必须是成员 id');
      need(text(roomId) && roomIds.has(roomId), `layout.assignments.${memberId}：房间 ${roomId} 必须在 layout.rooms 内`);
      if (teamIds) need(teamIds.has(memberId), `layout.assignments.${memberId}：成员必须在 bootstrap.team 内`);
      counts[roomId] = (counts[roomId] ?? 0) + 1;
    });
    rooms.forEach((room) => {
      const capacity = Array.isArray(room?.seats) ? room.seats.length : 0;
      const assigned = counts[room?.id] ?? 0;
      need(assigned <= capacity, `房间「${room?.name ?? room?.id}」分配了 ${assigned} 人，但只有 ${capacity} 个工位`);
    });
  }
  if (layout.seatAssignments !== undefined) {
    const seats = layout.seatAssignments;
    need(isObject(seats), 'layout.seatAssignments：可选对象（成员 id → 工位序号）');
    if (isObject(seats)) {
      Object.entries(seats).forEach(([memberId, index]) => {
        need(Number.isInteger(index) && index >= 0 && index < 60, `layout.seatAssignments.${memberId}：必须是 0–59 的整数`);
        need(isObject(assignments) && Object.hasOwn(assignments, memberId), `layout.seatAssignments.${memberId}：必须先有 assignments 归属`);
      });
    }
  }
  return { roomCount: rooms.length, assignmentCount: Object.keys(assignments ?? {}).length };
}

// ---- bootstrap 离线契约校验（与 electron/workspace-auth.cjs 的 validateBootstrap 一致） ----
async function checkBootstrapFile(file) {
  if (!fs.existsSync(file)) {
    record('fail', '找不到 bootstrap 文件', file);
    return;
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    record('fail', 'bootstrap 不是合法 JSON', error.message);
    return;
  }
  const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const text = (value) => typeof value === 'string' && value.trim().length > 0;
  const id = (value) => text(value) && value.length <= 128;
  const optionalBoolean = (value) => value === undefined || typeof value === 'boolean';
  const roleOptions = (value) => Array.isArray(value) && value.length <= 100
    && value.every((option) => isObject(option) && id(option.id) && text(option.label))
    && new Set(value.map((option) => option.id)).size === value.length;
  const issues = [];
  const need = (ok, message) => { if (!ok) issues.push(message); };

  need(isObject(raw), '响应根节点必须是 JSON 对象');
  if (!isObject(raw)) {
    record('fail', 'bootstrap 不符合契约', '1 处问题：');
    console.log('       ✗ 响应根节点必须是 JSON 对象');
    return;
  }
  need(text(raw.installation_id), 'installation_id：非空字符串（应与 discovery 一致）');
  need(text(raw.workspace_id), 'workspace_id：非空字符串（应与 discovery 一致）');
  need(isObject(raw.tenant) && text(raw.tenant.id) && text(raw.tenant.name), 'tenant：{id,name} 两个非空字符串（name ≤200 字）');
  need(isObject(raw.tenant) ? raw.tenant.name === undefined || raw.tenant.name.length <= 200 : true, 'tenant.name：最多 200 字');
  need(text(raw.member_id), 'member_id：当前登录成员在 team 中的 id');
  need(Array.isArray(raw.permissions) && raw.permissions.every(text), 'permissions：非空字符串数组');
  need(Array.isArray(raw.permissions) && raw.permissions.includes('office.view'), 'permissions 必须包含 office.view');
  need(isObject(raw.policy), 'policy：对象（可返回 {}）');
  if (raw.roleSettings !== undefined) {
    const settings = raw.roleSettings;
    need(raw.permissions?.includes?.('roles.configure'), 'roleSettings：仅在获授 roles.configure 时返回');
    need(isObject(settings) && text(settings.title) && optionalBoolean(settings.canReset)
      && (settings.description === undefined || typeof settings.description === 'string')
      && Array.isArray(settings.fields) && settings.fields.length <= 100
      && settings.fields.every((field) => isObject(field) && id(field.id) && text(field.label)
        && optionalBoolean(field.readOnly) && roleOptions(field.options)
        && field.options.some((option) => option.id === field.value))
      && new Set(settings.fields.map((field) => field.id)).size === settings.fields.length,
      'roleSettings：标题、唯一字段 ID、选项和有效当前值');
  }
  if (raw.collaboration !== undefined) {
    const collaboration = raw.collaboration;
    need(isObject(collaboration), 'collaboration：可选 {version, scopes, documents, seating, reporting}');
    if (isObject(collaboration)) {
      need(collaboration.version === undefined || collaboration.version === 1, 'collaboration.version：当前只支持 1');
      if (collaboration.scopes !== undefined) {
        need(Array.isArray(collaboration.scopes) && collaboration.scopes.length <= 100
          && collaboration.scopes.every((scope) => isObject(scope)
            && /^[a-zA-Z0-9_-]{1,128}$/.test(scope.id ?? '') && text(scope.label)),
          'collaboration.scopes：范围 id（1–128 位字母数字/下划线/连字符）与名称');
      }
      if (collaboration.documents !== undefined) {
        need(isObject(collaboration.documents) && optionalBoolean(collaboration.documents.folders),
          'collaboration.documents：可选 {folders:boolean}（是否支持文件夹）');
      }
      if (collaboration.seating !== undefined) {
        need(isObject(collaboration.seating) && collaboration.seating.version === 1,
          'collaboration.seating：{version:1} 表示支持精确工位分配');
      }
      if (collaboration.reporting !== undefined) {
        need(isObject(collaboration.reporting) && collaboration.reporting.version === 1,
          'collaboration.reporting：{version:1} 表示支持通用日志汇报契约');
      }
    }
  }

  if (!Array.isArray(raw.team)) issues.push('team：成员数组');
  else {
    raw.team.forEach((member, index) => {
      const at = `team[${index}]`;
      need(isObject(member), `${at}：必须是对象`);
      if (!isObject(member)) return;
      need(text(member.id), `${at}.id：非空字符串`);
      need(text(member.connectorId), `${at}.connectorId：非空字符串（身份源 id）`);
      need(text(member.idpId), `${at}.idpId：外部系统用户 id`);
      need(text(member.displayName), `${at}.displayName：显示名`);
      need(member.email === undefined || typeof member.email === 'string', `${at}.email：可选，必须是字符串`);
      need(isObject(member.attrs) && Object.values(member.attrs).every((value) => typeof value === 'string'),
        `${at}.attrs：对象，值必须是字符串（可为 {}）`);
      const providerRole = member.roleId !== undefined || member.roleName !== undefined;
      need(providerRole ? id(member.roleId) && text(member.roleName) : text(member.role),
        `${at}：需要提供方的 roleId 和 roleName，或兼容字段 role`);
      need(member.sourceRoleName === undefined || text(member.sourceRoleName), `${at}.sourceRoleName：可选非空字符串`);
      need(optionalBoolean(member.officeAssignable), `${at}.officeAssignable：可选布尔值`);
      if (member.memberActions !== undefined) {
        const actions = member.memberActions;
        need(raw.permissions?.includes?.('members.role'), `${at}.memberActions：需要 members.role`);
        need(isObject(actions) && roleOptions(actions.roleOptions)
          && optionalBoolean(actions.canResetRole) && optionalBoolean(actions.canRemove)
          && (actions.selectedRoleId === undefined || actions.roleOptions.some((option) => option.id === actions.selectedRoleId)),
          `${at}.memberActions：审批后的角色选项、当前选项和操作开关`);
      }
      need(['online', 'busy', 'away', 'offline'].includes(member.presence), `${at}.presence：online/busy/away/offline`);
      need(Array.isArray(member.externalGroups) && member.externalGroups.every((group) => typeof group === 'string'),
        `${at}.externalGroups：字符串数组（可为 []）`);
    });
    need(raw.team.some((member) => isObject(member) && member.id === raw.member_id),
      'team：必须包含 member_id 对应的自己（bootstrap 要把自己放进 team）');
    if (!raw.permissions?.includes?.('team.view')) need(raw.team.length === 1, '无 team.view 时 team 只应返回本人');
  }

  const teamIds = Array.isArray(raw.team) ? new Set(raw.team.filter(isObject).map((member) => member.id)) : undefined;
  const layoutInfo = auditLayout(raw.layout, need, { teamIds });
  if (raw.layout === undefined) issues.push('layout：缺少办公室布局对象');

  if (raw.dataSlots !== undefined) {
    need(isObject(raw.dataSlots), 'dataSlots：对象（可为 {}）');
    if (isObject(raw.dataSlots)) {
      Object.entries(raw.dataSlots).forEach(([roomId, slot]) => {
        const at = `dataSlots.${roomId}`;
        need(isObject(slot), `${at}：对象或省略`);
        if (!isObject(slot)) return;
        need(slot.kind === 'external-api', `${at}.kind：必须为 external-api`);
        need(text(slot.name), `${at}.name：看板名称`);
        let https = false;
        try { https = new URL(slot.url).protocol === 'https:'; } catch { https = false; }
        need(https, `${at}.url：必须是 HTTPS 绝对地址（与工作区同源）`);
        need(slot.refreshSec === undefined || (Number.isFinite(slot.refreshSec) && slot.refreshSec >= 15 && slot.refreshSec <= 600),
          `${at}.refreshSec：可选 15–600 秒`);
      });
    }
  } else {
    issues.push('dataSlots：必须返回对象（可为 {}）');
  }

  if (raw.jukebox !== undefined && raw.jukebox !== null) {
    const jukebox = raw.jukebox;
    need(isObject(jukebox), 'jukebox：可选对象 { playlists }（接入规范 §13）');
    if (isObject(jukebox)) {
      need(Array.isArray(jukebox.playlists) && jukebox.playlists.length >= 1 && jukebox.playlists.length <= 40,
        'jukebox.playlists：1–40 个歌单');
      if (Array.isArray(jukebox.playlists)) {
        jukebox.playlists.slice(0, 40).forEach((playlist, pi) => {
          const at = `jukebox.playlists[${pi}]`;
          need(isObject(playlist), `${at}：歌单对象`);
          if (!isObject(playlist)) return;
          need(text(playlist.id), `${at}.id：非空字符串（≤64，只含字母数字、-、_）`);
          need(text(playlist.name), `${at}.name：歌单名称（≤40 字）`);
          need(Array.isArray(playlist.tracks) && playlist.tracks.length >= 1 && playlist.tracks.length <= 300,
            `${at}.tracks：1–300 首曲目`);
          if (!Array.isArray(playlist.tracks)) return;
          playlist.tracks.slice(0, 300).forEach((track, ti) => {
            const tat = `${at}.tracks[${ti}]`;
            need(isObject(track), `${tat}：曲目对象`);
            if (!isObject(track)) return;
            need(text(track.title), `${tat}.title：曲目名称（≤120 字）`);
            const youtube = track.provider === 'youtube' || Boolean(track.url && youtubeVideoId(track.url));
            need(track.provider === undefined || track.provider === 'youtube', `${tat}.provider：当前只支持 youtube`);
            need(youtube ? Boolean(youtubeVideoId(track.url)) : isHttpsUrlWithoutCredentials(track.url),
              youtube ? `${tat}.url：有效的 YouTube 官方 HTTPS 分享地址` : `${tat}.url：不含账号密码的 HTTPS 媒体地址`);
            need(track.poster === undefined || (typeof track.poster === 'string' && /^https:\/\//i.test(track.poster)),
              `${tat}.poster：可选 HTTPS 封面地址`);
            need(track.duration === undefined || (Number.isFinite(track.duration) && track.duration >= 0 && track.duration <= 86400),
              `${tat}.duration：可选时长（秒）`);
            need(track.attrs === undefined || isObject(track.attrs), `${tat}.attrs：可选字符串键值对象`);
          });
        });
      }
    }
  }

  if (issues.length) {
    record('fail', 'bootstrap 不符合契约', `${issues.length} 处问题：`);
    for (const issue of issues) console.log(`       ✗ ${issue}`);
  } else {
    record('pass', 'bootstrap 符合契约', `team ${raw.team.length} 人 · rooms ${layoutInfo.roomCount} 间 · member_id ${raw.member_id}` +
      (Array.isArray(raw.jukebox?.playlists) ? ` · jukebox ${raw.jukebox.playlists.length} 歌单` : '') +
      (Object.keys(raw.dataSlots ?? {}).length ? ` · dataSlots ${Object.keys(raw.dataSlots).length} 个房间` : ''));
  }
}

// ---- PATCH /layout 离线校验（布局请求体，可用 --team 提供成员清单） ----
async function checkLayoutFile(file, teamFile) {
  if (!fs.existsSync(file)) {
    record('fail', '找不到布局文件', file);
    return;
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    record('fail', '布局不是合法 JSON', error.message);
    return;
  }
  let team;
  if (teamFile) {
    if (!fs.existsSync(teamFile)) {
      record('fail', '找不到 --team 文件', teamFile);
      return;
    }
    try {
      const teamRaw = JSON.parse(fs.readFileSync(teamFile, 'utf8'));
      team = Array.isArray(teamRaw) ? teamRaw : teamRaw.team ?? teamRaw.value?.snapshot?.team ?? teamRaw.value?.team;
      if (!Array.isArray(team)) throw new Error('文件里找不到 team 数组');
    } catch (error) {
      record('fail', '--team 文件不可用', error.message);
      return;
    }
  }
  const layout = raw && typeof raw === 'object' && raw.layout ? raw.layout : raw;
  const isObject = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  const issues = [];
  const need = (ok, message) => { if (!ok) issues.push(message); };
  const teamIds = Array.isArray(team) ? new Set(team.filter(isObject).map((member) => member.id)) : undefined;
  const info = auditLayout(layout, need, { teamIds });
  if (issues.length) {
    record('fail', '办公室布局不符合契约', `${issues.length} 处问题：`);
    for (const issue of issues) console.log(`       ✗ ${issue}`);
  } else {
    record('pass', '办公室布局符合契约',
      `${info.roomCount} 个房间 · ${info.assignmentCount} 人已分配 · 画布 ${layout.width}×${layout.height}`);
  }
}

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = process.platform === 'win32'
    ? [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      ]
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  return candidates.find((p) => fs.existsSync(p));
}

async function browserCheck(chromePath) {
  const port = 9331;
  const userDir = path.join(os.tmpdir(), `rallyloom-verify-${Date.now()}`);
  const child = spawn(chromePath, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, '--headless=new',
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank',
  ], { stdio: 'ignore' });

  const getJson = async (p) => {
    for (let i = 0; i < 60; i++) {
      try { const r = await fetch(`http://127.0.0.1:${port}${p}`); if (r.ok) return await r.json() } catch {}
      await sleep(250);
    }
    throw new Error('浏览器 DevTools 无响应');
  };

  try {
    const version = await getJson('/json/version');
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WebSocket 连接失败')) });
    let nextId = 1;
    const pending = new Map();
    const posts = [];
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result);
      } else if (msg.method === 'Network.requestWillBeSent' && msg.params.request.method === 'POST') {
        const headers = msg.params.request.headers;
        posts.push({ url: msg.params.request.url, origin: headers.Origin ?? headers.origin ?? '(none)' });
      }
    };
    const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
      const id = nextId++;
      pending.set(id, { res, rej });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    });

    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Network.enable', {}, sessionId);
    await send('Page.navigate', { url: authorize.href }, sessionId);
    await sleep(2500);

    const submitted = await send('Runtime.evaluate', {
      expression: `(() => {
        const form = document.querySelector('form');
        if (!form) return { submitted: false, reason: '页面里没有 <form>（纯 SPA 登录页不适用本检查）' };
        for (const el of form.querySelectorAll('[type=text],[type=email],input:not([type]),input[type=password]')) {
          if (!el.value) el.value = 'verify@example.invalid';
        }
        form.submit();
        return { submitted: true };
      })()`,
      returnByValue: true,
    }, sessionId);
    await sleep(3500);
    const final = await send('Runtime.evaluate', {
      expression: `({ href: location.href, body: (document.body ? document.body.innerText : '').slice(0, 200) })`,
      returnByValue: true,
    }, sessionId);

    const submittedValue = submitted.result?.value ?? {};
    if (!submittedValue.submitted) {
      record('warn', '跳过表单提交检查', submittedValue.reason || '未找到表单');
      return;
    }
    const post = posts[posts.length - 1];
    const body = final.result?.value?.body ?? '';
    if (!post) {
      record('warn', '未捕获到表单 POST', '可能被前端脚本拦截（AJAX 登录）；请手工在 Network 面板确认 Origin');
      return;
    }
    if (post.origin === 'null') {
      record('fail', '表单 POST 的 Origin 为 null', `${post.url} → 与 §11 描述的坑一致，请检查该页 Referrer-Policy / CSP sandbox`);
    } else {
      record('pass', '表单 POST 的 Origin 正常', `${post.url} → Origin: ${post.origin}`);
    }
    if (/Invalid CORS request/i.test(body)) {
      record('fail', '提交后返回 Invalid CORS request', '表单提交被 CORS 过滤器拒绝（接入规范 §11）');
    }
  } catch (error) {
    record('warn', '浏览器检查未完成', error.message);
  } finally {
    child.kill();
    await sleep(300);
    try { fs.rmSync(userDir, { recursive: true, force: true }) } catch { /* Windows 下 Crashpad 文件可能仍被占用，忽略 */ }
  }
}
