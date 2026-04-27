import React, { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { api, SessionItem, StatusResponse, Provider, ChatMessage, KnowledgeGroup, KnowledgeItem, StorageGroup, StorageDetail, StorageCleanupResult, ImChannel, ImChannelStatus } from "./api"
import MessageRenderer from "./components/MessageRenderer"
import "./styles/app.css"

type Message = ChatMessage
type Page = "dashboard" | "session" | "settings"
type Theme = "dark" | "light" | "system"
type IconName =
  | "dashboard"
  | "session"
  | "skills"
  | "workspace"
  | "settings"
  | "logout"
  | "profile"
  | "models"
  | "agent"
  | "notifications"
  | "appearance"
  | "gateway"
  | "providers"
  | "chapters"
  | "server"
  | "users"
  | "terminals"
  | "storage"
  | "runtime"
  | "usage"
  | "prompt"
  | "memory"
  | "sop"
  | "about"

type SettingsItem = {
  label: string
  key: string
  icon: IconName
  group?: string
}

function SettingsPanel({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <div className={`settings-panel ${active ? 'is-active' : ''}`}>{children}</div>
}

const personalSettings: SettingsItem[] = [
  { label: "个人资料", key: "profile", icon: "profile", group: "个人设置" },
  { label: "外观与界面", key: "appearance", icon: "appearance" },
  { label: "IM 网关", key: "gateway", icon: "gateway" },
]

const instanceSettings: SettingsItem[] = [
  { label: "提供商", key: "providers", icon: "providers", group: "实例管理" },
  { label: "系统提示词", key: "prompts", icon: "prompt" },
  { label: "记忆", key: "memory", icon: "memory" },
  { label: "SOP", key: "sop", icon: "sop" },
  { label: "技能", key: "skills-settings", icon: "skills" },
  { label: "储存空间", key: "storage", icon: "storage" },
  { label: "运行资源", key: "runtime", icon: "runtime" },
  { label: "使用历史", key: "usage", icon: "usage" },
  { label: "关于", key: "about", icon: "about" },
]

const mainNavItems: { label: string; page?: Page; icon: IconName }[] = [
  { label: "仪表盘", page: "dashboard", icon: "dashboard" },
  { label: "会话", page: "session", icon: "session" },
]

const WEBUI_REPO_URL = "https://github.com/pandyzhou/GenericAgent-WebUI"
const WEBUI_ISSUES_URL = `${WEBUI_REPO_URL}/issues`
const GENERIC_AGENT_REPO_URL = "https://github.com/pandyzhou/GenericAgent"
const GENERIC_AGENT_UPSTREAM_URL = "https://github.com/lsdefine/GenericAgent"

function NavIcon({ name }: { name: IconName }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "nav-svg",
    'aria-hidden': true,
  }

  switch (name) {
    case "dashboard":
      return <svg {...common}><path d="M4 13h7V4H4zM13 20h7v-9h-7zM13 11h7V4h-7zM4 20h7v-5H4z" /></svg>
    case "session":
      return <svg {...common}><path d="M5 6h14v9H9l-4 3z" /><path d="M9 10h6" /></svg>
    case "skills":
      return <svg {...common}><path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z" /><path d="M18 15l.9 2.1L21 18l-2.1.9L18 21l-.9-2.1L15 18l2.1-.9z" /></svg>
    case "workspace":
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M9 10h12" /></svg>
    case "settings":
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.04 1.55V22a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.04-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87A1.7 1.7 0 0 0 3 13.96H2.9a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.55-1.04 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V2a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.04 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c0 .68.4 1.29 1.04 1.55.16.07.33.1.51.1H21.1a2 2 0 1 1 0 4H21c-.68 0-1.29.4-1.55 1.04z" /></svg>
    case "logout":
      return <svg {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>
    case "profile":
      return <svg {...common}><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="8" r="4" /></svg>
    case "models":
      return <svg {...common}><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.66 3.13 3 7 3s7-1.34 7-3V6" /><path d="M5 12v6c0 1.66 3.13 3 7 3s7-1.34 7-3v-6" /></svg>
    case "agent":
      return <svg {...common}><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M9.5 10.5h5M9.5 13.5h5M12 7V4M17 12h3M4 12h3M12 20v-3" /></svg>
    case "notifications":
      return <svg {...common}><path d="M15 17H9l-1 2h8z" /><path d="M18 14V11a6 6 0 1 0-12 0v3l-2 2h16z" /></svg>
    case "appearance":
      return <svg {...common}><path d="M12 3a9 9 0 1 0 9 9c0-1.1-.9-2-2-2h-2.2a2.3 2.3 0 0 1-2.2-3 2.3 2.3 0 0 0-2.2-4z" /><circle cx="7.5" cy="12" r=".8" /><circle cx="10.5" cy="8" r=".8" /><circle cx="15.5" cy="8.5" r=".8" /></svg>
    case "gateway":
      return <svg {...common}><path d="M7 7h10v10H7z" /><path d="M3 12h4M17 12h4M12 3v4M12 17v4" /></svg>
    case "providers":
      return <svg {...common}><path d="M7 18a4 4 0 0 1-.6-8A5 5 0 0 1 17 8a3.5 3.5 0 1 1 .5 7H7z" /></svg>
    case "chapters":
      return <svg {...common}><path d="M7 6v12M7 6a3 3 0 1 0 3 3M7 18a3 3 0 1 1 3-3M17 6a3 3 0 1 1 0 6h-7M17 18a3 3 0 1 1 0-6h-7" /></svg>
    case "server":
      return <svg {...common}><rect x="4" y="4" width="16" height="6" rx="2" /><rect x="4" y="14" width="16" height="6" rx="2" /><path d="M8 7h.01M8 17h.01" /></svg>
    case "users":
      return <svg {...common}><path d="M16 21v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1" /><circle cx="9.5" cy="8" r="3.5" /><path d="M20 21v-1a4 4 0 0 0-3-3.87" /><path d="M16 4.13a3.5 3.5 0 0 1 0 6.74" /></svg>
    case "terminals":
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m7 10 2 2-2 2M11 14h6" /></svg>
    case "storage":
      return <svg {...common}><ellipse cx="12" cy="5.5" rx="7" ry="2.5" /><path d="M5 5.5v13c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5v-13" /><path d="M5 12c0 1.38 3.13 2.5 7 2.5s7-1.12 7-2.5" /></svg>
    case "runtime":
      return <svg {...common}><path d="M4 12h4l2-5 4 10 2-5h4" /></svg>
    case "usage":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
    case "prompt":
      return <svg {...common}><path d="M4 5h16M4 12h10M4 19h16" /><path d="M16 10l2 2-2 2" /></svg>
    case "memory":
      return <svg {...common}><path d="M6 4h12v16H6z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>
    case "sop":
      return <svg {...common}><path d="M5 4h10l4 4v12H5z" /><path d="M15 4v5h4" /><path d="M8 13h8M8 17h5" /></svg>
    case "about":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 10h.01M11 14h2v4h-2z" /></svg>
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>
  }
}

const TYPE_LABELS: Record<string, string> = {
  native_claude: "Native Claude",
  native_oai: "Native OAI",
  oai: "OAI 兼容",
  claude: "Claude",
}

function ProviderEditForm({
  draft,
  setDraft,
  adding,
  providerKey,
  modelsCache,
  modelsLoadingKey,
  fetchModels,
  testResult,
  testLoadingKey,
  testConnection,
  cancelEdit,
  saveEdit,
}: {
  draft: Partial<Provider> & { apikey?: string }
  setDraft: React.Dispatch<React.SetStateAction<Partial<Provider> & { apikey?: string }>>
  adding: boolean
  providerKey: string | null
  modelsCache: Record<string, string[]>
  modelsLoadingKey: string | null
  fetchModels: (key: string, force?: boolean) => Promise<void>
  testResult: { ok: boolean; msg: string; elapsed?: number } | null
  testLoadingKey: string | null
  testConnection: (key: string) => Promise<void>
  cancelEdit: () => void
  saveEdit: () => Promise<void>
}) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  const cachedModels = providerKey ? (modelsCache[providerKey] || []) : []

  const validate = () => {
    const next: Record<string, string> = {}
    if (!draft.name?.trim()) next.name = '名称不能为空'
    if (adding && !draft.apikey?.trim()) next.apikey = 'API Key 不能为空'
    if (!draft.apibase?.trim()) next.apibase = 'API Base URL 不能为空'
    if (!draft.model?.trim()) next.model = '模型不能为空'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    saveEdit()
  }

  return (
    <div className="prov-edit-form">
      <div className="prov-edit-grid">
        <label className={errors.name ? 'is-invalid' : ''}>
          名称
          <input value={draft.name || ""} onChange={(e) => { setDraft((prev) => ({ ...prev, name: e.target.value })); if (errors.name) setErrors((prev) => { const n = { ...prev }; delete n.name; return n }) }} />
          {errors.name && <span className="field-error">{errors.name}</span>}
        </label>
        <label>
          类型
          <select value={draft.type || "oai"} onChange={(e) => setDraft((prev) => ({ ...prev, type: e.target.value }))}>
            <option value="oai">OAI 兼容</option>
            <option value="native_claude">Native Claude</option>
            <option value="native_oai">Native OAI</option>
            <option value="claude">Claude</option>
          </select>
        </label>
        <label className={errors.apikey ? 'is-invalid' : ''}>
          API Key
          <input type="password" placeholder={adding ? "输入 API Key" : "留空则不修改"} value={draft.apikey || ""} onChange={(e) => { setDraft((prev) => ({ ...prev, apikey: e.target.value })); if (errors.apikey) setErrors((prev) => { const n = { ...prev }; delete n.apikey; return n }) }} />
          {errors.apikey && <span className="field-error">{errors.apikey}</span>}
        </label>
        <label className={errors.apibase ? 'is-invalid' : ''}>
          API Base URL
          <input value={draft.apibase || ""} onChange={(e) => { setDraft((prev) => ({ ...prev, apibase: e.target.value })); if (errors.apibase) setErrors((prev) => { const n = { ...prev }; delete n.apibase; return n }) }} />
          {errors.apibase && <span className="field-error">{errors.apibase}</span>}
        </label>
        <label className={`prov-model-field ${errors.model ? 'is-invalid' : ''}`}>
          模型
          <div className="prov-model-row">
            {cachedModels.length > 0 ? (
              <select value={draft.model || ""} onChange={(e) => { setDraft((prev) => ({ ...prev, model: e.target.value })); if (errors.model) setErrors((prev) => { const n = { ...prev }; delete n.model; return n }) }}>
                <option value="">选择模型...</option>
                {cachedModels.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input value={draft.model || ""} onChange={(e) => { setDraft((prev) => ({ ...prev, model: e.target.value })); if (errors.model) setErrors((prev) => { const n = { ...prev }; delete n.model; return n }) }} />
            )}
            {providerKey && (
              <button type="button" className="prov-btn-sm" disabled={modelsLoadingKey === providerKey} onClick={() => fetchModels(providerKey, true)}>
                {modelsLoadingKey === providerKey ? "获取中..." : cachedModels.length ? "刷新模型列表" : "获取模型列表"}
              </button>
            )}
          </div>
          {errors.model && <span className="field-error">{errors.model}</span>}
        </label>
        {(draft.type === "oai" || draft.type === "native_oai") && (
          <label>API Mode
            <select value={draft.api_mode || "chat_completions"} onChange={(e) => setDraft((prev) => ({ ...prev, api_mode: e.target.value }))}>
              <option value="chat_completions">chat_completions</option>
              <option value="responses">responses</option>
            </select>
          </label>
        )}
        <label>Reasoning Effort
          <select value={draft.reasoning_effort || ""} onChange={(e) => setDraft((prev) => ({ ...prev, reasoning_effort: e.target.value }))}>
            <option value="">无</option>
            <option value="none">none</option>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="xhigh">xhigh</option>
          </select>
        </label>
      </div>
      <div className="prov-edit-actions">
        {providerKey && (
          <button type="button" className={`prov-btn-sm ${testLoadingKey === providerKey ? "" : "prov-btn-outline"}`} disabled={testLoadingKey === providerKey} onClick={() => testConnection(providerKey)}>
            {testLoadingKey === providerKey ? "测试中..." : "测试连接"}
          </button>
        )}
        {testResult && (
          <div className={`prov-test-card ${testResult.ok ? "is-ok" : "is-err"}`}>
            <strong>{testResult.ok ? "连接正常" : "连接失败"}</strong>
            <span>{testResult.msg}</span>
            {testResult.elapsed ? <small>{testResult.elapsed} ms</small> : null}
          </div>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="prov-btn-sm" onClick={cancelEdit}>取消</button>
        <button type="button" className="prov-btn-sm prov-btn-primary" onClick={handleSave}>保存</button>
      </div>
    </div>
  )
}

const ProvidersPage = ({ currentLlm }: { currentLlm: string }) => {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Provider> & { apikey?: string }>({})
  const [adding, setAdding] = useState(false)
  const [modelsCache, setModelsCache] = useState<Record<string, string[]>>({})
  const [modelsLoadingKey, setModelsLoadingKey] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; elapsed?: number } | null>(null)
  const [testLoadingKey, setTestLoadingKey] = useState<string | null>(null)
  const [providerNotice, setProviderNotice] = useState<{ tone: 'success' | 'warning' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (!providerNotice) return
    const delay = providerNotice.tone === 'success' ? 3000 : providerNotice.tone === 'warning' ? 6000 : 0
    if (delay <= 0) return
    const timer = window.setTimeout(() => setProviderNotice(null), delay)
    return () => window.clearTimeout(timer)
  }, [providerNotice])

  const loadProviders = useCallback(async () => {
    try {
      const res = await api.providers()
      setProviders(res.providers)
    } catch { /* ignore */ }
    setLoading(false)
  }, [])

  useEffect(() => { loadProviders() }, [loadProviders])

  const startEdit = (p: Provider) => {
    setEditingKey(p.key)
    setDraft({ ...p, apikey: "" })
    setTestResult(null)
    setProviderNotice(null)
    setAdding(false)
  }

  const startAdd = () => {
    setAdding(true)
    setEditingKey(null)
    setDraft({ type: "oai", name: "", apikey: "", apibase: "", model: "", api_mode: "chat_completions" })
    setTestResult(null)
    setProviderNotice(null)
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setAdding(false)
    setDraft({})
    setTestResult(null)
  }

  const saveEdit = async () => {
    try {
      if (adding) {
        const payload = { ...draft }
        if (!payload.apikey) delete payload.apikey
        await api.addProvider(payload)
      } else if (editingKey) {
        const payload = { ...draft }
        if (!payload.apikey) delete payload.apikey
        delete payload.key
        await api.updateProvider(editingKey, payload)
      }
      setProviderNotice({ tone: 'success', message: '提供商配置已保存' })
      cancelEdit()
      await loadProviders()
    } catch (e: any) {
      const msg = e?.message || '保存失败'
      if (msg.includes('配置已写入，但 LLM 重载失败')) {
        setProviderNotice({ tone: 'warning', message: msg })
      } else {
        setProviderNotice({ tone: 'error', message: `保存失败：${msg}` })
      }
    }
  }

  const deleteProvider = async (key: string) => {
    await api.deleteProvider(key)
    if (editingKey === key) cancelEdit()
    setProviderNotice(null)
    await loadProviders()
  }

  const fetchModels = async (key: string, force = false) => {
    if (!force && modelsCache[key]?.length) return
    setModelsLoadingKey(key)
    try {
      const res = await api.providerModels(key)
      setModelsCache((prev) => ({ ...prev, [key]: res.ok && res.models ? res.models : [] }))
    } catch {
      setModelsCache((prev) => ({ ...prev, [key]: [] }))
    }
    setModelsLoadingKey(null)
  }

  const testConnection = async (key: string) => {
    setTestLoadingKey(key)
    setTestResult(null)
    try {
      const res = await api.providerTest(key)
      setTestResult({ ok: res.ok, msg: res.ok ? "连接成功" : (res.error || "连接失败"), elapsed: res.elapsed_ms })
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || "连接失败" })
    }
    setTestLoadingKey(null)
  }

  const currentModelName = useMemo(() => providers.find((p) => p.model && p.model === currentLlm)?.model || null, [providers, currentLlm])

  return (
    <div className="appearance-page">
      <div className="settings-breadcrumb">实例管理</div>
      <div className="prov-header">
        <h2 className="settings-title" style={{ margin: 0 }}>提供商</h2>
        <button type="button" className="prov-btn prov-btn-primary" onClick={startAdd}>+ 添加提供商</button>
      </div>

      {providerNotice && (
        <div className={`provider-notice is-${providerNotice.tone}`}>
          <span>{providerNotice.message}</span>
          <button type="button" className="notice-close" onClick={() => setProviderNotice(null)} aria-label="关闭提示">×</button>
        </div>
      )}

      {loading && <p style={{ color: "var(--muted)" }}>加载中...</p>}

      {adding && (
        <div className="prov-card prov-card-editing">
          <div className="prov-card-head"><span className="prov-card-name">新建提供商</span></div>
          <ProviderEditForm
            draft={draft}
            setDraft={setDraft}
            adding={adding}
            providerKey={null}
            modelsCache={modelsCache}
            modelsLoadingKey={modelsLoadingKey}
            fetchModels={fetchModels}
            testResult={testResult}
            testLoadingKey={testLoadingKey}
            testConnection={testConnection}
            cancelEdit={cancelEdit}
            saveEdit={saveEdit}
          />
        </div>
      )}

      {providers.map((p) => {
        const modelLines = [p.model].filter(Boolean)
        const meta = [p.apibase, p.api_mode, p.apikey].filter(Boolean)
        const isCurrent = p.model && p.model === currentModelName
        return (
          <div key={p.key} className={`prov-card ${editingKey === p.key ? "prov-card-editing" : ""}`}>
            <div className="prov-card-head">
              <div className="prov-card-main" onClick={() => editingKey === p.key ? cancelEdit() : startEdit(p)}>
                <div className="prov-title-row">
                  <span className="prov-card-name">{p.name || p.key}</span>
                  <span className="prov-card-type">{TYPE_LABELS[p.type] || p.type}</span>
                  {isCurrent ? (
                    <span className="prov-status-tag is-current">当前使用</span>
                  ) : (
                    <span className={`prov-status-dot ${p.model && p.apibase && p.apikey ? 'is-complete' : 'is-incomplete'}`} title={p.model && p.apibase && p.apikey ? '配置完整' : '配置不完整'} />
                  )}
                </div>
                <div className="prov-model-lines">
                  {modelLines.length ? modelLines.map((m) => <span key={m}>{m}</span>) : <span className="prov-empty-line">未设置模型</span>}
                </div>
                <div className="prov-meta-row">
                  {meta.slice(0, 2).map((m) => <span key={m}>{m}</span>)}
                  {meta.length > 2 && <span>+{meta.length - 2}</span>}
                </div>
              </div>
              <div className="prov-card-actions">
                <label className="prov-mini-switch" title="启用 / 禁用">
                  <input type="checkbox" checked readOnly />
                  <span />
                </label>
                <button type="button" className="prov-icon-action" onClick={() => editingKey === p.key ? cancelEdit() : startEdit(p)}>{editingKey === p.key ? "收起" : "编辑"}</button>
                <button type="button" className="prov-icon-action is-danger" onClick={() => deleteProvider(p.key)}>删除</button>
              </div>
            </div>
            {editingKey === p.key && (
              <ProviderEditForm
                draft={draft}
                setDraft={setDraft}
                adding={adding}
                providerKey={p.key}
                modelsCache={modelsCache}
                modelsLoadingKey={modelsLoadingKey}
                fetchModels={fetchModels}
                testResult={testResult}
                testLoadingKey={testLoadingKey}
                testConnection={testConnection}
                cancelEdit={cancelEdit}
                saveEdit={saveEdit}
              />
            )}
          </div>
        )
      })}

      {!loading && providers.length === 0 && !adding && (
        <p style={{ color: "var(--muted)", marginTop: 16 }}>暂无提供商配置，点击上方按钮添加。</p>
      )}
    </div>
  )
}

