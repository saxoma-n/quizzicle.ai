import { useState, useRef, useEffect, useCallback } from 'react'
import MathText from './MathText'

const SUGGESTIONS = [
  'What are the first steps?',
  'Where do I go from here?',
  'Explain the process of solving this problem.',
  'Give me a hint without spoiling the answer.',
]

export default function ChatPanel({ problem }) {
  const [messages, setMessages] = useState([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const bottomRef = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => { setMessages([]); setInput('') }, [problem])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || loading || !problem) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    setLoading(true)
    try {
      const res  = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem, messages: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Server error')
      setMessages([...next, { role: 'assistant', content: data.reply }])
    } catch (err) {
      setMessages([...next, { role: 'assistant', content: `Error: ${err.message}` }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [input, loading, messages, problem])

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const autoResize = (e) => {
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 110) + 'px'
  }

  const autofill = (text) => {
    setInput(text)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-title">Tutor Chat</div>
        <p className="chat-subtitle">Ask follow-up questions about this problem</p>
      </div>

      <div className="chat-messages">
        {!problem ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">💬</div>
            <p>Analyze a problem first, then ask me anything about it.</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <div className="chat-empty-icon">🎓</div>
            <p>Problem loaded! Ask me anything — steps, concepts, hints, or a full walkthrough.</p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              <div className="chat-bubble">
                <MathText text={m.content} />
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="chat-msg assistant">
            <div className="chat-bubble typing-bubble">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {problem && !loading && (
        <div className="chat-suggestions">
          {SUGGESTIONS.map((q) => (
            <button key={q} className="chat-suggestion-btn" onClick={() => autofill(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="chat-input-area">
        <textarea
          ref={inputRef}
          className="chat-input"
          rows={1}
          placeholder={problem ? 'Ask a question… use $...$ for LaTeX (Enter to send)' : 'Analyze a problem first…'}
          value={input}
          disabled={!problem || loading}
          onChange={e => { setInput(e.target.value); autoResize(e) }}
          onKeyDown={onKeyDown}
        />
        <button
          className="chat-send"
          onClick={send}
          disabled={!problem || !input.trim() || loading}
          title="Send (Enter)"
        >
          ↑
        </button>
      </div>
    </div>
  )
}
