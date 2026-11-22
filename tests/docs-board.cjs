// Run after npm run build. Uses a temporary profile and synthetic demo data only.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'rallyloom-docs-board-'))
fs.copyFileSync(path.join(__dirname, 'fixtures', 'docs-board-preload.cjs'), path.join(fixture, 'preload.cjs'))
fs.copyFileSync(path.join(__dirname, 'fixtures', 'docs-board-main.cjs'), path.join(fixture, 'main.cjs'))
const env = { ...process.env, RALLY_TEST_FIXTURE: fixture, RALLY_TEST_DIST: path.join(root, 'dist', 'index.html') }
delete env.ELECTRON_RUN_AS_NODE
const run = spawnSync(require('electron'), ['--user-data-dir=' + path.join(fixture, 'profile'), path.join(fixture, 'main.cjs')], { env, timeout: 50000, windowsHide: true, stdio: 'ignore' })
const report = fs.existsSync(path.join(fixture, 'result.txt')) ? fs.readFileSync(path.join(fixture, 'result.txt'), 'utf8') : 'No test report'
console.log(report)
console.log('Evidence: ' + fixture)
if (run.error) console.error(run.error.message)
process.exitCode = run.error || !report.startsWith('PASS') ? 1 : 0