const RepoLinkCard = ({ title, desc, href }: { title: string; desc: string; href: string }) => (
  <a className="repo-card" href={href} target="_blank" rel="noreferrer">
    <div>
      <div className="repo-card-title">{title}</div>
      <div className="repo-card-desc">{desc}</div>
      <div className="repo-card-url">{href}</div>
    </div>
    <span className="repo-card-arrow">↗</span>
  </a>
)

const formatRelativeTime = (mtime: number) => {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000 - mtime))
  if (seconds < 60) return `${seconds}秒前`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分前`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`
  return `${Math.floor(seconds / 86400)}天前`
}

const streamStatusText: Record<string, string> = {
  idle: "空闲",
  connecting: "连接中",
  streaming: "推理中",
  done: "已完成",
  error: "出错",
}

const resolveRunState = (busy: boolean, streamStatus: string, running?: boolean) => {
  if (busy) return streamStatusText[streamStatus] || "推理中"
  if (streamStatus === 'error') return '出错'
  if (streamStatus === 'done') return '已完成'
  if (running) return '运行中'
  return '空闲'
}

type SlashCommand = {
  name: string
  insert: string
  desc: string
  kind: "local" | "agent" | "limited"
  group: "会话" | "模型" | "系统" | "Agent"
}

const slashCommands: SlashCommand[] = [
  { name: "/help", insert: "/help", desc: "显示命令帮助", kind: "local", group: "系统" },
  { name: "/status", insert: "/status", desc: "查看当前运行状态和模型", kind: "local", group: "系统" },
  { name: "/stop", insert: "/stop", desc: "停止当前任务", kind: "local", group: "系统" },
  { name: "/new", insert: "/new", desc: "开启新对话并清空上下文", kind: "local", group: "会话" },
  { name: "/restore", insert: "/restore", desc: "恢复上次对话历史（WebUI 中建议使用历史列表）", kind: "limited", group: "会话" },
  { name: "/continue", insert: "/continue", desc: "列出可恢复会话", kind: "local", group: "会话" },
  { name: "/continue [n]", insert: "/continue ", desc: "恢复第 n 个会话", kind: "local", group: "会话" },
  { name: "/resume", insert: "/resume", desc: "让 Agent 从最近历史中总结并恢复", kind: "agent", group: "Agent" },
  { name: "/session.<key>=<value>", insert: "/session.", desc: "设置当前 LLM session 属性", kind: "agent", group: "Agent" },
]

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const normalizeNewChatMessage = (msg?: string) => {
  const text = String(msg || '').trim()
  if (!text) return '已开启新对话，当前上下文已清空'
  if (text.includes('���') || text.includes('�')) return '已开启新对话，当前上下文已清空'
  const cleaned = text.replace(/^[^\p{L}\p{N}\u4e00-\u9fff]+/u, '').trim()
  return cleaned || '已开启新对话，当前上下文已清空'
}

const normalizeSystemMessage = (msg?: string) => {
  const text = String(msg || '').trim()
  if (!text) return ''
  if (!(text.includes('���') || text.includes('�'))) {
    return text
  }
  if (text.includes('已开启新对话')) return '已开启新对话，当前上下文已清空'
  if (text.includes('已打开当前会话')) return '已打开当前会话'
  if (text.includes('已恢复')) return text.replace(/���|�/g, '').trim()
  return text.replace(/���|�/g, '').trim()
}

const getSystemMessageTone = (content: string): 'success' | 'warning' | 'error' | 'info' => {
  const text = String(content || '')
  if (/失败|错误|无法|没有|超时|HTTP\s*[45]/.test(text) || text.startsWith('❌')) return 'error'
  if (/提示|注意|降级|仅恢复上下文|请优先使用/.test(text) || text.startsWith('⚠️')) return 'warning'
  if (/成功|已切换|已恢复|已打开|已开启|已发送/.test(text) || text.startsWith('✅')) return 'success'
  return 'info'
}

const knowledgeSectionMap: Record<string, { group: string; title: string; breadcrumb: string }> = {
  prompts: { group: "prompts", title: "系统提示词", breadcrumb: "实例管理" },
  memory: { group: "memory", title: "记忆", breadcrumb: "实例管理" },
  sop: { group: "sop", title: "SOP", breadcrumb: "实例管理" },
  "skills-settings": { group: "skills", title: "技能", breadcrumb: "实例管理" },
}

const shouldPreviewKnowledgeFile = (path: string) => {
  const name = path.toLowerCase()
  return name.endsWith('.md') ||
    name.includes('sys_prompt') ||
    name.includes('insight_fixed_structure') ||
    name.includes('global_mem')
}

