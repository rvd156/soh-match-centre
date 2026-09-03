'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function checkExistingLogin() {
      try {
        const { data } = await supabase.auth.getUser()
        if (!data.user || cancelled) return

        const { data: isAdmin } = await supabase.rpc('is_match_admin')
        if (isAdmin && !cancelled) router.replace('/control')
      } finally {
        if (!cancelled) setChecking(false)
      }
    }

    checkExistingLogin()
    return () => { cancelled = true }
  }, [router])

  async function signIn(event) {
    event.preventDefault()
    setBusy(true)
    setErrorMessage('')

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      })

      if (error) {
        setErrorMessage('The email address or password is incorrect.')
        return
      }

      const { data: isAdmin, error: adminError } = await supabase
        .rpc('is_match_admin')

      if (adminError || !isAdmin) {
        await supabase.auth.signOut()
        setErrorMessage('This account does not have control-panel access.')
        return
      }

      router.replace('/control')
      router.refresh()
    } catch {
      setErrorMessage('Unable to sign in. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  if (checking) {
    return <main style={pageStyle}><div style={cardStyle}>Checking sign-in…</div></main>
  }

  return (
    <main style={pageStyle}>
      <form onSubmit={signIn} style={cardStyle}>
        <img src="/soh-app-icon-192.png" alt="SOH Match Centre"
          style={{ width: '82px', height: '82px', borderRadius: '18px' }} />
        <div style={{ color: '#f4c430', fontSize: '13px', fontWeight: '900', letterSpacing: '2px', marginTop: '14px' }}>
          SEÁN O'HESLIN'S
        </div>
        <h1 style={{ color: '#ffffff', fontSize: '27px', margin: '5px 0 4px' }}>
          Control Panel
        </h1>
        <p style={{ color: '#aebdb4', margin: '0 0 22px', fontSize: '14px' }}>
          Administrator sign-in
        </p>

        <label style={labelStyle}>
          Email address
          <input type="email" value={email} autoComplete="username" required
            onChange={event => setEmail(event.target.value)} style={inputStyle} />
        </label>

        <label style={labelStyle}>
          Password
          <input type="password" value={password} autoComplete="current-password" required
            onChange={event => setPassword(event.target.value)} style={inputStyle} />
        </label>

        {errorMessage && (
          <div role="alert" style={{ color: '#fecaca', background: '#7f1d1d', borderRadius: '8px', padding: '10px', fontSize: '13px', marginBottom: '12px' }}>
            {errorMessage}
          </div>
        )}

        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <a href="/live" style={{ color: '#c4d0c8', fontSize: '13px', marginTop: '16px' }}>
          Return to Match Centre
        </a>
      </form>
    </main>
  )
}

const pageStyle = {
  minHeight: '100vh', background: '#061a12', padding: '24px 16px',
  display: 'flex', alignItems: 'center', justifyContent: 'center'
}

const cardStyle = {
  width: '100%', maxWidth: '390px', textAlign: 'center',
  background: '#0b1f16', border: '1px solid #1c4932',
  borderRadius: '18px', padding: '28px 22px', boxSizing: 'border-box'
}

const labelStyle = {
  display: 'block', textAlign: 'left', color: '#ffffff',
  fontSize: '13px', fontWeight: '700', marginBottom: '14px'
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box', marginTop: '6px',
  padding: '12px', borderRadius: '9px', border: '1px solid #37634e',
  background: '#ffffff', color: '#111111', fontSize: '16px'
}

const buttonStyle = {
  width: '100%', padding: '12px 16px', borderRadius: '9px',
  border: '1px solid #f4c430', background: '#1c4932',
  color: '#ffffff', fontSize: '15px', fontWeight: '900', cursor: 'pointer'
}
