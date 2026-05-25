import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import Nav from '../components/Nav'
import ChatPanel from '../components/ChatPanel'
import MathText from '../components/MathText'
import { useApp } from '../contexts/AppContext'
import { batColor } from '../components/BatteryWidget'

export default function Analyzer() {
  const { battery, deplete, pushProblem } = useApp()

  const [file, setFile]         = useState(null)
  const [preview, setPreview]   = useState(null)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const [dragging, setDragging] = useState(false)
  const [copied, setCopied]     = useState(false)
  const [depleted, setDepleted] = useState(null)
  const inputRef = useRef(null)

  const handleFile = useCallback((f) => {
    if (!f) return
    setFile(f); setResult(null); setError(null); setDepleted(null)
    setPreview(URL.createObjectURL(f))
  }, [])

  const onInputChange = (e) => handleFile(e.target.files[0])
  const onDrop      = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }
  const onDragOver  = (e) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)

  const detect = async () => {
    if (!file || battery <= 0) return
    setLoading(true); setResult(null); setError(null); setDepleted(null)
    const formData = new FormData()
    formData.append('image', file)
    try {
      const oldBat = battery
      const res  = await fetch('/api/extract-math', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Server error')
      const newBat = deplete()
      pushProblem(data.mathProblem)
      setDepleted((oldBat - newBat).toFixed(1))
      setResult(data.mathProblem)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const copy = () => {
    navigator.clipboard.writeText(result).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const clear = () => {
    setFile(null); setPreview(null); setResult(null)
    setError(null); setCopied(false); setDepleted(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const batteryEmpty = battery <= 0

  return (
    <>
      <Nav links={[
        { to: '/training', label: 'Training' },
        { to: '/', label: '← Home' },
      ]} />

      <main className="analyzer-main">
        <div className="layout">

          {/* Left: Analyzer */}
          <div className="analyzer-card">
            <div className="card-header">
              <h1>Problem Analyzer</h1>
              <p className="subtitle">Upload an image and AI will extract and explain the problem.</p>
            </div>

            {batteryEmpty ? (
              <div className="empty-battery-box">
                🔋 Your battery is depleted!<br />
                Visit the <Link to="/training">Training page</Link> to recharge.
              </div>
            ) : (
              <>
                <div
                  className={`drop-zone${dragging ? ' dragging' : ''}`}
                  onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
                >
                  <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={onInputChange} />
                  <div className="drop-icon">🖼️</div>
                  <p className="drop-text"><span>Click to upload</span> or drag &amp; drop</p>
                  <p className="drop-hint">JPEG, PNG, WebP — max 5 MB</p>
                </div>

                {preview && (
                  <div className="preview-section">
                    <img src={preview} alt="Uploaded preview" />
                    <p className="filename">{file.name}</p>
                    <button className="detect-btn" onClick={detect} disabled={loading}>
                      {loading && <span className="spinner" />}
                      {loading ? 'Analyzing…' : 'Analyze Problem'}
                    </button>
                    {!loading && <p className="depletion-note">Uses 5–7% battery per analysis</p>}
                  </div>
                )}
              </>
            )}

            {result && (
              <div className="result-box">
                <div className="result-label">Explanation</div>
                <div className="result-text"><MathText text={result} /></div>
                <button className="copy-btn" onClick={copy}>{copied ? '✓ Copied' : 'Copy'}</button>
                {depleted && (
                  <p style={{ marginTop: '0.5rem', fontSize: '0.76rem', color: '#888' }}>
                    Battery used: {depleted}% — now at {Math.round(battery)}%
                  </p>
                )}
              </div>
            )}

            {error && <div className="error-box">Error: {error}</div>}

            {(file || result || error) && !batteryEmpty && (
              <button className="clear-link" onClick={clear}>Clear &amp; start over</button>
            )}
          </div>

          {/* Right: Chat */}
          <ChatPanel problem={result} />

        </div>
      </main>
    </>
  )
}
