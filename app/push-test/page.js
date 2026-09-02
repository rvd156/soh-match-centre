'use client'

import { useState } from 'react'

export default function PushTestPage() {
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function sendTest(event) {
    event.preventDefault()
    setBusy(true)
    setMessage('')

    const sendingSecret = secret.trim()
    setSecret('')

    try {
      if (
        !('serviceWorker' in navigator) ||
        !('PushManager' in window)
      ) {
        throw new Error('Push notifications are unavailable in this browser.')
      }

      const registration = await navigator.serviceWorker.getRegistration()
      const subscription =
        await registration?.pushManager.getSubscription()

      if (!subscription) {
        throw new Error(
          'Open the live page and enable match notifications first.'
        )
      }

      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sendingSecret}`
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint
        }),
        signal: AbortSignal.timeout(20000)
      })

      const data = await response.json()

      if (!response.ok || data.success !== true) {
        const detail = data.pushStatus
          ? ` (Push service code: ${data.pushStatus})`
          : ''

        throw new Error(
          (data.error || 'Unable to send test.') + detail
        )
      }

      setMessage(data.message)
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to send test. Please try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#071a12',
        color: '#ffffff',
        fontFamily: 'Arial, sans-serif',
        padding: '40px 20px'
      }}
    >
      <div style={{ maxWidth: '460px', margin: '0 auto' }}>
        <h1 style={{ color: '#f4c430' }}>Test notifications</h1>

        <p style={{ lineHeight: 1.6 }}>
          Send a test notification to this browser only.
        </p>

        <form onSubmit={sendTest}>
          <label htmlFor="sending-secret">Sending secret</label>

          <input
            id="sending-secret"
            type="password"
            value={secret}
            onChange={event => setSecret(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            required
            disabled={busy}
            style={{
              display: 'block',
              boxSizing: 'border-box',
              width: '100%',
              margin: '10px 0 18px',
              padding: '12px',
              borderRadius: '8px',
              border: '1px solid #1c4932',
              background: '#123524',
              color: '#ffffff',
              fontSize: '16px'
            }}
          />

          <button
            type="submit"
            disabled={busy || !secret.trim()}
            style={{
              padding: '12px 18px',
              background: '#f4c430',
              color: '#071a12',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '800',
              fontSize: '15px',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy || !secret.trim() ? 0.6 : 1
            }}
          >
            {busy ? 'Sending…' : 'Send test notification'}
          </button>
        </form>

        <p role="status" style={{ lineHeight: 1.6 }}>
          {message}
        </p>

        <a href="/live" style={{ color: '#f4c430' }}>
          Back to Match Centre
        </a>
      </div>
    </main>
  )
}
