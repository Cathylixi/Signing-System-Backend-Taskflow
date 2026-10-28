import { useState, type FormEvent } from 'react'
import logo from '../assets/qi-logo.png'
import { isEmail } from '../lib/people'

interface LoginPageProps {
  onSignIn: (email: string) => void
}

// PLACEHOLDER SIGN-IN: there is no auth service yet. Dev builds accept any
// password so the workflow can be clicked through; production builds refuse.
// See docs/SECURITY.md (Authentication) before wiring this up.
const SIGN_IN_AVAILABLE = import.meta.env.DEV

export default function LoginPage({ onSignIn }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function submit(e: FormEvent) {
    e.preventDefault()
    setNotice(null)
    if (!isEmail(email)) return setError('Enter your work email address.')
    if (!password) return setError('Enter your password.')
    if (!SIGN_IN_AVAILABLE) return setError('Sign-in is not connected yet. Please try again later.')
    setError(null)
    onSignIn(email.trim())
  }

  return (
    <div className="login">
      <section className="login-brand">
        <p className="login-eyebrow">Signing workspace</p>
        <img className="login-logo" src={logo} alt="Quantive Intelligence. LLX is now part of the Quantive Intelligence Decision Sciences platform." />
        <p className="login-tagline">Secure access keeps every document and signer in the right place.</p>
        <p className="login-footnote">Encrypted session • Activity logged</p>
      </section>

      <section className="login-panel">
        <form className="login-form" onSubmit={submit} noValidate>
          <h1>Welcome back</h1>
          <p className="subtitle">Sign in to generate and sign documents.</p>

          <label className="label" htmlFor="login-email">
            Username
          </label>
          <input
            id="login-email"
            className="input"
            type="email"
            autoComplete="username"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <label className="label" htmlFor="login-password">
            Password
          </label>
          <p className="banner warning" id="password-hint">
            Use a password unique to this workspace. Don't reuse your Microsoft or QI account password.
          </p>
          <input
            id="login-password"
            className="input"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            aria-describedby="password-hint"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <div className="login-row">
            <label className="checkbox">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me
            </label>
            <button
              type="button"
              className="link-button"
              onClick={() => setNotice('To reset your password, contact your workspace administrator.')}
            >
              Forgot password?
            </button>
          </div>

          {error && (
            <p className="message error" role="alert">
              {error}
            </p>
          )}
          {notice && <p className="message info">{notice}</p>}

          <button type="submit" className="btn btn-primary btn-block">
            Log in
          </button>

          <p className="login-help">Need access? Contact your workspace administrator.</p>
          {SIGN_IN_AVAILABLE && (
            <p className="dev-note">Prototype: sign-in isn't connected yet, so any password works in dev builds.</p>
          )}
        </form>
      </section>
    </div>
  )
}
