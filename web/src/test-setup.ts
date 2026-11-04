import '@testing-library/jest-dom/vitest'
import { useLangStore } from './i18n'

// 现有用例按中文文案断言;英文文案另有 i18n.test.ts 覆盖
useLangStore.setState({ pref: 'zh' })
