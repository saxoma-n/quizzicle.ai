import katex from 'katex'
import 'katex/dist/katex.min.css'

export default function MathText({ text }) {
  const regex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$[^\n$]+?\$|\\\([\s\S]*?\\\))/g
  const parts = []
  let last = 0, match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ type: 'text', content: text.slice(last, match.index) })
    const raw = match[0]
    const isDisplay = raw.startsWith('$$') || raw.startsWith('\\[')
    const inner = (raw.startsWith('$$') || raw.startsWith('\\[') || raw.startsWith('\\('))
      ? raw.slice(2, -2) : raw.slice(1, -1)
    parts.push({ type: isDisplay ? 'display' : 'inline', content: inner })
    last = match.index + raw.length
  }
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last) })

  return (
    <>
      {parts.map((p, i) => {
        if (p.type === 'text') return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{p.content}</span>
        try {
          const html = katex.renderToString(p.content, { displayMode: p.type === 'display', throwOnError: false, trust: false })
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
        } catch {
          return <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{p.type === 'display' ? `$$${p.content}$$` : `$${p.content}$`}</span>
        }
      })}
    </>
  )
}
