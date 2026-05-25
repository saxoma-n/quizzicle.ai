import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import Nav from '../components/Nav'
import { useApp } from '../contexts/AppContext'
import { batColor } from '../components/BatteryWidget'

function checkAnswer(userAns, correct) {
  const norm = s => s.toString().trim().toLowerCase().replace(/\s+/g, '')
  const u = norm(userAns), c = norm(correct)
  if (u === c) return true
  const parseFrac = s => { const m = s.match(/^(-?\d+\.?\d*)\/(-?\d+\.?\d*)$/); return m ? parseFloat(m[1]) / parseFloat(m[2]) : NaN }
  const uNum = isNaN(parseFloat(u)) ? parseFrac(u) : parseFloat(u)
  const cNum = isNaN(parseFloat(c)) ? parseFrac(c) : parseFloat(c)
  if (!isNaN(uNum) && !isNaN(cNum)) return Math.abs(uNum - cNum) < 0.01
  return false
}

export default function Training() {
  const { battery, history, recharge, clearHistory } = useApp()

  const problemList   = history.map(h => h.problem)
  const [selectedIdxs, setSelected] = useState(() => new Set(problemList.map((_, i) => i)))
  const [phase, setPhase]           = useState('idle')
  const [problems, setProblems]     = useState([])
  const [answers, setAnswers]       = useState(['', '', ''])
  const [results, setResults]       = useState([])
  const [rechargeAmt, setRecharge]  = useState(null)
  const [genError, setGenError]     = useState(null)

  const toggleChip  = (i) => setSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  const selectAll   = () => setSelected(new Set(problemList.map((_, i) => i)))
  const selectNone  = () => setSelected(new Set())

  const handleClearHistory = () => {
    if (!window.confirm('Clear all submitted problem history? This cannot be undone.')) return
    clearHistory()
    setSelected(new Set())
    setPhase('idle')
    setProblems([])
  }

  const selectedProblems = problemList.filter((_, i) => selectedIdxs.has(i))

  const generate = useCallback(async () => {
    if (selectedProblems.length === 0) return
    setPhase('loading')
    setGenError(null)
    try {
      const res  = await fetch('/api/generate-practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recentProblems: selectedProblems.slice(0, 10) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Server error')
      setProblems(data.problems)
      setAnswers(['', '', ''])
      setResults([])
      setRecharge(null)
      setPhase('problems')
    } catch (err) {
      setGenError(err.message)
      setPhase('idle')
    }
  }, [selectedProblems])

  const submit = useCallback(() => {
    const res = problems.map((p, i) => checkAnswer(answers[i], p.answer))
    setResults(res)
    setPhase('submitted')
    const correct = res.filter(Boolean).length
    if (correct >= 2) {
      const oldBat = battery
      const newBat = recharge()
      setRecharge((newBat - oldBat).toFixed(1))
    }
  }, [problems, answers, battery, recharge])

  const reset = () => { setPhase('idle'); setProblems([]); setResults([]); setAnswers(['', '', '']); setRecharge(null) }

  const allFilled = answers.every(a => a.trim() !== '')
  const passed    = results.length > 0 && results.filter(Boolean).length >= 2
  const batC      = batColor(battery)
  const batHint   = battery > 60
    ? 'Battery is healthy. Keep analyzing!'
    : battery > 30
      ? 'Battery is getting low. Consider recharging.'
      : 'Battery is critical — complete a practice set to recharge.'

  return (
    <>
      <Nav links={[
        { to: '/analyzer', label: 'Analyzer' },
        { to: '/', label: '← Home' },
      ]} />

      <main className="training-main">
        <div className="training-page">

          {/* Battery status card */}
          <div className="bat-card">
            <div className="bat-card-header">
              <span className="bat-card-title">Battery</span>
              <span className="bat-card-pct" style={{ color: batC }}>{Math.round(battery)}%</span>
            </div>
            <div className="bat-track">
              <div className="bat-track-fill" style={{ width: battery + '%', background: batC }} />
            </div>
            <p className="bat-hint">{batHint}</p>
          </div>

          {/* Practice card */}
          <div className="practice-card">
            <div className="section-title">Practice Set</div>
            <p className="section-sub">
              Solve 3 problems based on your past analyzer submissions.
              Get 2 or more correct to recharge <strong>10–13%</strong>.
            </p>

            {problemList.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">📭</div>
                <p>No problem history yet.<br />
                  Use the <Link to="/analyzer">Analyzer</Link> to extract math problems, then come back to practice.
                </p>
              </div>
            ) : (
              <>
                {phase === 'idle' && (
                  <div className="topic-section">
                    <div className="topic-label">Select topics to practice ({selectedIdxs.size} of {problemList.length})</div>
                    <div className="topic-controls">
                      <button className="chip-ctrl-btn" onClick={selectAll}>All</button>
                      <button className="chip-ctrl-btn" onClick={selectNone}>None</button>
                      <button className="clear-hist-btn" onClick={handleClearHistory}>Clear cache</button>
                    </div>
                    <div className="topics">
                      {problemList.map((p, i) => (
                        <span
                          key={i}
                          className={`chip ${selectedIdxs.has(i) ? 'chip-on' : 'chip-off'}`}
                          title={p}
                          onClick={() => toggleChip(i)}
                        >{p}</span>
                      ))}
                    </div>
                  </div>
                )}

                {(phase === 'idle' || phase === 'submitted') && (
                  <button className="gen-btn" onClick={generate} disabled={selectedProblems.length === 0}>
                    {phase === 'submitted' ? 'Generate Another Set' : 'Generate Practice Set'}
                  </button>
                )}

                {phase === 'loading' && (
                  <button className="gen-btn" disabled>
                    <span className="spinner" />Generating…
                  </button>
                )}

                {genError && (
                  <p style={{ marginTop: '0.75rem', color: '#c0392b', fontSize: '0.85rem' }}>
                    Error: {genError}
                  </p>
                )}

                {(phase === 'problems' || phase === 'submitted') && problems.length > 0 && (
                  <>
                    <div className="problems">
                      {problems.map((p, i) => {
                        const submitted = phase === 'submitted'
                        const correct   = submitted ? results[i] : null
                        return (
                          <div key={i} className={`problem-item${submitted ? (correct ? ' correct' : ' incorrect') : ''}`}>
                            <div className="problem-num">Problem {i + 1}</div>
                            <div className="problem-q">{p.question}</div>
                            <input
                              className="answer-input"
                              type="text"
                              placeholder="Your answer…"
                              value={answers[i]}
                              disabled={submitted}
                              onChange={e => { const next = [...answers]; next[i] = e.target.value; setAnswers(next) }}
                              onKeyDown={e => { if (e.key === 'Enter' && allFilled && phase === 'problems') submit() }}
                            />
                            {submitted && (
                              <div className={`verdict ${correct ? 'correct-v' : 'incorrect-v'}`}>
                                {correct ? '✓ Correct!' : `✗ Incorrect — correct answer: ${p.answer}`}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {phase === 'problems' && (
                      <button className="submit-answers-btn" onClick={submit} disabled={!allFilled}>
                        Submit Answers
                      </button>
                    )}

                    {phase === 'submitted' && (
                      <div className={`results-summary ${passed ? 'pass' : 'fail'}`}>
                        <div className={`summary-score ${passed ? 'pass' : 'fail'}`}>
                          {results.filter(Boolean).length} / {problems.length} correct
                        </div>
                        {passed ? (
                          <p className="summary-msg">
                            Nice work! Battery recharged by <strong>+{rechargeAmt}%</strong>.
                            You&apos;re now at <strong>{Math.round(battery)}%</strong>.
                          </p>
                        ) : (
                          <p className="summary-msg">
                            You need at least 2 correct answers to recharge. Try another set!
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

        </div>
      </main>
    </>
  )
}
