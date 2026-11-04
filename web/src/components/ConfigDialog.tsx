import { useEffect, useState } from 'react'
import { backendCfg, useConfigStore } from '../stores/config'
import { useChatStore } from '../stores/chat'
import { roleDisplayName, useUiStore } from '../stores/ui'
import { getModels, getToken, parseExtraHeaders, type ModelsResp } from '../lib/backendClient'
import { taGenderForRole } from '../lib/roleSession'
import { useLangStore, useT, type LangPref } from '../i18n'
import { ModalShell, Field, inputCls, Btn, Seg } from './ui/ModalShell'

// 模型列表的加载状态:后端没实现 /debug/models(或出错)时退回手填
type ModelsState = { kind: 'idle' | 'loading' } | { kind: 'ok'; data: ModelsResp } | { kind: 'error'; err: string }

function ModelField() {
  const t = useT()
  const open = useUiStore((s) => s.configOpen)
  const { baseUrl, debugKey, extraHeaders, model, set } = useConfigStore()
  const [state, setState] = useState<ModelsState>({ kind: 'idle' })

  // 弹窗打开、地址或口令变化时拉一次;输入地址时防抖,避免每敲一个字发一次请求
  useEffect(() => {
    if (!open || !baseUrl || !debugKey) { setState({ kind: 'idle' }); return }
    let alive = true
    const timer = setTimeout(() => {
      setState({ kind: 'loading' })
      getModels(backendCfg())
        .then((data) => { if (alive) setState({ kind: 'ok', data }) })
        .catch((e) => { if (alive) setState({ kind: 'error', err: e instanceof Error ? e.message : String(e) }) })
    }, 400)
    return () => { alive = false; clearTimeout(timer) }
  }, [open, baseUrl, debugKey, extraHeaders])

  const models = state.kind === 'ok' ? state.data.models : []
  if (models.length > 0 && state.kind === 'ok') {
    const def = state.data.default
    const defName = models.find((m) => m.id === def)?.name ?? def
    // 已选的模型不在当前列表里(后端下线了某模型):保留为一个选项,让用户看见并自己换掉
    const stale = model && !models.some((m) => m.id === model)
    return (
      <Field label={t('config.model')}>
        <select className={inputCls} value={model} onChange={(e) => set({ model: e.target.value })}>
          <option value="">{defName ? t('config.modelDefaultNamed', { name: defName }) : t('config.modelDefault')}</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.name && m.name !== m.id ? `${m.name} · ${m.id}` : m.id}</option>
          ))}
          {stale && <option value={model}>{t('config.modelNotInList', { id: model })}</option>}
        </select>
        <p className="mt-1 text-[11.5px] text-muted/70">{t('config.modelHelp')}</p>
      </Field>
    )
  }

  return (
    <Field label={t('config.model')}>
      <input className={`${inputCls} font-mono text-[12.5px]`} value={model} placeholder={t('config.modelPh')} onChange={(e) => set({ model: e.target.value })} />
      <p className="mt-1 text-[11.5px] text-muted/70">
        {state.kind === 'loading' ? t('config.modelLoading') : state.kind === 'error' ? t('config.modelUnavailable', { err: state.err }) : t('config.modelHelp')}
      </p>
    </Field>
  )
}

