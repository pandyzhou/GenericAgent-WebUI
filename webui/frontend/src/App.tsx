import React, { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { api, SessionItem, StatusResponse, Provider, ChatMessage, KnowledgeGroup, KnowledgeItem } from "./api"
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

const personalSettings: SettingsItem[] = [
  { label: "个人资料", key: "profile", icon: "profile", group: "个人设置" },
  { label: "通知", key: "notifications", icon: "notifications" },
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
  { label: "技能", icon: "skills" },
  { label: "工作区", icon: "workspace" },
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

const ProvidersPage = () => {
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Provider> & { apikey?: string }>({})
  const [adding, setAdding] = useState(false)
  const [modelsList, setModelsList] = useState<string[]>([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [testLoading, setTestLoading] = useState(false)

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
    setModelsList([])
    setTestResult(null)
    setAdding(false)
  }

  const startAdd = () => {
    setAdding(true)
    setEditingKey(null)
    setDraft({ type: "oai", name: "", apikey: "", apibase: "", model: "", api_mode: "chat_completions" })
    setModelsList([])
    setTestResult(null)
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setAdding(false)
    setDraft({})
    setModelsList([])
    setTestResult(null)
  }

  const saveEdit = async () => {
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
    cancelEdit()
    await loadProviders()
  }

  const deleteProvider = async (key: string) => {
    await api.deleteProvider(key)
    if (editingKey === key) cancelEdit()
    await loadProviders()
  }

  const fetchModels = async (key: string) => {
    setModelsLoading(true)
    setModelsList([])
    try {
      const res = await api.providerModels(key)
      if (res.ok && res.models) setModelsList(res.models)
      else setModelsList([])
    } catch { setModelsList([]) }
    setModelsLoading(false)
  }

  const testConnection = async (key: string) => {
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await api.providerTest(key)
      setTestResult({ ok: res.ok, msg: res.ok ? "连接成功" : (res.error || "连接失败") })
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message || "连接失败" })
    }
    setTestLoading(false)
  }

  const EditForm = ({ providerKey }: { providerKey: string | null }) => (
    <div className="prov-edit-form">
      <div className="prov-edit-grid">
        <label>名称<input value={draft.name || ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>类型
          <select value={draft.type || "oai"} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
            <option value="oai">OAI 兼容</option>
            <option value="native_claude">Native Claude</option>
            <option value="native_oai">Native OAI</option>
            <option value="claude">Claude</option>
          </select>
        </label>
        <label>API Key<input type="password" placeholder={adding ? "输入 API Key" : "留空则不修改"} value={draft.apikey || ""} onChange={(e) => setDraft({ ...draft, apikey: e.target.value })} /></label>
        <label>API Base URL<input value={draft.apibase || ""} onChange={(e) => setDraft({ ...draft, apibase: e.target.value })} /></label>
        <label className="prov-model-field">
          模型
          <div className="prov-model-row">
            {modelsList.length > 0 ? (
              <select value={draft.model || ""} onChange={(e) => setDraft({ ...draft, model: e.target.value })}>
                <option value="">选择模型...</option>
                {modelsList.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            ) : (
              <input value={draft.model || ""} onChange={(e) => setDraft({ ...draft, model: e.target.value })} />
            )}
            {providerKey && (
              <button type="button" className="prov-btn-sm" disabled={modelsLoading} onClick={() => fetchModels(providerKey)}>
                {modelsLoading ? "获取中..." : "获取模型列表"}
              </button>
            )}
          </div>
        </label>
        {(draft.type === "oai" || draft.type === "native_oai") && (
          <label>API Mode
            <select value={draft.api_mode || "chat_completions"} onChange={(e) => setDraft({ ...draft, api_mode: e.target.value })}>
              <option value="chat_completions">chat_completions</option>
              <option value="responses">responses</option>
            </select>
          </label>
        )}
        <label>Reasoning Effort
          <select value={draft.reasoning_effort || ""} onChange={(e) => setDraft({ ...draft, reasoning_effort: e.target.value })}>
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
          <button type="button" className={`prov-btn-sm ${testLoading ? "" : "prov-btn-outline"}`} disabled={testLoading} onClick={() => testConnection(providerKey)}>
            {testLoading ? "测试中..." : "测试连接"}
          </button>
        )}
        {testResult && <span className={`prov-test-result ${testResult.ok ? "is-ok" : "is-err"}`}>{testResult.msg}</span>}
        <span style={{ flex: 1 }} />
        <button type="button" className="prov-btn-sm" onClick={cancelEdit}>取消</button>
        <button type="button" className="prov-btn-sm prov-btn-primary" onClick={saveEdit}>保存</button>
      </div>
    </div>
  )

  return (
    <div className="appearance-page">
      <div className="settings-breadcrumb">实例管理</div>
      <div className="prov-header">
        <h2 className="settings-title" style={{ margin: 0 }}>提供商</h2>
        <button type="button" className="prov-btn prov-btn-primary" onClick={startAdd}>+ 添加提供商</button>
      </div>

      {loading && <p style={{ color: "var(--muted)" }}>加载中...</p>}

      {adding && <div className="prov-card prov-card-editing"><div className="prov-card-head"><span className="prov-card-name">新建提供商</span></div><EditForm providerKey={null} /></div>}

      {providers.map((p) => {
        const modelLines = [p.model].filter(Boolean)
        const meta = [p.apibase, p.api_mode, p.apikey].filter(Boolean)
        return (
          <div key={p.key} className={`prov-card ${editingKey === p.key ? "prov-card-editing" : ""}`}>
            <div className="prov-card-head">
              <div className="prov-card-main" onClick={() => editingKey === p.key ? cancelEdit() : startEdit(p)}>
                <div className="prov-title-row">
                  <span className="prov-card-name">{p.name || p.key}</span>
                  <span className="prov-card-type">{TYPE_LABELS[p.type] || p.type}</span>
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
            {editingKey === p.key && <EditForm providerKey={p.key} />}
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
  streaming: "生成中",
  done: "已完成",
  error: "出错",
}

type SlashCommand = {
  name: string
  insert: string
  desc: string
  kind: "local" | "agent" | "limited"
}

const slashCommands: SlashCommand[] = [
  { name: "/help", insert: "/help", desc: "显示命令帮助", kind: "local" },
  { name: "/status", insert: "/status", desc: "查看当前运行状态和模型", kind: "local" },
  { name: "/stop", insert: "/stop", desc: "停止当前任务", kind: "local" },
  { name: "/new", insert: "/new", desc: "开启新对话并清空上下文", kind: "local" },
  { name: "/restore", insert: "/restore", desc: "恢复上次对话历史（WebUI 中建议使用历史列表）", kind: "limited" },
  { name: "/continue", insert: "/continue", desc: "列出可恢复会话", kind: "local" },
  { name: "/continue [n]", insert: "/continue ", desc: "恢复第 n 个会话", kind: "local" },
  { name: "/llm", insert: "/llm", desc: "查看模型列表", kind: "local" },
  { name: "/llm [n]", insert: "/llm ", desc: "切换到第 n 个模型", kind: "local" },
  { name: "/resume", insert: "/resume", desc: "让 Agent 从最近历史中总结并恢复", kind: "agent" },
  { name: "/session.<key>=<value>", insert: "/session.", desc: "设置当前 LLM session 属性", kind: "agent" },
]

const formatFileSize = (size: number) => {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

const knowledgeSectionMap: Record<string, { group: string; title: string; breadcrumb: string }> = {
  prompts: { group: "prompts", title: "系统提示词", breadcrumb: "实例管理" },
  memory: { group: "memory", title: "记忆", breadcrumb: "实例管理" },
  sop: { group: "sop", title: "SOP", breadcrumb: "实例管理" },
  "skills-settings": { group: "skills", title: "技能", breadcrumb: "实例管理" },
}

function KnowledgePage({ section }: { section: string }) {
  const meta = knowledgeSectionMap[section] || knowledgeSectionMap.prompts
  const [groups, setGroups] = useState<KnowledgeGroup[]>([])
  const [stats, setStats] = useState<Record<string, { count?: number; last?: string }>>({})
  const [selected, setSelected] = useState<KnowledgeItem | null>(null)
  const [content, setContent] = useState("")
  const [savedContent, setSavedContent] = useState("")
  const [status, setStatus] = useState("")
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    if (!selected) {
      setContent("")
      setSavedContent("")
      return
    }
    api.knowledgeFile(selected.path).then((res) => {
      setContent(res.content)
      setSavedContent(res.content)
      setStatus("")
    }).catch((e) => setStatus(e.message || String(e)))
  }, [selected?.path])

  const group = groups.find((g) => g.key === meta.group)
  const dirty = content !== savedContent

  const save = async () => {
    if (!selected || selected.readonly) return
    const res = await api.saveKnowledgeFile(selected.path, content)
    setSavedContent(content)
    setStatus(`已保存，备份：${res.backup}`)
    await load()
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
              <button key={item.path} className={`knowledge-item ${selected?.path === item.path ? "is-active" : ""}`} onClick={() => setSelected(item)}>
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
                  <button onClick={() => navigator.clipboard?.writeText(selected.path)}>复制路径</button>
                  <button onClick={backup}>备份</button>
                  <button onClick={() => selected && api.knowledgeFile(selected.path).then((res) => { setContent(res.content); setSavedContent(res.content) })}>重载</button>
                  <button className="prov-btn-primary" disabled={selected.readonly || !dirty} onClick={save}>保存</button>
                </div>
              </div>
              {status && <div className="knowledge-status">{status}</div>}
              <textarea className="knowledge-textarea" value={content} readOnly={selected.readonly} onChange={(e) => setContent(e.target.value)} spellCheck={false} />
            </>
          ) : (
            <div className="knowledge-empty-state">选择左侧文件进行查看或编辑。</div>
          )}
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
  const [slashIndex, setSlashIndex] = useState(0)
  const chatListRef = useRef<HTMLDivElement | null>(null)

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
    setMessages([{ role: "assistant", content: res.message || "已开启新对话", createdAt: Date.now(), status: 'done' }])
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
        : [{ role: "system", content: res.message, createdAt: Date.now(), status: 'done' }]
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
    setMessages((prev) => [...prev, { role: "system", content, createdAt: Date.now(), status: 'done' }])
  }

  const executeSlashCommand = async (raw: string): Promise<boolean> => {
    const text = raw.trim()
    const [cmd, arg] = text.split(/\s+/, 2)
    const op = cmd.toLowerCase()

    if (op === "/help") {
      addSystemMessage(`## 命令列表\n\n${slashCommands.map((c) => `- \`${c.name}\` — ${c.desc}`).join("\n")}`)
      setPrompt("")
      return true
    }
    if (op === "/status") {
      addSystemMessage(`状态：${busy || status?.running ? "运行中" : "空闲"}\n\n当前模型：\`${currentLlm}\`\n\n历史条数：${status?.history_count ?? 0}`)
      setPrompt("")
      return true
    }
    if (op === "/stop" || op === "/abort") {
      await stopRun()
      addSystemMessage("已发送停止信号。")
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
        addSystemMessage(`## 可恢复会话\n\n${sessions.length ? sessions.map((s) => `${s.index}. ${s.rounds} 轮 · ${formatRelativeTime(s.mtime)} · ${s.preview || "未命名会话"}`).join("\n") : "暂无可恢复会话"}`)
      }
      setPrompt("")
      return true
    }
    if (op === "/llm") {
      if (arg && /^\d+$/.test(arg)) {
        await switchModel(Number(arg))
        addSystemMessage(`已切换到模型 ${arg}。`)
      } else {
        addSystemMessage(`## LLM 列表\n\n${(status?.llms || []).map((llm) => `${llm.current ? "→" : " "} [${llm.index}] ${llm.name}`).join("\n")}`)
      }
      setPrompt("")
      return true
    }
    if (op === "/restore") {
      addSystemMessage("WebUI 中请优先使用左侧历史会话列表，或输入 `/continue` 查看可恢复会话。")
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

  const filteredSlashCommands = useMemo(() => {
    if (!prompt.startsWith("/")) return []
    const head = prompt.trimStart().split(/\s+/)[0].toLowerCase()
    return slashCommands.filter((cmd) => cmd.name.toLowerCase().startsWith(head) || cmd.insert.toLowerCase().startsWith(head)).slice(0, 8)
  }, [prompt])

  const slashOpen = filteredSlashCommands.length > 0 && prompt.startsWith("/") && !busy

  useEffect(() => {
    setSlashIndex(0)
  }, [prompt])

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
          <div className="topbar-search">
            <input placeholder="搜索会话与消息..." />
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
              {settingsSection === "providers" && <ProvidersPage />}
              {knowledgeSectionMap[settingsSection] && <KnowledgePage section={settingsSection} />}
              {settingsSection === "about" && <AboutPage />}
              {settingsSection === "appearance" && (
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
              )}
              {settingsSection !== "providers" && !knowledgeSectionMap[settingsSection] && settingsSection !== "about" && settingsSection !== "appearance" && (() => {
                const label = [...personalSettings, ...instanceSettings].find((item) => item.key === settingsSection)?.label
                return (
                  <div className="settings-placeholder">
                    <h2>{label}</h2>
                    <p>该设置页先作为 Narra 风格占位，后续可接入 GenericAgent 对应配置。</p>
                  </div>
                )
              })()}
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
                  <span>{busy ? streamStatusText[streamStatus] : status?.running ? "运行中" : "空闲"}</span>
                </div>
              </div>
              <div className="conv-section-title">历史会话</div>
              <div className="conversation-history-list">
                {sessions.map((s) => (
                  <button key={s.path} className={`conversation-history-item ${selectedSessionIndex === s.index ? "is-active" : ""}`} onClick={() => openSession(s.index)} onContextMenu={(e) => openContextMenu(e, { type: 'session', sessionIndex: s.index })}>
                    <span className="history-preview">{s.preview || "未命名会话"}{s.current ? " · 当前" : ""}</span>
                    <span className="history-meta">{s.rounds} 轮 · {formatRelativeTime(s.mtime)}</span>
                  </button>
                ))}
                {sessions.length === 0 && <div className="history-empty">暂无历史会话</div>}
              </div>
            </aside>

            <section className="conversation-main">
              <header className="conversation-header">
                <div className="conversation-title-block">
                  <div className="section-eyebrow">会话</div>
                  <h2>GA 协作对话</h2>
                </div>
                <div className="conversation-toolbar">
                  <span className={`stream-pill is-${streamStatus}`}><span className={`status-dot ${busy ? "is-running" : ""}`} />{streamStatusText[streamStatus]}</span>
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
                  <div key={`${m.role}-${i}-${m.createdAt || 0}`} className={`message message--${m.role} ${m.status === 'error' ? 'is-error' : ''} ${m.status === 'streaming' ? 'is-streaming' : ''}`} onContextMenu={(e) => openContextMenu(e, { type: 'message', messageIndex: i })}>
                    <div className="message__avatar">{m.role === "user" ? "我" : m.role === "assistant" ? "GA" : "·"}</div>
                    <div className="message__body">
                      <MessageRenderer content={m.content} />
                      {m.status && <span className="message-status">{m.status === 'streaming' ? '生成中' : m.status === 'error' ? '错误' : ''}</span>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="composer composer-card">
                {slashOpen && (
                  <div className="slash-menu">
                    {filteredSlashCommands.map((cmd, idx) => (
                      <button
                        key={cmd.name}
                        type="button"
                        className={`slash-item ${idx === slashIndex ? "is-active" : ""}`}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          completeSlashCommand(cmd)
                        }}
                      >
                        <span className="slash-command-name">{cmd.name}</span>
                        <span className="slash-command-desc">{cmd.desc}</span>
                        <span className={`slash-command-kind is-${cmd.kind}`}>{cmd.kind === "local" ? "WebUI" : cmd.kind === "agent" ? "Agent" : "提示"}</span>
                      </button>
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
                <div className="inspector-row"><span>运行</span><strong>{busy ? streamStatusText[streamStatus] : status?.running ? "运行中" : "空闲"}</strong></div>
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
    </div>
  )
}
