import React, { useEffect, useMemo, useRef, useState } from "react"
import { api, SessionItem, StatusResponse } from "./api"
import "./styles/app.css"

type Message = { role: "user" | "assistant" | "system"; content: string }
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
  | "about"

type SettingsItem = {
  label: string
  key: string
  icon: IconName
  group?: string
}

const personalSettings: SettingsItem[] = [
  { label: "个人资料", key: "profile", icon: "profile", group: "个人设置" },
  { label: "模型", key: "models", icon: "models" },
  { label: "AI 代理", key: "agent", icon: "agent" },
  { label: "通知", key: "notifications", icon: "notifications" },
  { label: "外观与界面", key: "appearance", icon: "appearance" },
  { label: "IM 网关", key: "gateway", icon: "gateway" },
]

const instanceSettings: SettingsItem[] = [
  { label: "提供商", key: "providers", icon: "providers", group: "实例管理" },
  { label: "章节与容器", key: "chapters", icon: "chapters" },
  { label: "服务器与系统", key: "server", icon: "server" },
  { label: "用户管理", key: "users", icon: "users" },
  { label: "终端管理", key: "terminals", icon: "terminals" },
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
    case "about":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 10h.01M11 14h2v4h-2z" /></svg>
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>
  }
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

  const send = async () => {
    const text = prompt.trim()
    if (!text || busy) return

    setBusy(true)
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "..." }])
    setPrompt("")

    try {
      const { run_id } = await api.send(text)
      const es = api.eventSource(run_id)
      let buffer = ""

      es.addEventListener("chunk", (e) => {
        const data = JSON.parse((e as MessageEvent).data)
        buffer = data.content || buffer
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = { role: "assistant", content: `${buffer} ▌` }
          return next
        })
      })

      es.addEventListener("done", (e) => {
        const data = JSON.parse((e as MessageEvent).data)
        setMessages((prev) => {
          const next = [...prev]
          next[next.length - 1] = { role: "assistant", content: data.content || buffer }
          return next
        })
        es.close()
        setBusy(false)
        refresh().catch(() => undefined)
      })

      es.onerror = () => {
        es.close()
        setBusy(false)
      }
    } catch (err: any) {
      setMessages((prev) => [...prev.slice(0, -1), { role: "assistant", content: `错误：${err.message || err}` }])
      setBusy(false)
    }
  }

  const currentLlm = useMemo(
    () => status?.llms?.find((x) => x.current)?.name ?? status?.llm_name ?? "未知",
    [status]
  )

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

  const SettingsNav = () => (
    <aside className="settings-nav">
      <SettingsGroup items={personalSettings} />
      <SettingsGroup items={instanceSettings} />
    </aside>
  )

  const SettingsGroup = ({ items }: { items: SettingsItem[] }) => (
    <div className="settings-nav-group">
      {items[0]?.group && <div className="settings-nav-heading">{items[0].group}</div>}
      {items.map((item) => (
        <button
          type="button"
          key={item.key}
          className={`settings-nav-item ${settingsSection === item.key ? "is-active" : ""}`}
          onClick={() => setSettingsSection(item.key)}
        >
          <span className="settings-nav-icon"><NavIcon name={item.icon} /></span>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )

  const SettingsContent = () => {
    if (settingsSection !== "appearance") {
      const label = [...personalSettings, ...instanceSettings].find((item) => item.key === settingsSection)?.label
      return (
        <div className="settings-placeholder">
          <h2>{label}</h2>
          <p>该设置页先作为 Narra 风格占位，后续可接入 GenericAgent 对应配置。</p>
        </div>
      )
    }

    return (
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
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">GenericAgent</div>
        <div className="topbar-right">
          <span className="topbar-version">{status?.running ? "运行中" : "空闲"}</span>
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

          <div className="nav-block-title">最近会话</div>
          <div className="recent-list">
            {sessions.slice(0, 5).map((s) => (
              <button
                key={s.path}
                className="recent-item"
                onClick={async () => {
                  const res = await api.continueSession(s.index)
                  setMessages(
                    res.history?.length
                      ? (res.history as Message[])
                      : [{ role: "system", content: res.message }]
                  )
                  setPage("session")
                }}
              >
                <span>{s.preview || "未命名会话"}</span>
                <small>{s.rounds} 轮</small>
              </button>
            ))}
            {sessions.length === 0 && <div className="recent-empty">暂无会话</div>}
          </div>
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
          <div className="version-line">v0.1.0</div>
        </div>
      </aside>

      <main className="main-shell">
        {page === "settings" && (
          <div className="settings-shell">
            <SettingsNav />
            <main className="settings-main"><SettingsContent /></main>
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
          <div className="session-page">
            <header className="chat-header">
              <div className="chat-header__left">
                <button className="icon-btn" onClick={() => setPage("dashboard")}>←</button>
                <div>
                  <div className="section-eyebrow">会话</div>
                  <h2>GA 协作对话</h2>
                </div>
              </div>
              <div className="chat-header__right">
                <span className={`status-dot ${status?.running ? "is-running" : ""}`} />
                <span className="badge">{currentLlm}</span>
                <button onClick={() => api.newChat().then(() => setMessages([{ role: "assistant", content: "已开启新对话" }]))}>新对话</button>
                <button onClick={() => api.abort()}>停止</button>
              </div>
            </header>

            <div className={`chat-list${wrapMarkdown ? " wrap-markdown" : ""}${wrapCode ? " wrap-code" : ""}${wrapDiff ? " wrap-diff" : ""}`}>
              {messages.map((m, i) => (
                <div key={i} className={`message message--${m.role}`}>
                  <div className="message__avatar">{m.role === "user" ? "我" : m.role === "assistant" ? "GA" : "·"}</div>
                  <div className="message__body"><pre>{m.content}</pre></div>
                </div>
              ))}
            </div>

            <div className="composer">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="输入消息..."
                rows={3}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && sendMode === "enter") {
                    e.preventDefault()
                    send()
                  } else if (e.key === "Enter" && e.ctrlKey && sendMode === "ctrl-enter") {
                    e.preventDefault()
                    send()
                  }
                }}
              />
              <div className="composer__bar">
                <div className="composer__hints">
                  <span className="hint">{sendMode === "enter" ? "Enter 发送 · Shift+Enter 换行" : "Ctrl+Enter 发送 · Enter 换行"}</span>
                </div>
                <div className="composer__actions">
                  {busy ? <button onClick={() => api.abort()} className="danger">中断</button> : <button onClick={send} disabled={!prompt.trim()} className="primary">发送</button>}
                  <button onClick={refresh}>刷新</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