function KnowledgePage({ section }: { section: string }) {
  const meta = knowledgeSectionMap[section] || knowledgeSectionMap.prompts
  const [groups, setGroups] = useState<KnowledgeGroup[]>([])
  const [stats, setStats] = useState<Record<string, { count?: number; last?: string }>>({})
  const [selected, setSelected] = useState<KnowledgeItem | null>(null)
  const [content, setContent] = useState("")
  const [savedContent, setSavedContent] = useState("")
  const [status, setStatus] = useState("")
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const pendingFileRef = useRef<KnowledgeItem | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [kg, st] = await Promise.all([
      api.knowledge(),
      api.memoryStats().catch(() => ({ ok: true, stats: {} })),
    ])
    setGroups(kg.groups)
    setStats(st.stats || {})
    const group = kg.groups.find((g) => g.key === meta.group)
    const first = group?.items?.[0] || null
    setSelected((prev) => group?.items.find((x) => x.path === prev?.path) || first)
    setLoading(false)
  }, [meta.group])

  useEffect(() => { load().catch((e) => setStatus(e.message || String(e))) }, [load])

  const dirty = content !== savedContent

  const doSelectFile = (item: KnowledgeItem) => {
    if (dirty && selected && item.path !== selected.path) {
      setStatus("⚠ 当前文件未保存，直接切换将丢弃更改。")
      pendingFileRef.current = item
      return
    }
    setSelected(item)
  }

  useEffect(() => {
    const item = pendingFileRef.current
    if (item) {
      pendingFileRef.current = null
      setSelected(item)
      return
    }
    if (!selected) {
      setContent("")
      setSavedContent("")
      return
    }
    api.knowledgeFile(selected.path).then((res) => {
      setContent(res.content)
      setSavedContent(res.content)
      setStatus("")
      setViewMode(shouldPreviewKnowledgeFile(selected.path) ? 'preview' : 'edit')
    }).catch((e) => setStatus(e.message || String(e)))
  }, [selected?.path])

  const group = groups.find((g) => g.key === meta.group)

  const save = async () => {
    if (!selected || selected.readonly) return
    setSaving(true)
    setStatus("")
    try {
      const res = await api.saveKnowledgeFile(selected.path, content)
      setSavedContent(content)
      setStatus("✅ 保存成功")
      if (res.backup) setStatus(`✅ 保存成功 · 备份：${res.backup}`)
      await load()
    } catch (e: any) {
      setStatus(`❌ 保存失败：${e.message || e}`)
    } finally {
      setSaving(false)
    }
  }

  const backup = async () => {
    if (!selected) return
    const res = await api.backupKnowledgeFile(selected.path)
    setStatus(`已备份：${res.backup}`)
  }

  return (
    <div className="knowledge-page">
      <div className="settings-breadcrumb">{meta.breadcrumb}</div>
      <h2 className="settings-title">{meta.title}</h2>
      <div className="knowledge-layout">
        <aside className="knowledge-list">
          <div className="knowledge-list-head">
            <strong>{group?.label || meta.title}</strong>
            <span>{group?.items.length || 0} 个文件</span>
          </div>
          {loading && <div className="knowledge-empty">加载中...</div>}
          {group?.items.map((item) => {
            const st = stats[item.name] || stats[item.path]
            return (
              <button key={item.path} className={`knowledge-item ${selected?.path === item.path ? "is-active" : ""}`} onClick={() => doSelectFile(item)}>
                <span className="knowledge-item-name">{item.name}</span>
                <span className="knowledge-item-path">{item.path}</span>
                <span className="knowledge-item-meta">{formatFileSize(item.size)} · {formatRelativeTime(item.mtime)}{st?.count ? ` · 访问 ${st.count}` : ""}</span>
                {item.readonly && <span className="knowledge-readonly">只读</span>}
              </button>
            )
          })}
          {!loading && !group?.items.length && <div className="knowledge-empty">暂无文件</div>}
        </aside>
        <section className="knowledge-editor">
          {selected ? (
            <>
              <div className="knowledge-editor-head">
                <div>
                  <h3>{selected.name}</h3>
                  <p>{selected.path}</p>
                </div>
                <div className="knowledge-actions">
                  {dirty && <span className="knowledge-dirty">未保存</span>}
                  {selected.readonly && <span className="knowledge-readonly">只读</span>}
                  <div className="knowledge-view-toggle">
                    <button className={viewMode === 'edit' ? 'is-active' : ''} onClick={() => setViewMode('edit')}>编辑</button>
                    <button className={viewMode === 'preview' ? 'is-active' : ''} onClick={() => setViewMode('preview')}>预览</button>
                  </div>
                  <button onClick={() => navigator.clipboard?.writeText(selected.path)}>复制路径</button>
                  <button onClick={backup}>备份</button>
                  <button onClick={() => selected && api.knowledgeFile(selected.path).then((res) => { setContent(res.content); setSavedContent(res.content); setStatus("") })}>重载</button>
                  <button className="prov-btn-primary" disabled={selected.readonly || !dirty || saving} onClick={save}>{saving ? "保存中..." : "保存"}</button>
                </div>
              </div>
              {status && <div className={`knowledge-status ${status.startsWith("❌") ? "is-error" : status.startsWith("⚠") ? "is-warn" : "is-ok"}`}>{status}</div>}
              <div className="knowledge-meta-row">
                <span>大小：{formatFileSize(selected.size)}</span>
                <span>修改：{formatRelativeTime(selected.mtime)}</span>
                {selected.readonly && <span className="knowledge-readonly">只读</span>}
                <span>生效：{section === "prompts" ? "下一轮任务生效" : section === "memory" ? "下一轮读取生效" : "下次文件读取生效"}</span>
              </div>
              {viewMode === 'edit' ? (
                <textarea className="knowledge-textarea" value={content} readOnly={selected.readonly} onChange={(e) => setContent(e.target.value)} spellCheck={false} />
              ) : (
                <div className="knowledge-preview">
                  <MessageRenderer content={content} />
                </div>
              )}
            </>
          ) : (
            <div className="knowledge-empty-state">选择左侧文件进行查看或编辑。</div>
          )}
        </section>
      </div>
    </div>
  )
}

