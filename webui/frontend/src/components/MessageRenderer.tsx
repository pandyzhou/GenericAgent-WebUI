import React, { useState, useMemo } from "react"
import { marked } from "marked"

marked.setOptions({
  breaks: true,
  gfm: true,
})

type Block =
  | { type: "markdown"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool_use"; content: string; name?: string }
  | { type: "tool_result"; content: string }
  | { type: "file_content"; content: string; path?: string }
  | { type: "summary"; content: string }
  | { type: "code"; content: string; lang?: string }

const TAG_RE = /<(thinking|tool_use|tool_result|file_content|summary)(?:\s[^>]*)?>[\s\S]*?<\/\1>/g
const TAG_OPEN_RE = /^<(\w+)(?:\s([^>]*))?>/
const TAG_CLOSE_RE = /<\/\w+>$/

function extractAttr(attrs: string, key: string): string {
  const m = new RegExp(`${key}="([^"]*)"`, "i").exec(attrs)
  return m ? m[1] : ""
}

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let lastIndex = 0

  for (const match of text.matchAll(TAG_RE)) {
    const before = text.slice(lastIndex, match.index)
    if (before.trim()) blocks.push({ type: "markdown", content: before })

    const raw = match[0]
    const openMatch = TAG_OPEN_RE.exec(raw)
    const tag = openMatch?.[1] || "markdown"
    const attrs = openMatch?.[2] || ""
    const inner = raw.replace(TAG_OPEN_RE, "").replace(TAG_CLOSE_RE, "").trim()

    switch (tag) {
      case "thinking":
        blocks.push({ type: "thinking", content: inner })
        break
      case "tool_use": {
        let name = extractAttr(attrs, "name")
        if (!name) {
          try {
            const parsed = JSON.parse(inner)
            name = parsed?.name || ""
          } catch { /* ignore */ }
        }
        blocks.push({ type: "tool_use", content: inner, name })
        break
      }
      case "tool_result":
        blocks.push({ type: "tool_result", content: inner })
        break
      case "file_content": {
        const path = extractAttr(attrs, "path") || extractAttr(attrs, "file")
        blocks.push({ type: "file_content", content: inner, path })
        break
      }
      case "summary":
        blocks.push({ type: "summary", content: inner })
        break
      default:
        blocks.push({ type: "markdown", content: raw })
    }

    lastIndex = (match.index || 0) + raw.length
  }

  const remaining = text.slice(lastIndex)
  if (remaining.trim()) blocks.push({ type: "markdown", content: remaining })

  return blocks
}

const FOLD_LABELS: Record<string, string> = {
  thinking: "思考过程",
  tool_use: "工具调用",
  tool_result: "工具结果",
  file_content: "文件内容",
  summary: "摘要",
}

function CollapsibleBlock({ block }: { block: Block }) {
  const [open, setOpen] = useState(block.type === "summary")
  const label = FOLD_LABELS[block.type] || block.type
  const subtitle =
    block.type === "tool_use" ? (block as any).name :
    block.type === "file_content" ? (block as any).path : ""

  return (
    <details className={`msg-fold msg-fold--${block.type}`} open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="msg-fold-header">
        <span className="msg-fold-icon">{open ? "▾" : "▸"}</span>
        <span className="msg-fold-label">{label}</span>
        {subtitle && <span className="msg-fold-subtitle">{subtitle}</span>}
        <span className="msg-fold-len">{block.content.length} 字符</span>
      </summary>
      <div className="msg-fold-body">
        <pre>{block.content}</pre>
      </div>
    </details>
  )
}

function MarkdownBlock({ content }: { content: string }) {
  const html = useMemo(() => {
    try {
      return marked.parse(content) as string
    } catch {
      return content
    }
  }, [content])

  return <div className="msg-markdown" dangerouslySetInnerHTML={{ __html: html }} />
}

export default function MessageRenderer({ content }: { content: string }) {
  const blocks = useMemo(() => parseBlocks(content), [content])

  return (
    <div className="msg-rendered">
      {blocks.map((block, i) => {
        if (block.type === "markdown") return <MarkdownBlock key={i} content={block.content} />
        return <CollapsibleBlock key={i} block={block} />
      })}
    </div>
  )
}
