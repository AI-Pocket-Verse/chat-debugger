import { currentLang } from '../i18n'

// 安全段:左侧标红、编辑时提示审计。safety_boundary 是角色人设里的安全边界段(未聊天时的占位)。
const SAFETY = new Set(['SafetyConstraints', 'PlatformRules', 'safety_boundary'])
export function isSafetySection(name: string): boolean {
  return SAFETY.has(name)
}

// 动态段:每轮由后端实时生成(当前时间 / 各类记忆),内容随对话变。
// 覆盖(override)会把它冻结成固定文本,时间/记忆就不再实时更新——编辑弹窗会提示。
const DYNAMIC = new Set(['CurrentTime', 'EventMemory', 'DatedMemory', 'RecentContext', 'ImageFact'])
export function isDynamicSection(name: string): boolean {
  return DYNAMIC.has(name)
}

// 角色人设七段(GET /debug/roles 的 prompt_persona 字段),未聊天时作为左侧占位,按此顺序展示
export const PERSONA_KEYS = ['identity_base', 'daily_style', 'relationship_base', 'emotion_support', 'media_policy', 'reality_boundary', 'safety_boundary'] as const

// 后端各 prompt 段名 → 中文展示名
const SECTION_ZH: Record<string, string> = {
  identity_base: '身份基座',
  daily_style: '日常风格',
  relationship_base: '关系基座',
  emotion_support: '情绪支持',
  media_policy: '媒体策略',
  reality_boundary: '现实边界',
  safety_boundary: '安全边界',
  Role: '角色人设',
  RolePersonaScene: '角色场景人设',
  PlatformRules: '平台规则',
  DialogueRules: '对话规则',
  SafetyConstraints: '安全约束',
  CurrentTime: '当前时间',
  EventMemory: '事件记忆',
  DatedMemory: '日期记忆',
  ImageFact: '图片事实',
  RecentContext: '近期上下文',
  PersonaGuard: '人设守护(反操控)',
  PersonaState: '人格状态',
  RelationshipStage: '关系阶段',
  Cognitive: '认知层',
  DynamicPersona: '动态人格',
  ConversationLiveliness: '对话活跃度',
  ConversationExtension: '对话延伸',
  BehaviorPolicy: '行为策略',
  IntentRoute: '意图路由',
  EmotionStrategy: '情绪策略',
  FewShot: '示例样本(Few-shot)',
}

// 英文界面:后端段名本身就是英文,只给人设七段的 snake_case 键配可读名字
const SECTION_EN: Record<string, string> = {
  identity_base: 'Identity',
  daily_style: 'Daily style',
  relationship_base: 'Relationship base',
  emotion_support: 'Emotional support',
  media_policy: 'Media policy',
  reality_boundary: 'Reality boundary',
  safety_boundary: 'Safety boundary',
}

/** 段名 → 当前语言的展示名;没有映射的原样返回 */
export function sectionLabel(name: string): string {
  return (currentLang() === 'zh' ? SECTION_ZH : SECTION_EN)[name] ?? name
}

/** 把 content 里的【...】高亮为 primary(返回 React 可渲染片段的数据) */
export function highlightBrackets(text: string): { t: string; hi: boolean }[] {
  const parts: { t: string; hi: boolean }[] = []
  const re = /【[^】]+】/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index), hi: false })
    parts.push({ t: m[0], hi: true })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ t: text.slice(last), hi: false })
  return parts
}
