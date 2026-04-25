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
    request<{ ok: boolean; message?: string; error?: string }>(`/api/providers/${key}/test`, { method: 'POST', body: '{}' }),
  reload: () => request<{ ok: boolean; llms: { index: number; name: string; current: boolean }[] }>('/api/reload', { method: 'POST', body: '{}' }),
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
}
