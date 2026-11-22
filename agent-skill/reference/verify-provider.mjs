#!/usr/bin/env node
// Rallyloom 接入体检：A 模式（OIDC 账号漫游）登录页自检（接入规范 §11）
//
// 用法：
//   node reference/verify-provider.mjs https://oa.example.com
//   node reference/verify-provider.mjs https://oa.example.com --no-browser
//   node reference/verify-provider.mjs https://oa.example.com --client-id rallyloom-desktop
//   node reference/verify-provider.mjs --bootstrap bootstrap-sample.json   # 离线校验 bootstrap 响应
//
// 检查项：
//   1. discovery 端点可读且字段齐全
//   2. 授权页响应头：Referrer-Policy 不能是 no-referrer（否则表单 POST 的 Origin 会变成 null）
//      同时提示 CSP: sandbox 这类同样会让 Origin 变 null 的配置
//   3. 可选（默认开启）：用本机 Chrome 无头模式真实提交一次表单，打印 POST 的 Origin 与最终页面
//   4. --bootstrap <file>：离线校验 /bootstrap 响应 JSON，逐字段指出缺失或类型错误
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
const HELP = Boolean(flag('--help')) || Boolean(flag('-h'));

if (HELP) {
  console.log([
    '用法:',
    '  node verify-provider.mjs https://your-oa.example.com [--no-browser] [--client-id <id>] [--redirect-uri <uri>]',
    '  node verify-provider.mjs --bootstrap bootstrap.json        # 离线校验 /bootstrap 响应体',
    '',
    '--bootstrap 期望的 JSON 就是 GET /api/v1/workspace/bootstrap 的返回体（去掉 Bearer 头也能抓：',
    '  浏览器开发者工具 → Network → bootstrap 请求 → 复制响应）。',
  ].join('\n'));
  process.exit(0);
}

