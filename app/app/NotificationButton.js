'use client'

import { useEffect, useState } from 'react'

export default function NotificationButton() {
  const [permission, setPermission] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const supported =
      window.isSecureContext &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window

    setPermission(supported ? Notification.permission : 'unsupported')
  }, [])

  async function requestPermission() {
    setBusy(true)
    setMessage('')

    try {
      const result = await Notification.requestPermission()
      setPermission(result)

      if (result === 'default') {
        setMessage('No choice saved. You can try again whenever you like.')
      }
    } catch {
      setMessage('Unable to request permission. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (permission === null) return null

  const statusMessage =
    permission === 'granted'
      ? 'Notification permission granted.'
      : permission === 'denied'
        ? 'Notifications are blocked. You can change this in your browser’s site settings.'
        : permission === 'unsupported'
          ? 'Match notifications are unavailable in this browser.'
          : message

  return (
    <div style={{ textAlign: 'center', margin: '0 auto 20px' }}>
      {permission === 'default' && (
        <button
          type="button"
          onClick={requestPermission}
          disabled={busy}
          style={{
            background: '#123524',
            border: '1px solid #1c4932',
            color: '#f4c430',
            borderRadius: '10px',
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: '800',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.7 : 1
          }}
        >
          {busy ? 'Waiting for your choice…' : 'Allow match notifications'}
        </button>
      )}

      <div
        role="status"
        style={{
          color: '#aebdb4',
          fontSize: '13px',
          marginTop: '8px',
          lineHeight: 1.5
        }}
      >
        {statusMessage}
      </div>
    </div>
  )
}
