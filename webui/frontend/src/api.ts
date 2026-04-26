export type StatusResponse = {
  ok: boolean
  running: boolean
  llm_no: number
  llm_name: string
  llms: { index: number; name: string; current: boolean }[]
  history_count: number
}

export type SessionItem = {
  index: number
  path: string
  mtime: number
  preview: string
  rounds: number
  current?: boolean
}

export type ChatMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
  id?: string
  createdAt?: number
  status?: 'sending' | 'streaming' | 'done' | 'error'
}

export type CurrentResponse = StatusResponse & {
  message_count: number
  history: string[]
}

export type KnowledgeItem = {
  id: string
  name: string
  path: string
  size: number
  mtime: number
  readonly: boolean
  desc?: string
}

export type KnowledgeGroup = {
  key: string
  label: string
  items: KnowledgeItem[]
}

export type KnowledgeFile = {
  ok: boolean
  path: string
  content: string
  size: number
  mtime: number
}

export type StorageGroup = {
  key: string
  label: string
  path: string
  size: number
  files: number
  dirs: number
  mtime: number
  cleanup: 'safe' | 'cautious' | 'manual' | 'readonly'
  desc: string
}

export type StorageFile = {
  path: string
  name: string
  size: number
  mtime: number
}

export type StorageDetail = {
  ok: boolean
  group: StorageGroup
  largest: StorageFile[]
}

export type StorageCleanupResult = {
  ok: boolean
  dry_run: boolean
  count: number
  size: number
  files: StorageFile[]
  deleted: string[]
  errors: { path: string; error: string }[]
}

export type Provider = {
  key: string
  name: string
  type: string
  apikey: string
  apibase: string
  model: string
  api_mode: string
  reasoning_effort: string
  max_retries: number
  connect_timeout: number
  read_timeout: number
  stream: boolean
  thinking_type: string
  context_win: number
}

export type RuntimeResponse = {
  ok: boolean
  pid: number
  uptime_sec: number
  running: boolean
  current_llm: string
  current_llm_no: number
  history_count: number
  active_runs: number
  current_session_path: string
  paths: { temp_size: number; sessions_size: number; archives_size: number }
  runs: { id: string; status: string; events: number }[]
}

export type AuditItem = {
  ts: number
  type: string
  title: string
  detail: string
  meta: Record<string, any>
}

export type ImChannel = {
  key: string
  name: string
  configured: boolean
  fields: Record<string, string>
  note?: string
}

export type ImConfigResponse = {
  ok: boolean
  channels: ImChannel[]
}

export type ImChannelStatus = {
  key: string
  managed: boolean
  script_exists: boolean
  running: boolean
  pid: number | null
  started_at: number | null
  last_exit_code: number | null
  log_path: string
  log_tail: string[]
  message: string
}

export type ImStatusResponse = {
  ok: boolean
  statuses: Record<string, ImChannelStatus>
}

export type ImLogResponse = {
  ok: boolean
  channel: string
  log_path: string
  exists: boolean
  content: string
  truncated: boolean
}

const API_BASE = 'http://127.0.0.1:18765'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const data = await res.json()
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || '请求失败')
  }
  return data as T
}

