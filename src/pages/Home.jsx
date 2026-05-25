import { Link } from 'react-router-dom'
import Nav from '../components/Nav'

export default function Home() {
  return (
    <>
      <Nav links={[
        { to: '/training', label: 'Training' },
        { to: '/analyzer', label: 'Open Analyzer', className: 'nav-btn' },
      ]} />

      <section className="hero">
        <div className="hero-badge">Powered by AI Vision</div>
        <h1>Extract any <span>math problem</span> from an image instantly</h1>
        <p>
          Upload a photo of your homework, textbook, or handwritten notes and quizzicle.ai
          will pull out the exact problem — ready to copy, solve, or share.
        </p>
        <div className="cta-group">
          <Link to="/analyzer" className="cta-primary">Analyze a Problem →</Link>
          <a href="#how-it-works" className="cta-secondary">How it works</a>
        </div>

        <div className="features" id="how-it-works">
          <div className="feature-card">
            <div className="feature-icon">📷</div>
            <h3>Upload any image</h3>
            <p>Drag &amp; drop or click to upload JPEG, PNG, or WebP files up to 5 MB.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🧠</div>
            <h3>AI-powered extraction</h3>
            <p>AI reads the image and returns the exact math expression or problem statement.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Results in seconds</h3>
            <p>No manual typing. Get clean, copy-ready output almost instantly.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔋</div>
            <h3>Battery &amp; Training</h3>
            <p>Each analysis uses battery charge. Visit the Training page to recharge by solving practice problems.</p>
          </div>
        </div>
      </section>

      <footer>&copy; 2026 quizzicle.ai &mdash; AI Math Problem Extractor</footer>
    </>
  )
}