function RuntimePage({ currentLlm, stopRun, running, historyCount }: { currentLlm: string; stopRun: () => Promise<void>; running: boolean; historyCount: number }) {
  const [runtime, setRuntime] = useState<RuntimeResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.runtime()
      setRuntime(res)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load().catch(() => undefined) }, [load])

  const formatDuration = (sec: number) => {
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    return `${h}h ${m}m ${s}s`
  }

  const items = [
    { label: '运行状态', value: runtime ? resolveRunState(running, running ? 'streaming' : 'idle', runtime.running) : (running ? '运行中' : '空闲') },
    { label: '当前模型', value: runtime?.current_llm || currentLlm || '未知' },
    { label: '历史条数', value: String(runtime?.history_count ?? historyCount ?? 0) },
    { label: '活跃 Run', value: String(runtime?.active_runs ?? 0) },
  ]

  return (
    <div className="runtime-page">
      <div className="settings-breadcrumb">实例管理</div>
      <div className="runtime-head">
        <h2 className="settings-title" style={{ margin: 0 }}>运行资源</h2>
        <div className="runtime-actions">
          <button onClick={load}>{loading ? '刷新中...' : '刷新'}</button>
          <button className="danger" disabled={!running} onClick={stopRun}>停止当前任务</button>
        </div>
      </div>

      <div className="runtime-grid">
        {items.map((item) => (
          <div className="runtime-card" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="runtime-grid runtime-grid--wide">
        <div className="runtime-card runtime-card--info">
          <span>进程信息</span>
          <strong>PID {runtime?.pid ?? '—'}</strong>
          <p>运行时长：{runtime ? formatDuration(runtime.uptime_sec) : '—'}</p>
          <p>当前会话：{runtime?.current_session_path || '—'}</p>
        </div>
        <div className="runtime-card runtime-card--info">
          <span>目录占用</span>
          <p>temp：{formatFileSize(runtime?.paths.temp_size || 0)}</p>
          <p>会话日志：{formatFileSize(runtime?.paths.sessions_size || 0)}</p>
          <p>L4 归档：{formatFileSize(runtime?.paths.archives_size || 0)}</p>
        </div>
      </div>

      <div className="runtime-card runtime-runs">
        <span>活跃 Run</span>
        {runtime?.runs.length ? runtime.runs.map((r) => (
          <div className="runtime-run-row" key={r.id}>
            <strong>{r.id.slice(0, 8)}</strong>
            <span>{r.status}</span>
            <small>{r.events} events</small>
          </div>
        )) : <div className="storage-empty">暂无活跃 Run</div>}
      </div>
    </div>
  )
}

function UsagePage() {
  const [items, setItems] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.audit()
      setItems(res.items || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load().catch(() => undefined) }, [load])

  const typeCount = new Set(items.map((x) => x.type)).size

  return (
    <div className="usage-page">
      <div className="settings-breadcrumb">实例管理</div>
      <div className="runtime-head">
        <h2 className="settings-title" style={{ margin: 0 }}>使用历史</h2>
        <div className="runtime-actions">
          <button onClick={load}>{loading ? '刷新中...' : '刷新'}</button>
        </div>
      </div>

      <div className="runtime-grid">
        <div className="runtime-card"><span>最近记录数</span><strong>{items.length}</strong></div>
        <div className="runtime-card"><span>最近一次操作</span><strong>{items[0] ? formatRelativeTime(items[0].ts) : '—'}</strong></div>
        <div className="runtime-card"><span>操作类型数</span><strong>{typeCount}</strong></div>
        <div className="runtime-card"><span>来源</span><strong>WebUI</strong></div>
      </div>

      <div className="usage-list">
        {items.map((item, idx) => (
          <div className="usage-item" key={`${item.ts}-${idx}`}>
            <div className="usage-item-head">
              <strong>{item.title}</strong>
              <span className="usage-type">{item.type}</span>
            </div>
            <div className="usage-detail">{item.detail || '—'}</div>
            <div className="usage-meta">{formatRelativeTime(item.ts)}</div>
          </div>
        ))}
        {!items.length && <div className="storage-empty">暂无使用记录</div>}
      </div>
    </div>
  )
}

function StoragePage() {
  const [groups, setGroups] = useState<StorageGroup[]>([])
  const [totalSize, setTotalSize] = useState(0)
  const [totalFiles, setTotalFiles] = useState(0)
  const [selectedKey, setSelectedKey] = useState('sessions')
  const [detail, setDetail] = useState<StorageDetail | null>(null)
  const [cleanup, setCleanup] = useState<StorageCleanupResult | null>(null)
  const [days, setDays] = useState(7)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [pendingCleanup, setPendingCleanup] = useState<{ mode: string; days: number; preview: StorageCleanupResult } | null>(null)

  const selected = groups.find((g) => g.key === selectedKey)
  const cleanable = selected && selected.cleanup !== 'readonly'
  const detailRequestRef = useRef(0)
  const overviewRequestRef = useRef(0)

  const loadOverview = useCallback(async () => {
    const req = ++overviewRequestRef.current
    setLoading(true)
    const res = await api.storage()
    if (req !== overviewRequestRef.current) return
    setGroups(res.groups)
    setTotalSize(res.total_size)
    setTotalFiles(res.total_files)
    setSelectedKey((current) => res.groups.some((g) => g.key === current) ? current : (res.groups[0]?.key || 'sessions'))
    setLoading(false)
  }, [])

  useEffect(() => { loadOverview().catch(() => setLoading(false)) }, [loadOverview])

  useEffect(() => {
    if (!selectedKey) return
    const req = ++detailRequestRef.current
    setDetailLoading(true)
    api.storageDetail(selectedKey)
      .then((det) => {
        if (req === detailRequestRef.current && det.group.key === selectedKey) setDetail(det)
      })
      .catch(() => undefined)
      .finally(() => {
        if (req === detailRequestRef.current) setDetailLoading(false)
      })
  }, [selectedKey])

  const selectGroup = (key: string) => {
    if (key === selectedKey) return
    setSelectedKey(key)
    setCleanup(null)
  }

  const runCleanup = async (dryRun: boolean, mode = 'older_than_days') => {
    const res = await api.cleanupStorage(selectedKey, { mode, days, dry_run: dryRun })
    setCleanup(res)
    if (dryRun) {
      setPendingCleanup({ mode, days, preview: res })
      return
    }
    setPendingCleanup(null)
    await loadOverview()
  }

  const confirmCleanup = async () => {
    if (!pendingCleanup) return
    const res = await api.cleanupStorage(selectedKey, { mode: pendingCleanup.mode, days: pendingCleanup.days, dry_run: false })
    setCleanup(res)
    setPendingCleanup(null)
    await loadOverview()
  }

  const deleteLargestFile = async (path: string) => {
    await api.deleteStorageFile(path)
    const det = await api.storageDetail(selectedKey)
    setDetail(det)
    await loadOverview()
  }

  const cleanupLabel = (value: StorageGroup['cleanup']) => ({ safe: '安全清理', cautious: '谨慎', manual: '手动', readonly: '只读' }[value])

  return (
    <div className="storage-page">
      <div className="settings-breadcrumb">实例管理</div>
      <h2 className="settings-title">储存空间</h2>
      <div className="storage-stats">
        <div><span>总占用</span><strong>{formatFileSize(totalSize)}</strong></div>
        <div><span>文件数量</span><strong>{totalFiles}</strong></div>
        <div><span>可清理分类</span><strong>{groups.filter((g) => g.cleanup !== 'readonly').length}</strong></div>
        <div><span>最近修改</span><strong>{groups.length ? formatRelativeTime(Math.max(...groups.map((g) => g.mtime || 0))) : '-'}</strong></div>
      </div>

      <div className="storage-layout">
        <aside className="storage-groups">
          {groups.map((g) => (
            <button key={g.key} className={`storage-group-card ${selectedKey === g.key ? 'is-active' : ''}`} onClick={() => selectGroup(g.key)}>
              <span className="storage-group-title">{g.label}</span>
              <span className="storage-group-path">{g.path}</span>
              <span className="storage-group-desc">{g.desc}</span>
              <span className="storage-group-meta">{formatFileSize(g.size)} · {g.files} 文件 · {cleanupLabel(g.cleanup)}</span>
            </button>
          ))}
          {loading && <div className="storage-empty">加载中...</div>}
        </aside>

        <section className="storage-detail">
          {detailLoading && <div className="storage-loading-mask">正在加载...</div>}
          {detail?.group ? (
            <>
              <div className="storage-detail-head">
                <div>
                  <h3>{detail.group.label}</h3>
                  <p>{detail.group.path}</p>
                </div>
                <button onClick={loadOverview}>刷新</button>
              </div>
              <div className="storage-detail-grid">
                <div><span>大小</span><strong>{formatFileSize(detail.group.size)}</strong></div>
                <div><span>文件</span><strong>{detail.group.files}</strong></div>
                <div><span>目录</span><strong>{detail.group.dirs}</strong></div>
                <div><span>策略</span><strong>{cleanupLabel(detail.group.cleanup)}</strong></div>
              </div>

              {cleanable && (
                <div className="storage-cleanup">
                  <div className="storage-cleanup-row">
                    <label>清理超过</label>
                    <input type="number" min={1} value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} />
                    <span>天的文件</span>
                    <button onClick={() => runCleanup(true)}>预览清理</button>
                  </div>
                  {detail.group.key === 'sessions' && <button onClick={() => runCleanup(true, 'snapshots_only')}>预览会话快照清理</button>}
                  {detail.group.key === 'logs' && <button onClick={() => runCleanup(true, 'logs_truncate')}>预览清空日志</button>}
                </div>
              )}

              {pendingCleanup && (
                <div className="storage-cleanup-confirm">
                  <strong>确认清理</strong>
                  <p>将删除 {pendingCleanup.preview.count} 个文件，释放 {formatFileSize(pendingCleanup.preview.size)}。此操作不可撤销。</p>
                  <div className="storage-cleanup-actions">
                    <button onClick={() => setPendingCleanup(null)}>取消</button>
                    <button className="danger" disabled={pendingCleanup.preview.count === 0} onClick={confirmCleanup}>确认执行</button>
                  </div>
                </div>
              )}

              {cleanup && (
                <div className="storage-cleanup-result">
                  <div className="storage-cleanup-summary">
                    <strong>{cleanup.dry_run ? '预览结果' : '清理结果'}</strong>
                    <span>{cleanup.count} 个文件 · {formatFileSize(cleanup.size)} · 错误 {cleanup.errors.length}</span>
                  </div>
                  {cleanup.files.length > 0 && <ul>{cleanup.files.slice(0, 8).map((f) => <li key={f.path}>{f.path} · {formatFileSize(f.size)}</li>)}</ul>}
                </div>
              )}

              <div className="storage-largest">
                <h4>最大文件</h4>
                {detail.largest.length === 0 && <div className="storage-empty">暂无文件</div>}
                {detail.largest.map((f) => (
                  <div key={f.path} className="storage-file-row">
                    <div className="storage-file-main">
                      <span>{f.path}</span>
                      <small>{formatRelativeTime(f.mtime)}</small>
                    </div>
                    <strong>{formatFileSize(f.size)}</strong>
                    <div className="storage-file-actions">
                      <button onClick={() => navigator.clipboard?.writeText(f.path)}>复制路径</button>
                      {detail.group.cleanup !== 'readonly' && <button className="danger" onClick={() => deleteLargestFile(f.path)}>删除</button>}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : <div className="storage-empty">选择左侧分类查看详情。</div>}
        </section>
      </div>
    </div>
  )
}

const AboutPage = () => (
  <div className="appearance-page">
    <div className="settings-breadcrumb">实例管理</div>
    <h2 className="settings-title">关于</h2>

    <section className="settings-section">
      <h3>项目仓库</h3>
      <div className="repo-grid">
        <RepoLinkCard title="GenericAgent WebUI" desc="当前 WebUI 项目仓库，包含 React 前端与 Bottle 后端。" href={WEBUI_REPO_URL} />
        <RepoLinkCard title="GenericAgent" desc="本 WebUI 适配的 GenericAgent 主项目仓库。" href={GENERIC_AGENT_REPO_URL} />
        <RepoLinkCard title="GenericAgent Upstream" desc="上游主仓库，用于提交 PR 和同步官方更新。" href={GENERIC_AGENT_UPSTREAM_URL} />
      </div>
    </section>

    <section className="settings-section">
      <h3>反馈与协议</h3>
      <div className="repo-inline-links">
        <a href={WEBUI_ISSUES_URL} target="_blank" rel="noreferrer">提交 Issue</a>
        <a href={`${WEBUI_REPO_URL}/blob/main/README.md`} target="_blank" rel="noreferrer">README</a>
        <a href={`${WEBUI_REPO_URL}/blob/main/.gitignore`} target="_blank" rel="noreferrer">源码文件</a>
      </div>
    </section>
  </div>
)

const IM_CHANNEL_FIELDS: Record<string, { key: string; label: string; type?: string; placeholder?: string }[]> = {
  feishu: [
    { key: 'fs_app_id', label: 'App ID' },
    { key: 'fs_app_secret', label: 'App Secret', type: 'password' },
    { key: 'fs_allowed_users', label: '允许用户', placeholder: "['*'] 表示允许所有用户" },
  ],
  telegram: [
    { key: 'tg_bot_token', label: 'Bot Token', type: 'password' },
    { key: 'tg_allowed_users', label: '允许用户 ID', placeholder: '[123456789]' },
    { key: 'proxy', label: '代理', placeholder: 'http://127.0.0.1:2082' },
  ],
  qq: [
    { key: 'qq_app_id', label: 'App ID' },
    { key: 'qq_app_secret', label: 'App Secret', type: 'password' },
    { key: 'qq_allowed_users', label: '允许用户', placeholder: "['*']" },
  ],
  wecom: [
    { key: 'wecom_bot_id', label: 'Bot ID' },
    { key: 'wecom_secret', label: 'Secret', type: 'password' },
    { key: 'wecom_allowed_users', label: '允许用户', placeholder: "['*']" },
    { key: 'wecom_welcome_message', label: '欢迎消息' },
  ],
  dingtalk: [
    { key: 'dingtalk_client_id', label: 'Client ID' },
    { key: 'dingtalk_client_secret', label: 'Client Secret', type: 'password' },
    { key: 'dingtalk_allowed_users', label: '允许用户', placeholder: "['*']" },
  ],
}

function SecretEyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M4 20 20 4" />}
    </svg>
  )
}

function ImDetailModal({
  ch,
  status,
  onClose,
  onStart,
  onStop,
  onRestart,
  onTest,
  onToggleAutoRestart,
  onOpenLog,
  onSaveWarning,
  testResult,
  testing,
  operating,
  saveWarning,
}: {
  ch: ImChannel
  status: ImChannelStatus | undefined
  onClose: () => void
  onStart: () => void
  onStop: () => void
  onRestart: () => void
  onTest: () => void
  onToggleAutoRestart: () => void
  onOpenLog: () => void
  onSaveWarning: (key: string, message: string | null) => void
  onClearWarning: () => void
  testResult: { ok: boolean; message: string } | null
  testing: boolean
  operating: string | null
  saveWarning: string | null
}) {
  const [detailTab, setDetailTab] = useState<'config' | 'log'>('config')
  const [inlineLog, setInlineLog] = useState<string>('')
  const [inlineLogLoading, setInlineLogLoading] = useState(false)
  const [inlineLogError, setInlineLogError] = useState<string | null>(null)
  const [inlineLogUpdatedAt, setInlineLogUpdatedAt] = useState<number | null>(null)
  const [inlineLogStickToBottom, setInlineLogStickToBottom] = useState(true)
  const inlineLogRef = useRef<HTMLPreElement | null>(null)
  const [editDraft, setEditDraft] = useState<Record<string, string>>({})

  const [editSecrets, setEditSecrets] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const init: Record<string, string> = {}
    IM_CHANNEL_FIELDS[ch.key]?.forEach((f) => {
      init[f.key] = ch.fields[f.key] || ''
    })
    setEditDraft(init)
    setEditSecrets({})
    setDetailTab('config')
    setFormErrors({})
    setInlineLog('')
    setInlineLogError(null)
    setInlineLogUpdatedAt(null)
    setInlineLogStickToBottom(true)
  }, [ch])

  useEffect(() => {
    if (detailTab !== 'log') return
    let alive = true
    const loadInlineLog = async (initial = false) => {
      const el = inlineLogRef.current
      const prevScrollTop = el?.scrollTop || 0
      const prevScrollHeight = el?.scrollHeight || 0
      const prevClientHeight = el?.clientHeight || 0
      const wasNearBottom = !el || prevScrollHeight - prevScrollTop - prevClientHeight < 32
      if (initial) setInlineLogLoading(true)
      try {
        const res = await api.imLog(ch.key)
        if (!alive) return
        const nextContent = res.content || ''
        const contentChanged = nextContent !== inlineLog
        setInlineLog(nextContent)
        setInlineLogError(null)
        setInlineLogUpdatedAt(Date.now())
        if (contentChanged) {
          requestAnimationFrame(() => {
            const node = inlineLogRef.current
            if (!node) return
            if (wasNearBottom || inlineLogStickToBottom) {
              node.scrollTop = node.scrollHeight
              setInlineLogStickToBottom(true)
            } else {
              const newScrollHeight = node.scrollHeight
              node.scrollTop = Math.max(0, prevScrollTop + (newScrollHeight - prevScrollHeight))
            }
          })
        }
      } catch (e: any) {
        if (!alive) return
        setInlineLog('')
        setInlineLogError(e.message || '日志加载失败')
        setInlineLogUpdatedAt(null)
      } finally {
        if (alive && initial) setInlineLogLoading(false)
      }
    }
    loadInlineLog(true)
    const timer = window.setInterval(() => loadInlineLog(false), 2000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [detailTab, ch.key, inlineLog, inlineLogStickToBottom])

  const canManage = status?.managed && status?.script_exists

  const handleInlineLogScroll = useCallback(() => {
    const el = inlineLogRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 32
    if (nearBottom !== inlineLogStickToBottom) {
      setInlineLogStickToBottom(nearBottom)
    }
  }, [inlineLogStickToBottom])

  const downloadInlineLog = useCallback(() => {
    if (!inlineLog) return
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const blob = new Blob([inlineLog], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `im-log-${ch.key}-${stamp}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [inlineLog, ch.key])

  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const next: Record<string, string> = {}
    IM_CHANNEL_FIELDS[ch.key]?.forEach((f) => {
      if (!f.optional && !editDraft[f.key]?.trim()) {
        next[f.key] = `${f.label} 不能为空`
      }
    })
    setFormErrors(next)
    return Object.keys(next).length === 0
  }

  const saveConfig = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const res = await api.imSaveConfig(ch.key, editDraft)
      onSaveWarning(ch.key, res.warning || null)
      onClose()
      window.location.reload()
    } catch (e: any) {
      alert('保存失败: ' + (e.message || e))
    }
    setSaving(false)
  }

  return (
    <div className="im-detail-modal-backdrop" onClick={onClose}>
      <div className="im-detail-modal" onClick={(e) => e.stopPropagation()}>
        <div className="im-detail-modal-head">
          <div>
            <h3>{ch.name}</h3>
            <div className="im-detail-modal-tags">
              <span className={`im-channel-status ${ch.configured ? 'is-on' : ''}`}>{ch.configured ? '已配置' : '未配置'}</span>
              <span className={`im-runtime-status ${status?.running ? 'is-running' : 'is-stopped'}`}>{status?.running ? '运行中' : '未运行'}</span>
              {status?.auto_restart ? <span className="im-auto-restart-tag">自动恢复</span> : null}
            </div>
          </div>
          <button className="prov-btn-sm" onClick={onClose}>关闭</button>
        </div>

        <div className="im-detail-modal-actions">
          {canManage && !status?.running && (
            <button className="prov-btn-sm prov-btn-primary" onClick={onStart} disabled={operating !== null || !ch.configured}>
              {operating === 'start' ? '启动中...' : '启动'}
            </button>
          )}
          {canManage && status?.running && (
            <>
              <button className="prov-btn-sm prov-btn-outline" onClick={onRestart} disabled={operating !== null}>
                {operating === 'restart' ? '重启中...' : '重启'}
              </button>
              <button className="prov-btn-sm prov-btn-danger" onClick={onStop} disabled={operating !== null}>
                {operating === 'stop' ? '停止中...' : '停止'}
              </button>
            </>
          )}
          {ch.configured && (
            <button className="prov-btn-sm" onClick={onTest} disabled={testing || operating !== null}>
              {testing ? '测试中...' : '测试连接'}
            </button>
          )}
          <button className={`prov-btn-sm ${status?.auto_restart ? 'prov-btn-primary' : ''}`} onClick={onToggleAutoRestart}>
            自动恢复: {status?.auto_restart ? '开' : '关'}
          </button>
        </div>

        {testResult && (
          <div className={`im-test-result ${testResult.ok ? 'is-ok' : 'is-err'}`}>
            {testResult.message}
          </div>
        )}

        {status && (
          <div className="im-detail-meta">
            {status.pid ? <span>PID: {status.pid}</span> : <span>PID: -</span>}
            {status.started_at ? <span>启动时间: {new Date(status.started_at * 1000).toLocaleString()}</span> : null}
            {status.last_exit_code !== null ? <span>退出码: {status.last_exit_code}</span> : null}
            {!status.script_exists ? <span className="is-err">脚本缺失</span> : null}
            {status.message ? <span>{status.message}</span> : null}
          </div>
        )}

        {saveWarning && (
          <div className="im-save-warning">
            <span>配置已保存，但 LLM 重载失败：{saveWarning}</span>
            <button type="button" className="notice-close" onClick={onClearWarning} aria-label="关闭提示">×</button>
          </div>
        )}

        <div className="im-detail-tabs">
          <button className={detailTab === 'config' ? 'is-active' : ''} onClick={() => setDetailTab('config')}>配置</button>
          <button className={detailTab === 'log' ? 'is-active' : ''} onClick={() => setDetailTab('log')}>日志</button>
        </div>

        <div className="im-detail-body">
          {detailTab === 'config' && IM_CHANNEL_FIELDS[ch.key] && (
            <div className="im-detail-config">
                  {IM_CHANNEL_FIELDS[ch.key].map((f) => {
                    const isSecret = f.type === 'password'
                    const revealed = Boolean(editSecrets[f.key])
                    const hasError = Boolean(formErrors[f.key])
                    return (
                      <label key={f.key} className={`im-field ${hasError ? 'is-invalid' : ''}`}>
                        <span>{f.label}</span>
                        <div className={`im-input-wrap ${isSecret ? 'is-secret' : ''}`}>
                          <input
                            type={isSecret && !revealed ? 'password' : 'text'}
                            value={editDraft[f.key] || ''}
                            placeholder={f.placeholder || ''}
                            onChange={(e) => {
                              setEditDraft((prev) => ({ ...prev, [f.key]: e.target.value }))
                              if (hasError) setFormErrors((prev) => { const n = { ...prev }; delete n[f.key]; return n })
                            }}
                          />
                          {isSecret && (
                            <button
                              type="button"
                              className="im-secret-toggle"
                              aria-label={revealed ? '隐藏密钥' : '显示密钥'}
                              title={revealed ? '隐藏' : '显示'}
                              onClick={() => setEditSecrets((prev) => ({ ...prev, [f.key]: !prev[f.key] }))}
                            >
                              <SecretEyeIcon open={revealed} />
                            </button>
                          )}
                        </div>
                        {hasError && <span className="field-error">{formErrors[f.key]}</span>}
                      </label>
                    )
                  })}
              <div className="im-channel-actions">
                <button className="prov-btn-sm" onClick={onClose} disabled={saving}>取消</button>
                <button className="prov-btn-sm prov-btn-primary" onClick={saveConfig} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
              </div>
            </div>
          )}

          {detailTab === 'log' && (
            <div className="im-inline-log-status">
              <div className="im-inline-log-status-text">
                <span className="im-inline-log-live">实时刷新中</span>
                <span className="im-inline-log-time">
                  {inlineLogUpdatedAt ? `最后更新于 ${new Date(inlineLogUpdatedAt).toLocaleTimeString()}` : '等待首次加载'}
                </span>
              </div>
              <button type="button" className="prov-btn-sm" onClick={downloadInlineLog} disabled={!inlineLog}>下载日志</button>
            </div>
          )}

          {detailTab === 'log' && inlineLogLoading ? (
            <div className="im-detail-empty">
              <div className="im-detail-empty-title">日志加载中...</div>
              <div className="im-detail-empty-desc">正在读取该渠道的最新日志内容。</div>
            </div>
          ) : detailTab === 'log' && inlineLogError ? (
            <div className="im-detail-empty is-error">
              <div className="im-detail-empty-title">日志加载失败</div>
              <div className="im-detail-empty-desc">{inlineLogError}</div>
            </div>
          ) : detailTab === 'log' && inlineLog ? (
            <div className="im-detail-log-panel">
              <pre ref={inlineLogRef} onScroll={handleInlineLogScroll} className="im-detail-log">{inlineLog}</pre>
            </div>
          ) : detailTab === 'log' ? (
            <div className="im-detail-empty">
              <div className="im-detail-empty-title">暂无日志</div>
              <div className="im-detail-empty-desc">启动渠道后，这里会显示最近日志摘要。</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function GatewayPage() {
  const [channels, setChannels] = useState<ImChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statuses, setStatuses] = useState<Record<string, ImChannelStatus>>({})
  const [saveWarnings, setSaveWarnings] = useState<Record<string, { message: string; ts: number }>>({})
  const [logViewer, setLogViewer] = useState<{ channel: string; title: string; path: string; content: string; truncated: boolean; loading: boolean; live: boolean } | null>(null)
  const [testResult, setTestResult] = useState<{ key: string; ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [operating, setOperating] = useState<string | null>(null)
  const [detailChannel, setDetailChannel] = useState<string | null>(null)

  useEffect(() => {
    if (!detailChannel) return
    const timer = window.setInterval(() => {
      setSaveWarnings((prev) => {
        const now = Date.now()
        const next: Record<string, { message: string; ts: number }> = {}
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.ts < 6000) next[k] = v
        }
        return next
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [detailChannel])

  const loadStatus = useCallback(async () => {
    try {
      const res = await api.imStatus()
      setStatuses(res.statuses)
    } catch {
      // ignore polling errors
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [configRes, statusRes] = await Promise.all([api.imConfig(), api.imStatus()])
      setChannels(configRes.channels)
      setStatuses(statusRes.statuses)
    } catch (e: any) {
      console.error('加载 IM 配置失败', e)
      setError(e.message || '加载失败')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadStatus()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [loadStatus])

  const test = async (key: string) => {
    setTesting(key)
    setTestResult(null)
    try {
      const res = await api.imTest(key)
      setTestResult({ key, ok: res.ok, message: res.ok ? (res.message || '连接成功') : (res.error || '连接失败') })
    } catch (e: any) {
      setTestResult({ key, ok: false, message: e.message || '请求失败' })
    }
    setTesting(null)
  }

  const runAction = async (key: string, action: 'start' | 'stop' | 'restart') => {
    setOperating(`${action}:${key}`)
    setTestResult(null)
    if (action === 'start') {
      setSaveWarnings((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
    try {
      if (action === 'start') await api.imStart(key)
      else if (action === 'stop') await api.imStop(key)
      else await api.imRestart(key)
      await loadStatus()
    } catch (e: any) {
      setTestResult({ key, ok: false, message: e.message || '操作失败' })
    }
    setOperating(null)
  }

  const toggleAutoRestart = async (key: string, current: boolean) => {
    try {
      await api.imSetAutoRestart(key, !current)
      await loadStatus()
    } catch {
      // ignore
    }
  }

  const openLogViewer = async (key: string, title: string) => {
    setLogViewer({ channel: key, title, path: '', content: '', truncated: false, loading: true, live: true })
    try {
      const res = await api.imLog(key)
      setLogViewer((prev) => prev && prev.channel === key ? { channel: key, title, path: res.log_path, content: res.content, truncated: res.truncated, loading: false, live: true } : prev)
    } catch (e: any) {
      setLogViewer((prev) => prev && prev.channel === key ? { channel: key, title, path: '', content: e.message || '日志加载失败', truncated: false, loading: false, live: true } : prev)
    }
  }

  const refreshLogViewer = async () => {
    if (!logViewer) return
    const key = logViewer.channel
    try {
      const res = await api.imLog(key)
      setLogViewer((prev) => prev && prev.channel === key ? { ...prev, path: res.log_path, content: res.content, truncated: res.truncated, loading: false } : prev)
    } catch {
      // ignore
    }
  }

  const clearLog = async () => {
    if (!logViewer) return
    try {
      await api.imClearLog(logViewer.channel)
      setLogViewer((prev) => prev ? { ...prev, content: '', truncated: false } : null)
    } catch {
      // ignore
    }
  }

  const toggleLive = () => {
    setLogViewer((prev) => prev ? { ...prev, live: !prev.live } : null)
  }

  useEffect(() => {
    if (!logViewer?.live) return
    const timer = window.setInterval(() => {
      refreshLogViewer()
    }, 2000)
    return () => window.clearInterval(timer)
  }, [logViewer?.live, logViewer?.channel])

  const detailCh = detailChannel ? channels.find((c) => c.key === detailChannel) : undefined
  const detailStatus = detailChannel ? statuses[detailChannel] : undefined
  const detailTestResult = testResult?.key === detailChannel ? testResult : null
  const detailOperating = detailChannel && operating?.endsWith(`:${detailChannel}`) ? operating.split(':')[0] : null

  return (
    <div className="appearance-page">
      <div className="settings-breadcrumb">个人设置</div>
      <h2 className="settings-title">IM 网关</h2>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>配置各 IM 渠道接入 GenericAgent。配置保存在 mykey.py 中。</p>

      {loading && <p style={{ color: 'var(--muted)' }}>加载中...</p>}
      {error && <p style={{ color: '#fa5252' }}>错误: {error}</p>}
      {!loading && !error && channels.length === 0 && <p style={{ color: 'var(--muted)' }}>暂无渠道数据</p>}

      <div className="im-channel-grid">
        {channels.map((ch) => {
          const status = statuses[ch.key]
          return (
            <div
              key={ch.key}
              className={`im-channel-card ${ch.configured ? 'is-configured' : ''}`}
              onClick={() => setDetailChannel(ch.key)}
              style={{ cursor: 'pointer' }}
            >
              <div className="im-channel-head">
                <div>
                  <strong>{ch.name}</strong>
                  <span className={`im-channel-status ${ch.configured ? 'is-on' : ''}`}>{ch.configured ? '已配置' : '未配置'}</span>
                  <span className={`im-runtime-status ${status?.running ? 'is-running' : 'is-stopped'}`}>{status?.running ? '运行中' : '未运行'}</span>
                </div>
                <button className="prov-btn-sm" onClick={(e) => { e.stopPropagation(); setDetailChannel(ch.key) }}>详情</button>
              </div>
            </div>
          )
        })}
      </div>

      {detailCh && (
        <ImDetailModal
          ch={detailCh}
          status={detailStatus}
          onClose={() => {
            setDetailChannel(null)
            setTestResult(null)
          }}
          onStart={() => runAction(detailCh.key, 'start')}
          onStop={() => runAction(detailCh.key, 'stop')}
          onRestart={() => runAction(detailCh.key, 'restart')}
          onTest={() => test(detailCh.key)}
          onToggleAutoRestart={() => toggleAutoRestart(detailCh.key, Boolean(detailStatus?.auto_restart))}
          onOpenLog={() => {}}
          onSaveWarning={(key, message) => setSaveWarnings((prev) => {
            const next = { ...prev }
            if (message) next[key] = { message, ts: Date.now() }
            else delete next[key]
            return next
          })}
          testResult={detailTestResult}
          testing={testing === detailCh.key}
          operating={detailOperating}
          saveWarning={saveWarnings[detailCh.key]?.message || null}
          onClearWarning={() => setSaveWarnings((prev) => {
            const next = { ...prev }
            delete next[detailCh.key]
            return next
          })}
        />
      )}

      {logViewer && (
        <div className="im-log-modal-backdrop" onClick={() => setLogViewer(null)}>
          <div className="im-log-modal" onClick={(e) => e.stopPropagation()}>
            <div className="im-log-modal-head">
              <div>
                <h3>{logViewer.title} 日志 {logViewer.live ? <span className="im-log-live-tag">实时刷新中</span> : <span className="im-log-paused-tag">已暂停</span>}</h3>
                <div className="im-log-modal-path">{logViewer.path || '暂无日志路径'}</div>
              </div>
              <div className="im-log-modal-actions">
                <button className="prov-btn-sm" onClick={toggleLive}>{logViewer.live ? '暂停' : '恢复'}</button>
                <button className="prov-btn-sm" onClick={refreshLogViewer} disabled={logViewer.loading || logViewer.live}>刷新</button>
                <button className="prov-btn-sm prov-btn-danger" onClick={clearLog}>清空日志</button>
                <button className="prov-btn-sm" onClick={() => setLogViewer(null)}>关闭</button>
              </div>
            </div>
            {logViewer.truncated && <div className="im-log-modal-tip">当前仅显示最近一部分日志内容。</div>}
            <pre className="im-log-modal-body">{logViewer.loading ? '日志加载中...' : (logViewer.content || '暂无日志内容')}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState<Page>("settings")
  const [settingsSection, setSettingsSection] = useState("appearance")
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "欢迎使用 GenericAgent。请输入任务开始协作。" },
  ])
  const [prompt, setPrompt] = useState("")
  const [busy, setBusy] = useState(false)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)
  const [streamStatus, setStreamStatus] = useState<'idle' | 'connecting' | 'streaming' | 'done' | 'error'>('idle')
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number | null>(null)
  const [contextMenu, setContextMenu] = useState<null | { x: number; y: number; type: 'session' | 'message'; sessionIndex?: number; messageIndex?: number }>(null)
  const [sessionSearch, setSessionSearch] = useState("")
  const [slashIndex, setSlashIndex] = useState(0)
  const slashMenuRef = useRef<HTMLDivElement | null>(null)
  const chatListRef = useRef<HTMLDivElement | null>(null)

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchIndex, setSearchIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem("ga_theme") as Theme) || "light")
  const [oled, setOled] = useState(() => localStorage.getItem("ga_oled") === "true")
  const [fullscreen, setFullscreen] = useState(() => localStorage.getItem("ga_fullscreen") === "true")
  const [keepAwake, setKeepAwake] = useState(() => localStorage.getItem("ga_keepAwake") === "true")
  const [advancedAnim, setAdvancedAnim] = useState(() => localStorage.getItem("ga_advancedAnim") !== "false")
  const [wrapMarkdown, setWrapMarkdown] = useState(() => localStorage.getItem("ga_wrapMarkdown") !== "false")
  const [wrapCode, setWrapCode] = useState(() => localStorage.getItem("ga_wrapCode") !== "false")
  const [wrapDiff, setWrapDiff] = useState(() => localStorage.getItem("ga_wrapDiff") !== "false")
  const [sendMode, setSendMode] = useState(() => localStorage.getItem("ga_sendMode") || "enter")
  const wakeLockRef = useRef<any>(null)

  useEffect(() => {
    const root = document.documentElement
    const resolved = theme === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : theme

    root.dataset.theme = oled && resolved === "dark" ? "darker" : resolved

    localStorage.setItem("ga_theme", theme)
    localStorage.setItem("ga_oled", String(oled))
    localStorage.setItem("ga_fullscreen", String(fullscreen))
    localStorage.setItem("ga_keepAwake", String(keepAwake))
    localStorage.setItem("ga_advancedAnim", String(advancedAnim))
    localStorage.setItem("ga_wrapMarkdown", String(wrapMarkdown))
    localStorage.setItem("ga_wrapCode", String(wrapCode))
    localStorage.setItem("ga_wrapDiff", String(wrapDiff))
    localStorage.setItem("ga_sendMode", sendMode)
  }, [theme, oled, fullscreen, keepAwake, advancedAnim, wrapMarkdown, wrapCode, wrapDiff, sendMode])

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener("fullscreenchange", onFullscreenChange)
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange)
  }, [])

  useEffect(() => {
    const isFs = Boolean(document.fullscreenElement)
    if (fullscreen === isFs) return

    const run = async () => {
      try {
        if (fullscreen && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen?.()
        } else if (!fullscreen && document.fullscreenElement) {
          await document.exitFullscreen?.()
        }
      } catch {
        setFullscreen(Boolean(document.fullscreenElement))
      }
    }

    run()
  }, [fullscreen])

  useEffect(() => {
    let cancelled = false

    const releaseWakeLock = async () => {
      try {
        await wakeLockRef.current?.release?.()
      } catch {
        // ignore release errors
      } finally {
        wakeLockRef.current = null
      }
    }

    const requestWakeLock = async () => {
      if (!keepAwake || document.visibilityState !== "visible") {
        await releaseWakeLock()
        return
      }

      try {
        const wakeLockApi = (navigator as any).wakeLock
        if (!wakeLockApi?.request) return
        if (!wakeLockRef.current) {
          wakeLockRef.current = await wakeLockApi.request("screen")
          wakeLockRef.current?.addEventListener?.("release", () => {
            wakeLockRef.current = null
          })
        }
      } catch {
        if (!cancelled) setKeepAwake(false)
      }
    }

    const onVisibilityChange = () => {
      requestWakeLock()
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    requestWakeLock()

    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibilityChange)
      releaseWakeLock()
    }
  }, [keepAwake])

  const refresh = async () => {
    const [s, ss] = await Promise.all([
      api.status(),
      api.sessions().catch(() => ({ ok: true, sessions: [] as SessionItem[] })),
    ])
    setStatus(s)
    setSessions(ss.sessions)
  }

  useEffect(() => {
    refresh().catch(() => undefined)
    const timer = window.setInterval(() => refresh().catch(() => undefined), 5000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const el = chatListRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages, streamStatus])

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const send = async () => {
    const text = prompt.trim()
    if (!text || busy) return

    setBusy(true)
    setStreamStatus('connecting')
    setSelectedSessionIndex(null)
    setMessages((prev) => [
      ...prev,
      { role: "user", content: text, createdAt: Date.now(), status: 'done' },
      { role: "assistant", content: "正在连接...", createdAt: Date.now(), status: 'streaming' },
    ])
    setPrompt("")

    try {
      const { run_id } = await api.send(text)
      setActiveRunId(run_id)
      const es = api.eventSource(run_id)
      let buffer = ""

      es.addEventListener("ready", () => {
        setStreamStatus('streaming')
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = { ...next[next.length - 1], content: "等待模型响应...", status: 'streaming' }
          return next
        })
      })

      es.addEventListener("chunk", (e) => {
        const data = JSON.parse((e as MessageEvent).data)
        buffer = data.content || buffer
        setStreamStatus('streaming')
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = { role: "assistant", content: `${buffer} ▌`, createdAt: next[next.length - 1]?.createdAt || Date.now(), status: 'streaming' }
          return next
        })
      })

      es.addEventListener("done", (e) => {
        const data = JSON.parse((e as MessageEvent).data)
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = { role: "assistant", content: data.content || buffer || "已完成", createdAt: next[next.length - 1]?.createdAt || Date.now(), status: 'done' }
          return next
        })
        es.close()
        setBusy(false)
        setActiveRunId(null)
        setStreamStatus('done')
        refresh().catch(() => undefined)
      })

      es.onerror = () => {
        es.close()
        setBusy(false)
        setActiveRunId(null)
        setStreamStatus('error')
        setMessages((prev) => {
          const next = [...prev]
          if (next[next.length - 1]?.role === 'assistant' && next[next.length - 1]?.status === 'streaming') {
            next[next.length - 1] = { ...next[next.length - 1], content: buffer || '连接中断', status: 'error' }
          }
          return next
        })
      }
    } catch (err: any) {
      setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: `错误：${err.message || err}`, createdAt: Date.now(), status: 'error' }])
      setBusy(false)
      setActiveRunId(null)
      setStreamStatus('error')
    }
  }

  const stopRun = async () => {
    await api.abort()
    setBusy(false)
    setActiveRunId(null)
    setStreamStatus('idle')
    setMessages((prev) => prev.map((m, i) => i === prev.length - 1 && m.status === 'streaming' ? { ...m, content: m.content.replace(/\s*▌$/, ''), status: 'done' } : m))
    refresh().catch(() => undefined)
  }

  const startNewChat = async () => {
    const res = await api.newChat()
    setMessages([{ role: "assistant", content: normalizeNewChatMessage(res.message), createdAt: Date.now(), status: 'done' }])
    setPrompt("")
    setBusy(false)
    setActiveRunId(null)
    setSelectedSessionIndex(null)
    setStreamStatus('idle')
    await refresh()
  }

  const openSession = async (index: number) => {
    const res = await api.continueSession(index)
    setMessages(
      res.history?.length
        ? res.history.map((m) => ({ ...m, status: 'done' as const, createdAt: Date.now() }))
        : [{ role: "system", content: normalizeSystemMessage(res.message), createdAt: Date.now(), status: 'done' }]
    )
    setSelectedSessionIndex(index)
    setPage("session")
    setStreamStatus('idle')
    await refresh()
  }

  const deleteSession = async (index: number) => {
    await api.deleteSession(index)
    if (selectedSessionIndex === index) {
      setSelectedSessionIndex(null)
      setMessages([{ role: "assistant", content: "该历史会话已删除。", createdAt: Date.now(), status: 'done' }])
    }
    setContextMenu(null)
    refresh().catch(() => undefined)
  }

  const rollbackToMessage = async (messageIndex: number) => {
    const kept = messages.slice(0, messageIndex + 1)
    const backendKeep = kept.filter((m) => {
      if (m.role === 'system') return false
      if (m.role === 'assistant' && (m.content.startsWith('欢迎使用') || m.content.startsWith('已开启新对话'))) return false
      return true
    }).length
    await api.rollback(backendKeep)
    setMessages(kept.map((m) => ({ ...m, status: m.status === 'streaming' ? 'done' : m.status })))
    setBusy(false)
    setActiveRunId(null)
    setStreamStatus('idle')
    setContextMenu(null)
    refresh().catch(() => undefined)
  }

  const openContextMenu = (e: React.MouseEvent, menu: Omit<NonNullable<typeof contextMenu>, 'x' | 'y'>) => {
    e.preventDefault()
    setContextMenu({ ...menu, x: e.clientX, y: e.clientY })
  }

  const switchModel = async (index: number) => {
    await api.switchLlm(index)
    await refresh()
  }

  const addSystemMessage = (content: string) => {
    setMessages((prev) => [...prev, { role: "system", content: normalizeSystemMessage(content), createdAt: Date.now(), status: 'done' }])
  }

  const executeSlashCommand = async (raw: string): Promise<boolean> => {
    const text = raw.trim()
    const [cmd, arg] = text.split(/\s+/, 2)
    const op = cmd.toLowerCase()

    if (op === "/help") {
      addSystemMessage(`## 命令列表\n\n${slashCommands.map((c) => `- ${c.name} — ${c.desc}`).join("\n")}`)
      setPrompt("")
      return true
    }
    if (op === "/status") {
      addSystemMessage(`> 系统命令执行成功\n\n状态：${busy || status?.running ? "运行中" : "空闲"}\n\n当前模型：${currentLlm}\n\n历史条数：${status?.history_count ?? 0}`)
      setPrompt("")
      return true
    }
    if (op === "/stop" || op === "/abort") {
      await stopRun()
      addSystemMessage("> 系统命令执行成功\n\n已发送停止信号。")
      setPrompt("")
      return true
    }
    if (op === "/new") {
      await startNewChat()
      return true
    }
    if (op === "/continue") {
      if (arg && /^\d+$/.test(arg)) {
        await openSession(Number(arg))
      } else {
        addSystemMessage(`> 会话命令提示\n\n## 可恢复会话\n\n${sessions.length ? sessions.map((s) => `${s.index}. ${s.rounds} 轮 · ${formatRelativeTime(s.mtime)} · ${s.preview || "未命名会话"}`).join("\n") : "暂无可恢复会话"}`)
      }
      setPrompt("")
      return true
    }
    if (op === "/llm") {
      if (arg && /^\d+$/.test(arg)) {
        await switchModel(Number(arg))
        addSystemMessage(`> 模型命令执行成功\n\n已切换到模型 ${arg}。`)
      } else {
        addSystemMessage(`> 模型命令提示\n\n## LLM 列表\n\n${(status?.llms || []).map((llm) => `${llm.current ? "→" : " "} [${llm.index}] ${llm.name}`).join("\n")}`)
      }
      setPrompt("")
      return true
    }
    if (op === "/restore") {
      addSystemMessage("> 会话命令提示\n\nWebUI 中请优先使用左侧历史会话列表，或输入 `/continue` 查看可恢复会话。")
      setPrompt("")
      return true
    }
    return false
  }

  const completeSlashCommand = (cmd: SlashCommand) => {
    setPrompt(cmd.insert)
    setSlashIndex(0)
  }

  const currentLlm = useMemo(
    () => status?.llms?.find((x) => x.current)?.name ?? status?.llm_name ?? "未知",
    [status]
  )

  const filteredSessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase()
    const ordered = [...sessions].sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)) || b.mtime - a.mtime)
    if (!query) return ordered
    return ordered.filter((s) => [s.preview, s.path, `${s.rounds}`].some((v) => String(v || '').toLowerCase().includes(query)))
  }, [sessions, sessionSearch])

  const filteredSlashCommands = useMemo(() => {
    if (!prompt.startsWith("/")) return []
    const trimmed = prompt.trimStart()
    const head = trimmed.split(/\s+/)[0].toLowerCase()
    const argPart = trimmed.slice(head.length).trim()
    if (head === '/llm' && argPart.length === 0) {
      return (status?.llms || []).map((llm) => ({
        name: `/llm ${llm.index}`,
        insert: `/llm ${llm.index}`,
        desc: llm.name,
        kind: 'local' as const,
        group: '模型' as const,
      }))
    }
    if (head === '/continue' && argPart.length === 0) {
      return sessions.slice(0, 8).map((s) => ({
        name: `/continue ${s.index}`,
        insert: `/continue ${s.index}`,
        desc: `${s.rounds} 轮 · ${s.preview || '未命名会话'}`,
        kind: 'local' as const,
        group: '会话' as const,
      }))
    }
    return slashCommands.filter((cmd) => cmd.name.toLowerCase().startsWith(head) || cmd.insert.toLowerCase().startsWith(head)).slice(0, 8)
  }, [prompt, status?.llms, sessions])

  const slashOpen = filteredSlashCommands.length > 0 && prompt.startsWith("/") && !busy

  useEffect(() => {
    setSlashIndex(0)
  }, [prompt])

  useEffect(() => {
    if (!slashOpen) return
    const container = slashMenuRef.current
    if (!container) return
    const active = container.querySelector('.slash-item.is-active') as HTMLElement | null
    if (!active) return
    const top = active.offsetTop
    const bottom = top + active.offsetHeight
    if (top < container.scrollTop) {
      container.scrollTop = top - 4
    } else if (bottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = bottom - container.clientHeight + 4
    }
  }, [slashIndex, slashOpen])

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    const items: { type: string; title: string; subtitle: string; action: () => void }[] = []
    sessions.forEach((s) => {
      if ([s.preview, s.path, `${s.rounds}`].some((v) => String(v || '').toLowerCase().includes(q))) {
        items.push({ type: 'session', title: s.preview || '未命名会话', subtitle: `${s.rounds} 轮 · ${formatRelativeTime(s.mtime)}`, action: () => { openSession(s.index); setSearchOpen(false) } })
      }
    })
    ;[...personalSettings, ...instanceSettings].forEach((s) => {
      if ([s.label, s.key].some((v) => String(v || '').toLowerCase().includes(q))) {
        items.push({ type: 'setting', title: s.label, subtitle: '设置', action: () => { setPage('settings'); setSettingsSection(s.key); setSearchOpen(false) } })
      }
    })
    return items.slice(0, 12)
  }, [searchQuery, sessions])

  useEffect(() => {
    setSearchIndex(0)
  }, [searchQuery])

  useEffect(() => {
    if (!searchOpen) return
    const el = searchInputRef.current
    if (el) el.focus()
  }, [searchOpen])

  const Toggle = ({ checked, onChange, title, desc }: { checked: boolean; onChange: () => void; title: string; desc?: string }) => (
    <label className="nf-switch-row">
      <span className={`nf-switch ${checked ? "is-on" : ""}`}>
        <input type="checkbox" checked={checked} onChange={onChange} />
        <span className="nf-switch-track"><span className="nf-switch-thumb" /></span>
      </span>
      <span className="nf-switch-copy">
        <span className="nf-switch-title">{title}</span>
        {desc && <span className="nf-switch-desc">{desc}</span>}
      </span>
    </label>
  )

  const Segmented = ({ options, value, onChange }: { options: { label: string; value: string }[]; value: string; onChange: (v: string) => void }) => (
    <div className="nf-segmented">
      {options.map((opt) => (
        <button
          type="button"
          key={opt.value}
          className={`nf-seg-item ${value === opt.value ? "is-active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">GenericAgent</div>
        <div className="topbar-right">
          <span className="topbar-version">{status?.running ? "运行中" : "空闲"}</span>
          <a className="topbar-action" href={WEBUI_ISSUES_URL} target="_blank" rel="noreferrer" title="提交 Issue">GitHub</a>
          <div className="topbar-search" onClick={() => { setSearchOpen(true); setSearchQuery('') }}>
            <input placeholder="搜索会话与消息..." readOnly />
            <span>⌕</span>
          </div>
        </div>
      </header>

      <aside className="primary-nav">
        <div className="primary-nav-scroll">
          {mainNavItems.map((item) => (
            <button
              key={item.label}
              className={`primary-nav-item ${item.page && page === item.page ? "is-active" : ""}`}
              onClick={() => item.page && setPage(item.page)}
            >
              <span className="primary-nav-icon"><NavIcon name={item.icon} /></span>
              <span>{item.label}</span>
            </button>
          ))}

        </div>

        <div className="primary-nav-bottom">
          <button className={`primary-nav-item ${page === "settings" ? "is-active" : ""}`} onClick={() => setPage("settings")}>
            <span className="primary-nav-icon"><NavIcon name="settings" /></span>
            <span>设置</span>
          </button>
          <button className="primary-nav-item">
            <span className="primary-nav-icon"><NavIcon name="logout" /></span>
            <span>退出登录</span>
          </button>
          <div className="version-line">v0.1.0 · <a href={WEBUI_REPO_URL} target="_blank" rel="noreferrer">GitHub</a> · <a href={`${WEBUI_REPO_URL}/blob/main/README.md`} target="_blank" rel="noreferrer">开源协议</a></div>
        </div>
      </aside>

      <main className="main-shell">
        {page === "settings" && (
          <div className="settings-shell">
            <aside className="settings-nav">
              <div className="settings-nav-group">
                {personalSettings[0]?.group && <div className="settings-nav-heading">{personalSettings[0].group}</div>}
                {personalSettings.map((item) => (
                  <button type="button" key={item.key} className={`settings-nav-item ${settingsSection === item.key ? "is-active" : ""}`} onClick={() => setSettingsSection(item.key)}>
                    <span className="settings-nav-icon"><NavIcon name={item.icon} /></span><span>{item.label}</span>
                  </button>
                ))}
              </div>
              <div className="settings-nav-group">
                {instanceSettings[0]?.group && <div className="settings-nav-heading">{instanceSettings[0].group}</div>}
                {instanceSettings.map((item) => (
                  <button type="button" key={item.key} className={`settings-nav-item ${settingsSection === item.key ? "is-active" : ""}`} onClick={() => setSettingsSection(item.key)}>
                    <span className="settings-nav-icon"><NavIcon name={item.icon} /></span><span>{item.label}</span>
                  </button>
                ))}
              </div>
            </aside>
            <main className="settings-main">
              <SettingsPanel active={settingsSection === "providers"}><ProvidersPage currentLlm={currentLlm} /></SettingsPanel>
              <SettingsPanel active={settingsSection === "storage"}><StoragePage /></SettingsPanel>
              <SettingsPanel active={settingsSection === "runtime"}><RuntimePage currentLlm={currentLlm} stopRun={stopRun} running={busy || Boolean(status?.running)} historyCount={status?.history_count ?? 0} /></SettingsPanel>
              <SettingsPanel active={settingsSection === "usage"}><UsagePage /></SettingsPanel>
              <SettingsPanel active={settingsSection === "prompts"}><KnowledgePage section="prompts" /></SettingsPanel>
              <SettingsPanel active={settingsSection === "memory"}><KnowledgePage section="memory" /></SettingsPanel>
              <SettingsPanel active={settingsSection === "sop"}><KnowledgePage section="sop" /></SettingsPanel>
              <SettingsPanel active={settingsSection === "skills-settings"}><KnowledgePage section="skills-settings" /></SettingsPanel>
              <SettingsPanel active={settingsSection === "about"}><AboutPage /></SettingsPanel>
              <SettingsPanel active={settingsSection === "appearance"}>
                <div className="appearance-page">
                  <div className="settings-breadcrumb">个人设置</div>
                  <h2 className="settings-title">外观与界面</h2>

                  <section className="settings-section">
                    <h3>主题</h3>
                    <Segmented
                      value={theme}
                      onChange={(v) => setTheme(v as Theme)}
                      options={[
                        { label: "浅色", value: "light" },
                        { label: "深色", value: "dark" },
                        { label: "跟随系统", value: "system" },
                      ]}
                    />
                    <Toggle checked={oled} onChange={() => setOled(!oled)} title="OLED 纯黑" desc="深色模式下使用纯黑背景，适配 AMOLED 屏幕节能并减少拖影" />
                  </section>

                  <section className="settings-section">
                    <h3>显示</h3>
                    <Toggle checked={fullscreen} onChange={() => setFullscreen(!fullscreen)} title="全屏模式" desc="隐藏系统状态栏，应用占满整个屏幕。关闭后显示状态栏。" />
                    <Toggle checked={keepAwake} onChange={() => setKeepAwake(!keepAwake)} title="屏幕常亮" desc="GenericAgent 打开时阻止屏幕变暗或锁定" />
                    <Toggle checked={advancedAnim} onChange={() => setAdvancedAnim(!advancedAnim)} title="高级动画" desc="为新出现的用户消息、工具调用卡片和推理卡片启用 blur-in 动画" />
                  </section>

                  <section className="settings-section">
                    <h3>自动换行</h3>
                    <Toggle checked={wrapMarkdown} onChange={() => setWrapMarkdown(!wrapMarkdown)} title="Markdown" />
                    <Toggle checked={wrapCode} onChange={() => setWrapCode(!wrapCode)} title="代码" />
                    <Toggle checked={wrapDiff} onChange={() => setWrapDiff(!wrapDiff)} title="Diff" />
                  </section>

                  <section className="settings-section">
                    <h3>输入</h3>
                    <div className="settings-field">
                      <span>发送方式</span>
                      <p>选择聊天输入框中发送消息的方式</p>
                      <Segmented
                        value={sendMode}
                        onChange={setSendMode}
                        options={[
                          { label: "Enter 发送", value: "enter" },
                          { label: "Ctrl+Enter 发送", value: "ctrl-enter" },
                        ]}
                      />
                    </div>
                  </section>
                </div>
              </SettingsPanel>
              <SettingsPanel active={settingsSection === "gateway"}><GatewayPage /></SettingsPanel>

              {[...personalSettings, ...instanceSettings]
                .filter((item) => !["providers", "storage", "runtime", "usage", "prompts", "memory", "sop", "skills-settings", "about", "appearance", "gateway"].includes(item.key))
                .map((item) => (
                  <SettingsPanel key={item.key} active={settingsSection === item.key}>
                    <div className="settings-placeholder">
                      <h2>{item.label}</h2>
                      <p>该设置页先作为 Narra 风格占位，后续可接入 GenericAgent 对应配置。</p>
                    </div>
                  </SettingsPanel>
                ))}
            </main>
          </div>
        )}

        {page === "dashboard" && (
          <div className="dashboard-page">
            <h1>欢迎使用 GenericAgent</h1>
            <p>AI 驱动的协作编程工作台。</p>
            <div className="dashboard-cards">
              <div className="dashboard-card"><span>运行状态</span><strong>{status?.running ? "运行中" : "空闲"}</strong></div>
              <div className="dashboard-card"><span>历史会话</span><strong>{sessions.length}</strong></div>
              <div className="dashboard-card"><span>当前模型</span><strong>{currentLlm}</strong></div>
            </div>
          </div>
        )}

        {page === "session" && (
          <div className="session-layout">
            <aside className="conversation-sidebar">
              <div className="conversation-side-head">
                <button className="conv-new-btn" onClick={startNewChat}>+ 新对话</button>
                <div className="conv-side-meta">
                  <span className={`status-dot ${busy || status?.running ? "is-running" : ""}`} />
                  <span>{resolveRunState(busy, streamStatus, status?.running)}</span>
                </div>
              </div>
              <div className="conv-section-title">历史会话</div>
              <div className="conversation-history-search">
                <input value={sessionSearch} onChange={(e) => setSessionSearch(e.target.value)} placeholder="搜索会话、轮数或路径..." />
              </div>
              <div className="conversation-history-list">
                {filteredSessions.map((s) => (
                  <button key={s.path} className={`conversation-history-item ${selectedSessionIndex === s.index ? "is-active" : ""}`} onClick={() => openSession(s.index)} onContextMenu={(e) => openContextMenu(e, { type: 'session', sessionIndex: s.index })}>
                    <span className="history-preview">{s.preview || "未命名会话"}</span>
                    <span className="history-meta">{s.rounds} 轮 · {formatRelativeTime(s.mtime)}</span>
                    <span className="history-tags">{s.current ? <span className="history-tag is-current">当前会话</span> : <span className="history-tag">历史</span>}</span>
                  </button>
                ))}
                {filteredSessions.length === 0 && <div className="history-empty">没有匹配的会话</div>}
              </div>
            </aside>

            <section className="conversation-main">
              <header className="conversation-header">
                <div className="conversation-title-block">
                  <div className="section-eyebrow">会话</div>
                  <h2>GA 协作对话</h2>
                </div>
                <div className="conversation-toolbar">
                  <span className={`stream-pill is-${streamStatus}`}><span className={`status-dot ${busy ? "is-running" : ""}`} />{resolveRunState(busy, streamStatus, status?.running)}</span>
                  <select className="model-select" value={status?.llm_no ?? 0} onChange={(e) => switchModel(Number(e.target.value))} disabled={busy}>
                    {(status?.llms || []).map((llm) => <option key={llm.index} value={llm.index}>{llm.name}</option>)}
                  </select>
                  <button onClick={refresh}>刷新</button>
                  <button onClick={stopRun} disabled={!busy && !status?.running} className="danger">停止</button>
                </div>
              </header>

              <div ref={chatListRef} className={`chat-list conversation-chat-list${wrapMarkdown ? " wrap-markdown" : ""}${wrapCode ? " wrap-code" : ""}${wrapDiff ? " wrap-diff" : ""}`}>
                {messages.length === 0 ? (
                  <div className="chat-empty-state">
                    <h3>开始一次 GenericAgent 协作</h3>
                    <p>输入任务、恢复历史会话，或切换模型后继续。</p>
                    <div className="chat-empty-actions">
                      <button onClick={startNewChat}>新对话</button>
                      <button onClick={refresh}>刷新历史</button>
                    </div>
                  </div>
                ) : messages.map((m, i) => (
                  <div key={`${m.role}-${i}-${m.createdAt || 0}`} className={`message message--${m.role} ${m.role === 'system' ? `message--system-${getSystemMessageTone(m.content)}` : ''} ${m.status === 'error' ? 'is-error' : ''} ${m.status === 'streaming' ? 'is-streaming' : ''}`} onContextMenu={(e) => openContextMenu(e, { type: 'message', messageIndex: i })}>
                    <div className="message__avatar">{m.role === "user" ? "我" : m.role === "assistant" ? "GA" : "·"}</div>
                    <div className="message__body">
                      <div className="message__meta">
                        <span className="message__role">{m.role === 'user' ? '用户输入' : m.role === 'assistant' ? 'Agent 输出' : '系统提示'}</span>
                        <span className="message__time">{m.createdAt ? new Date(m.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                      <MessageRenderer content={m.content} />
                      {m.status && <span className="message-status">{m.status === 'streaming' ? '推理中' : m.status === 'error' ? '错误' : m.status === 'done' ? '已完成' : ''}</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="composer composer-card">
                {slashOpen && (
                  <div className="slash-menu" ref={slashMenuRef}>
                    {Array.from(new Map(filteredSlashCommands.map((cmd) => [cmd.group, cmd.group])).values()).map((group) => (
                      <div key={group} className="slash-group">
                        <div className="slash-group-title">{group}</div>
                        {filteredSlashCommands.filter((cmd) => cmd.group === group).map((cmd) => {
                          const globalIndex = filteredSlashCommands.findIndex((x) => x === cmd)
                          return (
                            <button
                              key={cmd.name + cmd.insert}
                              type="button"
                              className={`slash-item ${globalIndex === slashIndex ? "is-active" : ""}`}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                completeSlashCommand(cmd)
                              }}
                            >
                              <span className="slash-command-name">{cmd.name}</span>
                              <span className="slash-command-desc">{cmd.desc}</span>
                              <span className={`slash-command-kind is-${cmd.kind}`}>{cmd.kind === "local" ? "WebUI" : cmd.kind === "agent" ? "Agent" : "提示"}</span>
                            </button>
                          )
                        })}
                      </div>
                    ))}
                    <div className="slash-footer">↑↓ 选择 · Tab 补全 · Enter 执行</div>
                  </div>
                )}
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="输入消息，描述你想让 GenericAgent 完成的任务..."
                  rows={3}
                  disabled={busy}
                  onKeyDown={async (e) => {
                    if (slashOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
                      e.preventDefault()
                      e.stopPropagation()
                      setSlashIndex((prev) => {
                        const next = e.key === "ArrowDown" ? prev + 1 : prev - 1
                        return (next + filteredSlashCommands.length) % filteredSlashCommands.length
                      })
                      return
                    }
                    if (slashOpen && e.key === "Tab") {
                      e.preventDefault()
                      completeSlashCommand(filteredSlashCommands[slashIndex] || filteredSlashCommands[0])
                      return
                    }
                    if (slashOpen && e.key === "Enter") {
                      e.preventDefault()
                      completeSlashCommand(filteredSlashCommands[slashIndex] || filteredSlashCommands[0])
                      return
                    }
                    if (e.key === "Enter" && !e.shiftKey && sendMode === "enter") {
                      e.preventDefault()
                      if (prompt.trim().startsWith("/") && await executeSlashCommand(prompt)) return
                      send()
                    } else if (e.key === "Enter" && e.ctrlKey && sendMode === "ctrl-enter") {
                      e.preventDefault()
                      if (prompt.trim().startsWith("/") && await executeSlashCommand(prompt)) return
                      send()
                    }
                  }}
                />
                <div className="composer__bar">
                  <div className="composer__hints">
                    <span className="hint">{sendMode === "enter" ? "Enter 发送 · Shift+Enter 换行" : "Ctrl+Enter 发送 · Enter 换行"}</span>
                    {activeRunId && <span className="hint">Run: {activeRunId.slice(0, 8)}</span>}
                  </div>
                  <div className="composer__actions">
                    <button onClick={() => setPrompt("")} disabled={!prompt || busy}>清空</button>
                    {busy ? <button onClick={stopRun} className="danger">中断</button> : <button onClick={send} disabled={!prompt.trim()} className="primary">发送</button>}
                  </div>
                </div>
              </div>
            </section>

            <aside className="conversation-inspector">
              <div className="inspector-card">
                <div className="inspector-title">当前状态</div>
                <div className="inspector-row"><span>模型</span><strong>{currentLlm}</strong></div>
                <div className="inspector-row"><span>运行</span><strong>{resolveRunState(busy, streamStatus, status?.running)}</strong></div>
                <div className="inspector-row"><span>Run ID</span><strong>{activeRunId ? activeRunId.slice(0, 8) : '—'}</strong></div>
                <div className="inspector-row"><span>消息</span><strong>{messages.length}</strong></div>
                <div className="inspector-row"><span>历史</span><strong>{status?.history_count ?? 0}</strong></div>
              </div>
              <div className="inspector-card">
                <div className="inspector-title">快捷操作</div>
                <button onClick={startNewChat}>新对话</button>
                <button onClick={refresh}>刷新状态</button>
                <button onClick={stopRun} disabled={!busy && !status?.running}>停止当前任务</button>
              </div>
            </aside>
          </div>
        )}
      </main>

      {contextMenu && (
        <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(e) => e.stopPropagation()}>
          {contextMenu.type === 'session' && contextMenu.sessionIndex && (
            <>
              <button onClick={() => { openSession(contextMenu.sessionIndex!); setContextMenu(null) }}>打开对话</button>
              <button className="is-danger" onClick={() => deleteSession(contextMenu.sessionIndex!)}>删除对话</button>
            </>
          )}
          {contextMenu.type === 'message' && contextMenu.messageIndex !== undefined && (
            <>
              <button onClick={() => rollbackToMessage(contextMenu.messageIndex!)}>回退到此处</button>
              <button onClick={() => { setMessages(messages.slice(0, contextMenu.messageIndex! + 1)); setContextMenu(null) }}>仅收起后续消息</button>
            </>
          )}
        </div>
      )}

      {searchOpen && (
        <div className="cmd-palette-overlay" onClick={() => setSearchOpen(false)}>
          <div className="cmd-palette" onClick={(e) => e.stopPropagation()}>
            <div className="cmd-palette-input">
              <span>⌕</span>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索会话、设置..."
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setSearchIndex((prev) => (prev + 1) % Math.max(searchResults.length, 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setSearchIndex((prev) => (prev - 1 + Math.max(searchResults.length, 1)) % Math.max(searchResults.length, 1))
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    const item = searchResults[searchIndex]
                    if (item) { item.action(); setSearchOpen(false) }
                  } else if (e.key === 'Escape') {
                    setSearchOpen(false)
                  }
                }}
              />
              <kbd>Ctrl K</kbd>
            </div>
            {searchResults.length > 0 && (
              <div className="cmd-palette-results">
                {searchResults.map((r, i) => (
                  <button
                    key={`${r.type}-${i}`}
                    className={`cmd-item ${i === searchIndex ? 'is-active' : ''}`}
                    onMouseEnter={() => setSearchIndex(i)}
                    onClick={() => { r.action(); setSearchOpen(false) }}
                  >
                    <span className="cmd-item-type">{r.type === 'session' ? '会话' : '设置'}</span>
                    <span className="cmd-item-title">{r.title}</span>
                    <span className="cmd-item-subtitle">{r.subtitle}</span>
                  </button>
                ))}
              </div>
            )}
            {searchQuery.trim() && searchResults.length === 0 && (
              <div className="cmd-palette-empty">未找到匹配结果</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
