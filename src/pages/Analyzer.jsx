import { useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import Nav from '../components/Nav'
import ChatPanel from '../components/ChatPanel'
import MathText from '../components/MathText'
import { useApp } from '../contexts/AppContext'
import { batColor } from '../components/BatteryWidget'

export default function Analyzer() {
  const { battery, deplete, pushProblem } = useApp()

  const [inputMode, setInputMode] = useState('upload')   // 'upload' | 'latex'
  const [manualLatex, setManualLatex] = useState('')
  const [file, setFile]         = useState(null)
  const [preview, setPreview]   = useState(null)
  const [result, setResult]     = useState(null)
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(false)
  const [dragging, setDragging] = useState(false)
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
      if (data.mathProblem) pushProblem(data.mathProblem)
      setDepleted((oldBat - newBat).toFixed(1))
      setResult(data.mathProblem || '')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (mode) => {
    setInputMode(mode)
    setResult(null); setError(null); setDepleted(null)
  }

  const useManualProblem = () => {
    const trimmed = manualLatex.trim()
    if (!trimmed) return
    pushProblem(trimmed)
    setResult(trimmed)
    setDepleted(null); setError(null)
  }

  const clear = () => {
    setFile(null); setPreview(null); setResult(null)
    setError(null); setDepleted(null); setManualLatex('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const batteryEmpty = battery <= 0
  const batC = batColor(battery)

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
              <p className="subtitle">Upload an image and AI will extract the problem for the tutor.</p>
            </div>

            <div className="bat-card bat-card-nested">
              <div className="bat-card-header">
                <span className="bat-card-title">Battery</span>
                <span className="bat-card-pct" style={{ color: batC }}>{Math.round(battery)}%</span>
              </div>
              <div className="bat-track">
                <div className="bat-track-fill" style={{ width: battery + '%', background: batC }} />
              </div>
            </div>

            {batteryEmpty ? (
              <div className="empty-battery-box">
                🔋 Your battery is depleted!<br />
                Visit the <Link to="/training">Training page</Link> to recharge.
              </div>
            ) : (
              <>
                <div className="input-tabs">
                  <button
                    className={`input-tab${inputMode === 'upload' ? ' active' : ''}`}
                    onClick={() => switchMode('upload')}
                  >
                    Upload Image
                  </button>
                  <button
                    className={`input-tab${inputMode === 'latex' ? ' active' : ''}`}
                    onClick={() => switchMode('latex')}
                  >
                    Type LaTeX
                  </button>
                </div>

                {inputMode === 'upload' ? (
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
                ) : (
                  <div className="latex-input-section">
                    <textarea
                      className="latex-textarea"
                      rows={4}
                      placeholder={"Type your problem here.\nUse $...$ for inline math and $$...$$ for display math.\nExample: Find the roots of $$x^2 - 5x + 6 = 0$$"}
                      value={manualLatex}
                      onChange={e => { setManualLatex(e.target.value); setResult(null); setError(null) }}
                    />
                    {manualLatex.trim() && (
                      <div className="latex-preview">
                        <div className="latex-preview-label">Preview</div>
                        <MathText text={manualLatex} />
                      </div>
                    )}
                    {manualLatex.trim() && (
                      <button className="detect-btn" onClick={useManualProblem}>
                        Use this problem
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {result !== null && result !== undefined && (
              result ? (
                <div className="result-success">
                  <span className="result-success-icon">✓</span>
                  {depleted ? 'Problem detected' : 'Problem loaded'} — ask the tutor in the chat!
                  {depleted && (
                    <span className="result-depletion"> (Battery used: {depleted}%)</span>
                  )}
                </div>
              ) : (
                <div className="error-box">No math problem detected in this image.</div>
              )
            )}

            {error && <div className="error-box">Error: {error}</div>}

            {(file || result || error || manualLatex) && !batteryEmpty && (
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