export const api = {
  status: () => request<StatusResponse>('/api/status'),
  current: () => request<CurrentResponse>('/api/current'),
  sessions: () => request<{ ok: boolean; sessions: SessionItem[] }>('/api/sessions'),
  deleteSession: (index: number) => request<{ ok: boolean }>(`/api/sessions/${index}`, { method: 'DELETE' }),
  rollback: (keepMessages: number) => request<{ ok: boolean; keep_messages: number }>('/api/rollback', { method: 'POST', body: JSON.stringify({ keep_messages: keepMessages }) }),
  newChat: () => request<{ ok: boolean; message: string }>('/api/new', { method: 'POST', body: '{}' }),
  abort: () => request<{ ok: boolean }>('/api/abort', { method: 'POST', body: '{}' }),
  send: (prompt: string) => request<{ ok: boolean; run_id: string }>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  }),
  switchLlm: (index: number) => request<StatusResponse>('/api/llm', {
    method: 'POST',
    body: JSON.stringify({ index }),
  }),
  continueSession: (index: number) => request<{ ok: boolean; message: string; history: ChatMessage[] }>('/api/continue', {
    method: 'POST',
    body: JSON.stringify({ index }),
  }),
  eventSource: (runId: string) => new EventSource(`${API_BASE}/api/runs/${runId}/events`),
  providers: () => request<{ ok: boolean; providers: Provider[] }>('/api/providers'),
  updateProvider: (key: string, data: Partial<Provider> & { apikey?: string }) =>
    request<{ ok: boolean }>(`/api/providers/${key}`, { method: 'PUT', body: JSON.stringify(data) }),
  addProvider: (data: Partial<Provider> & { apikey?: string }) =>
    request<{ ok: boolean; key: string }>('/api/providers', { method: 'POST', body: JSON.stringify(data) }),
  deleteProvider: (key: string) =>
    request<{ ok: boolean }>(`/api/providers/${key}`, { method: 'DELETE' }),
  providerModels: (key: string) =>
    request<{ ok: boolean; models: string[] }>(`/api/providers/${key}/models`, { method: 'POST', body: '{}' }),
  providerTest: (key: string) =>
    request<{ ok: boolean; message?: string; error?: string; elapsed_ms?: number }>(`/api/providers/${key}/test`, { method: 'POST', body: '{}' }),
  reload: () => request<{ ok: boolean; llms: { index: number; name: string; current: boolean }[] }>('/api/reload', { method: 'POST', body: '{}' }),
  runtime: () => request<RuntimeResponse>('/api/runtime'),
  audit: () => request<{ ok: boolean; items: AuditItem[] }>('/api/audit'),
  knowledge: () => request<{ ok: boolean; groups: KnowledgeGroup[] }>('/api/knowledge'),
  knowledgeFile: (path: string) => request<KnowledgeFile>(`/api/knowledge/file?path=${encodeURIComponent(path)}`),
  saveKnowledgeFile: (path: string, content: string) => request<{ ok: boolean; backup: string; size: number; mtime: number }>('/api/knowledge/file', {
    method: 'PUT',
    body: JSON.stringify({ path, content }),
  }),
  backupKnowledgeFile: (path: string) => request<{ ok: boolean; backup: string }>('/api/knowledge/backup', {
    method: 'POST',
    body: JSON.stringify({ path }),
  }),
  memoryStats: () => request<{ ok: boolean; stats: Record<string, { count?: number; last?: string }> }>('/api/knowledge/memory-stats'),
  storage: () => request<{ ok: boolean; total_size: number; total_files: number; groups: StorageGroup[] }>('/api/storage'),
  storageDetail: (key: string) => request<StorageDetail>(`/api/storage/${encodeURIComponent(key)}`),
  cleanupStorage: (key: string, payload: { mode: string; days?: number; dry_run?: boolean }) => request<StorageCleanupResult>(`/api/storage/${encodeURIComponent(key)}/cleanup`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  deleteStorageFile: (path: string) => request<{ ok: boolean; path: string; size: number }>(`/api/storage/file?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  }),
  imConfig: () => request<ImConfigResponse>('/api/im/config'),
  imStatus: () => request<ImStatusResponse>('/api/im/status'),
  imSaveConfig: (channel: string, fields: Record<string, string>) =>
    request<{ ok: boolean }>('/api/im/config', {
      method: 'POST',
      body: JSON.stringify({ channel, fields }),
    }),
  imStart: (channel: string) =>
    request<{ ok: boolean; status: ImChannelStatus }>(`/api/im/start/${encodeURIComponent(channel)}`, {
      method: 'POST',
      body: '{}',
    }),
  imStop: (channel: string) =>
    request<{ ok: boolean; status: ImChannelStatus }>(`/api/im/stop/${encodeURIComponent(channel)}`, {
      method: 'POST',
      body: '{}',
    }),
  imRestart: (channel: string) =>
    request<{ ok: boolean; status: ImChannelStatus }>(`/api/im/restart/${encodeURIComponent(channel)}`, {
      method: 'POST',
      body: '{}',
    }),
  imLog: (channel: string, lines = 200, chars = 20000) =>
    request<ImLogResponse>(`/api/im/log/${encodeURIComponent(channel)}?lines=${lines}&chars=${chars}`),
  imTest: (channel: string) =>
    request<{ ok: boolean; message?: string; error?: string }>(`/api/im/test/${encodeURIComponent(channel)}`, {
      method: 'POST',
      body: '{}',
    }),
}