if (!BOOTSTRAP_FILE && (!origin || !/^https:\/\//.test(origin))) {
  console.error('用法: node verify-provider.mjs https://your-oa.example.com [--no-browser] [--client-id <id>] [--bootstrap <json>]');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const record = (level, name, detail) => {
  results.push({ level, name, detail });
  const mark = level === 'pass' ? 'PASS' : level === 'warn' ? 'WARN' : 'FAIL';
  console.log(`[${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const verifier = crypto.randomBytes(48).toString('base64url');

// ---- 0. --bootstrap：离线契约校验（不访问网络）------------------------------
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
    BOOTSTRAP_FILE ? 'bootstrap 响应符合接入规范（§4 / §12）。' : '登录页侧配置符合接入规范 §11。'}`);
  process.exit(0);
}

// ---- bootstrap 离线契约校验（规则与桌面端 electron/workspace-auth.cjs 保持一致） ----
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
  if (isObject(raw)) {
    need(text(raw.installation_id), 'installation_id：非空字符串（应与 discovery 一致）');
    need(text(raw.workspace_id), 'workspace_id：非空字符串（应与 discovery 一致）');
    need(isObject(raw.tenant) && text(raw.tenant.id) && text(raw.tenant.name), 'tenant：{id,name} 两个非空字符串');
    need(text(raw.member_id), 'member_id：当前登录成员在 team 中的 id');
    need(Array.isArray(raw.permissions) && raw.permissions.every(text), 'permissions：非空字符串数组');
    need(Array.isArray(raw.permissions) && raw.permissions.includes('office.view'), 'permissions 必须包含 office.view');
    need(isObject(raw.policy), 'policy：对象（可返回 {}）');
    need(isObject(raw.dataSlots), 'dataSlots：对象（可返回 {}）');
    if (raw.collaboration?.reporting !== undefined) need(isObject(raw.collaboration.reporting) && raw.collaboration.reporting.version === 1, 'collaboration.reporting：通用日志契约 version=1');
    if (raw.collaboration?.scopes !== undefined) need(Array.isArray(raw.collaboration.scopes) && raw.collaboration.scopes.every(scope => isObject(scope) && /^[a-zA-Z0-9_-]{1,128}$/.test(scope.id) && text(scope.label)), 'collaboration.scopes：通用范围ID与名称，不要求数字租户编号');
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
      need(Array.isArray(raw.team) && raw.team.some((member) => isObject(member) && member.id === raw.member_id),
        'team：必须包含 member_id 对应的自己（bootstrap 要把自己放进 team）');
      if (!raw.permissions?.includes?.('team.view')) need(raw.team.length === 1, '无 team.view 时 team 只应返回本人');
    }

    const layout = raw.layout;
    need(isObject(layout), 'layout：{width,height,rooms,assignments}');
    if (isObject(layout)) {
      need(Number.isFinite(layout.width) && layout.width > 0, 'layout.width：正数（办公室画布宽）');
      need(Number.isFinite(layout.height) && layout.height > 0, 'layout.height：正数（办公室画布高）');
      need(Array.isArray(layout.rooms), 'layout.rooms：房间数组');
      if (Array.isArray(layout.rooms)) {
        layout.rooms.forEach((room, index) => {
          const at = `layout.rooms[${index}]`;
          need(isObject(room), `${at}：必须是对象`);
          if (!isObject(room)) return;
          need(text(room.id), `${at}.id：非空字符串`);
          need(text(room.name), `${at}.name：房间显示名`);
          need(text(room.template), `${at}.template：办公室模板 id（如 desk-grid）`);
          need(isObject(room.frame) && ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(room.frame[key]) && room.frame[key] >= 0),
            `${at}.frame：{x,y,width,height} 非负数字`);
          need(optionalBoolean(room.useTemplateFurniture), `${at}.useTemplateFurniture：可选布尔值`);
          need(room.walls === undefined || (isObject(room.walls) && Object.entries(room.walls).every(([side, finish]) =>
            ['north', 'east', 'south', 'west'].includes(side) && ['solid', 'glass', 'open'].includes(finish))),
          `${at}.walls：可选各方向隔墙类型`);
          need(room.floorMaterial === undefined || ['wood', 'tile', 'concrete'].includes(room.floorMaterial),
            `${at}.floorMaterial：可选木地板、地砖或水泥`);
          if (room.door !== undefined) {
            const door = room.door;
            const length = ['north', 'south'].includes(door?.side) ? room.frame?.width : room.frame?.height;
            const center = door?.offset * length;
            need(isObject(door) && ['north', 'east', 'south', 'west'].includes(door.side)
              && Number.isFinite(door.offset) && Number.isFinite(door.width) && door.width > 0
              && center - door.width / 2 >= 6 && center + door.width / 2 <= length - 6,
            `${at}.door：可选墙面、门洞相对位置和宽度，距墙角至少 6`);
          }
          if (room.seats !== undefined) {
            need(Array.isArray(room.seats) && room.seats.length <= 60 && room.seats.every((seat) =>
              isObject(seat) && [seat.x, seat.y].every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)
              && (seat.facing === undefined || ['north', 'south'].includes(seat.facing))), `${at}.seats：工位数组，包含归一化坐标和可选朝向`);
          }
          if (room.furniture !== undefined) {
            need(Array.isArray(room.furniture) && room.furniture.length <= 60 && room.furniture.every((item) =>
              isObject(item) && id(item.id) && ['desk', 'shelf', 'plant', 'sofa', 'coffee', 'lamp'].includes(item.kind)
              && [item.x, item.y].every((coordinate) => Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)
              && Number.isFinite(item.rotation) && item.rotation >= 0 && item.rotation < 360
              && (item.size === undefined || (item.kind === 'desk' && isObject(item.size)
                && [item.size.width, item.size.depth].every((v) => Number.isFinite(v) && v >= 20 && v <= 240)))),
            `${at}.furniture：受支持的家具、归一化坐标和旋转角度`);
          }
        });
      }
      need(isObject(layout.assignments), 'layout.assignments：对象（成员 id → 房间 id，可为 {}）');
      if (isObject(layout.assignments)) {
        Object.entries(layout.assignments).forEach(([memberId, roomId]) => {
          need(text(roomId), `layout.assignments.${memberId}：必须是非空字符串（房间 id）`);
          need(Array.isArray(raw.team) && raw.team.some((member) => member?.id === memberId),
            `layout.assignments.${memberId}：成员应位于当前可见目录内`);
        });
      }
    }
  }

  if (issues.length) {
    record('fail', 'bootstrap 不符合契约', `${issues.length} 处问题：`);
    for (const issue of issues) console.log(`       ✗ ${issue}`);
  } else {
    record('pass', 'bootstrap 符合契约', `team ${raw.team.length} 人 · rooms ${raw.layout.rooms.length} 间 · member_id ${raw.member_id}`);
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