export default function ConfigDialog() {
  const open = useUiStore((s) => s.configOpen)
  const setOpen = useUiStore((s) => s.openConfig)
  const roles = useUiStore((s) => s.roles)
  const { baseUrl, debugKey, extraHeaders, operator, token, roleId, set, setSession } = useConfigStore()
  const langPref = useLangStore((s) => s.pref)
  const setLangPref = useLangStore((s) => s.setPref)
  const t = useT()
  const headersErr = parseExtraHeaders(extraHeaders)
  const roleName = roleDisplayName(roles, roleId)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [ok, setOk] = useState('')
  const [confirming, setConfirming] = useState(false)
  const hasToken = !!token

  // 初始化/换号都只作用于「当前角色」:token 按角色铸(后端的角色绑在 token 上),
  // 其他角色各自的 token/历史不受影响。
  const init = async () => {
    setBusy(true)
    setErr('')
    setOk('')
    try {
      const tk = await getToken(backendCfg(), taGenderForRole(roleId))
      setSession(roleId, { token: tk.token, uid: tk.uid })
      // 换新号 = 后端新测试账号(新记忆/关系态),旧对话不再关联 → 清空该角色的会话重开
      //(只清当前角色的桶,其他角色的本地历史保留)。
      useChatStore.getState().clear(roleId)
      setOk(t('config.initOk', { role: roleName, uid: tk.uid }))
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  // token 显示首尾、中间省略(JWT 前缀常相同,显示尾部才能看出换号变化)
  const fmtToken = (s: string) => (!s ? t('common.notInit') : s.length <= 40 ? s : `${s.slice(0, 18)}……${s.slice(-18)}`)

  // 已有 token 时,先要一步内联确认(防手滑换掉当前会话)
  const onPrimary = () => {
    if (hasToken && !confirming) { setConfirming(true); return }
    void init()
  }

  const langOptions: { v: LangPref; name: string }[] = [
    { v: 'auto', name: t('config.langAuto') },
    { v: 'zh', name: '中文' },
    { v: 'en', name: 'English' },
  ]

  return (
    <ModalShell
      open={open}
      onOpenChange={setOpen}
      icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-[19px]"><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></svg>}
      title={t('config.title')}
      desc={t('config.desc')}
      footer={
        <>
          {confirming ? (
            <span className="mr-auto text-[11.5px] font-semibold text-red-600">{t('config.confirmWarn', { role: roleName })}</span>
          ) : (
            <span className="mr-auto text-[11.5px] text-muted/70">{hasToken ? t('config.initialized', { role: roleName }) : t('config.initHint', { role: roleName })}</span>
          )}
          {confirming && <Btn onClick={() => setConfirming(false)}>{t('config.cancelSwitch')}</Btn>}
          <Btn onClick={() => { setConfirming(false); setOpen(false) }}>{t('common.close')}</Btn>
          <Btn variant={confirming ? 'danger' : 'primary'} disabled={busy} onClick={onPrimary}>
            {busy ? t('config.initializing') : confirming ? t('config.confirmSwitch') : hasToken ? t('config.reinit') : t('config.init')}
          </Btn>
        </>
      }
    >
      <Field label={t('config.baseUrl')}>
        <input className={inputCls} value={baseUrl} placeholder="https://example.com/companion" onChange={(e) => set({ baseUrl: e.target.value })} />
      </Field>
      <Field label="X-Debug-Key">
        <input className={inputCls} type="password" value={debugKey} placeholder={t('config.debugKeyPh')} onChange={(e) => set({ debugKey: e.target.value })} />
      </Field>
      <ModelField />
      <Field label={t('config.extraHeaders')}>
        <textarea
          className={`${inputCls} h-20 resize-none font-mono text-[12px]`}
          value={extraHeaders}
          placeholder='{"app_version": "9.9.9"}'
          onChange={(e) => set({ extraHeaders: e.target.value })}
        />
        {headersErr instanceof Error && <p className="mt-1 text-[11.5px] text-red-600">{t('config.headersIgnored', { msg: headersErr.message })}</p>}
      </Field>
      <Field label={t('config.operator')}>
        <input className={inputCls} value={operator} placeholder={t('config.operatorPh')} onChange={(e) => set({ operator: e.target.value })} />
      </Field>
      <Field label={`${t('config.token', { role: roleName })}${token ? t('config.tokenLen', { n: token.length }) : ''}`}>
        <input className={`${inputCls} font-mono text-[12px] text-muted`} readOnly value={fmtToken(token)} />
      </Field>
      <Field label={t('config.lang')}>
        <Seg options={langOptions} value={langPref} onChange={setLangPref} />
      </Field>
      {ok && <div className="rounded-xl border border-primary/20 bg-accent-soft px-3 py-2 text-[12px] font-semibold text-primary">{ok}</div>}
      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">{err}</div>}
    </ModalShell>
  )
}
