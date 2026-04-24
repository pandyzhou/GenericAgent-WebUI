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
  sessions: () => request<{ ok: boolean; sessions: SessionItem[] }>('/api/sessions'),
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
  continueSession: (index: number) => request<{ ok: boolean; message: string; history: { role: string; content: string }[] }>('/api/continue', {
    method: 'POST',
    body: JSON.stringify({ index }),
  }),
  eventSource: (runId: string) => new EventSource(`${API_BASE}/api/runs/${runId}/events`),
}
