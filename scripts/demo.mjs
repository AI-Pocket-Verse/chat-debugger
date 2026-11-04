/**
 * 一条命令体验：启动示例后端（:8680）+ 观测台开发服务器（:5050），并打开浏览器。
 *
 *   pnpm demo
 *
 * Ctrl+C 同时停止两者。
 */
import { spawn } from 'node:child_process'

import { start } from '../mock/server.mjs'

try {
  await start()
} catch (e) {
  console.error(`[demo] mock backend failed to start: ${e.message}`)
  console.error('[demo] Is port 8680 already in use? Stop the other process or run `PORT=9000 pnpm mock` and point the UI at it.')
  process.exit(1)
}

// Windows 上 pnpm 是 .cmd,需要经 shell 启动;参数固定,不拼接用户输入
const web = spawn('pnpm', ['--filter', '@chat-debugger/web', 'dev', '--open'], { stdio: 'inherit', shell: process.platform === 'win32' })

const stop = (code = 0) => {
  web.kill()
  process.exit(code)
}
web.on('exit', (code) => process.exit(code ?? 0))
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
