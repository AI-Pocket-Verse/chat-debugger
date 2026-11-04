import { useEffect } from 'react'

import Titlebar from './components/Titlebar'
import ChatPage from './pages/ChatPage'
import { translate, useLang } from './i18n'
import { useConfigStore } from './stores/config'
import { useUiStore } from './stores/ui'

export function App() {
  const lang = useLang()

  // 页面标题与 <html lang> 跟随界面语言
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
    document.title = translate(lang, 'app.title')
  }, [lang])

  // 还没填后端地址时直接弹出连接配置,省得用户先撞一次「初始化失败」
  useEffect(() => {
    if (!useConfigStore.getState().baseUrl) useUiStore.getState().openConfig(true)
  }, [])

  return (
    <div className="flex h-screen flex-col bg-surface">
      <Titlebar />
      <ChatPage />
    </div>
  )
}
