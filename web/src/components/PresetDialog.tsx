import { useState } from 'react'
import { roleDisplayName, useUiStore } from '../stores/ui'
import { backendCfg, useConfigStore } from '../stores/config'
import { preset } from '../lib/backendClient'
import { useT, type MsgKey } from '../i18n'
import { ModalShell, Field, Btn, Seg } from './ui/ModalShell'

// 关系阶段 S0–S4(取值与后端约定一致,见 docs/backend-protocol.md);名称文案 key 为 stage.<v>
const STAGES = [0, 1, 2, 3, 4]
// 活跃态 active_state;名称文案 key 为 active.<v>
const ACTIVES = ['active', 'cooling', 'dormant', 'rewarming']

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-primary" />
        <span className="w-10 text-right font-mono text-[12px] font-bold text-primary">{value}</span>
      </div>
    </Field>
  )
}

export default function PresetDialog() {
  const open = useUiStore((s) => s.presetOpen)
  const setOpen = useUiStore((s) => s.openPreset)
  const roles = useUiStore((s) => s.roles)
  const { uid, roleId } = useConfigStore()
  const [stage, setStage] = useState(2)
  const [love, setLove] = useState(68)
  const [trust, setTrust] = useState(62)
  const [dep, setDep] = useState(0)
  const [active, setActive] = useState('active')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const ok = msg.startsWith('✓')
  const t = useT()

  const roleName = roleDisplayName(roles, roleId)

  const apply = async () => {
    if (!uid) { setMsg(t('preset.needInit')); return }
    setBusy(true); setMsg('')
    try {
      await preset(backendCfg(), {
        uid,
        role_id: String(roleId),
        stage,
        love_score: love,
        trust_score: trust,
        dependency_risk: dep,
        active_state: active,
      })
      setMsg(t('preset.done', { uid, role: roleName }))
    } catch (e) { setMsg(String(e)) } finally { setBusy(false) }
  }

  return (
    <ModalShell
      open={open}
      onOpenChange={setOpen}
      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[19px]"><path d="M3 6h18M6 12h12M9 18h6" /></svg>}
      title={t('preset.title')}
      desc={t('preset.desc', { uid: uid || t('common.notInit'), role: roleName })}
      footer={
        <>
          <span className="mr-auto text-[11.5px] text-muted/70">{t('preset.footer')}</span>
          <Btn onClick={() => setOpen(false)}>{t('common.cancel')}</Btn>
          <Btn variant="primary" disabled={busy} onClick={apply}>{busy ? t('preset.applying') : t('preset.apply')}</Btn>
        </>
      }
    >
      <Field label={t('preset.stage')}>
        <Seg options={STAGES.map((v) => ({ v, name: t(`stage.${v}` as MsgKey), code: `S${v}` }))} value={stage} onChange={setStage} />
      </Field>
      <Slider label={t('preset.love')} value={love} min={0} max={100} onChange={setLove} />
      <Slider label={t('preset.trust')} value={trust} min={0} max={100} onChange={setTrust} />
      <Slider label={t('preset.dep')} value={dep} min={0} max={3} onChange={setDep} />
      <Field label={t('preset.active')}>
        <Seg options={ACTIVES.map((v) => ({ v, name: t(`active.${v}` as MsgKey) }))} value={active} onChange={setActive} />
      </Field>
      {msg && <div className={`rounded-xl px-3 py-2 text-[12px] ${ok ? 'border border-primary/20 bg-accent-soft text-primary' : 'border border-red-200 bg-red-50 text-red-600'}`}>{msg}</div>}
    </ModalShell>
  )
}
