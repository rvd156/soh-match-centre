'use client'

import { useEffect, useState } from 'react'

function convertPublicKey(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  return Uint8Array.from(atob(base64), char => char.charCodeAt(0))
}

export default function NotificationButton() {
  const [permission, setPermission] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const supported =
      window.isSecureContext &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window

    setPermission(supported ? Notification.permission : 'unsupported')
  }, [])

  async function enableNotifications() {
    setBusy(true)
    setMessage('')

    let readyTimer

    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()

      if (!publicKey) {
        throw new Error('Notification setup is incomplete.')
      }

      const applicationServerKey = convertPublicKey(publicKey)

      const result =
        Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission

      setPermission(result)

      if (result !== 'granted') {
        if (result === 'default') {
          setMessage('No choice saved. You can try again whenever you like.')
        }
        return
      }

      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => {
          readyTimer = setTimeout(() => {
            reject(new Error('Please refresh the page and try again.'))
          }, 10000)
        })
      ])

      clearTimeout(readyTimer)

      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey
        })
      }

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subscription.toJSON()),
        signal: AbortSignal.timeout(15000)
      })

      const data = await response.json()

      if (!response.ok || data.success !== true) {
        throw new Error(data.error || 'Unable to save subscription.')
      }

      setSaved(true)
      setMessage('Browser registered for match notifications.')
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to register. Please try again.'
      )
    } finally {
      clearTimeout(readyTimer)
      setBusy(false)
    }
  }

  if (permission === null) return null

  const statusMessage =
    permission === 'denied'
      ? 'Notifications are blocked. You can change this in your browser’s site settings.'
      : permission === 'unsupported'
        ? 'Match notifications are unavailable in this browser.'
        : message

  const canRegister =
    permission === 'default' || permission === 'granted'

  return (
    <div style={{ textAlign: 'center', margin: '0 auto 20px' }}>
      {canRegister && !saved && (
        <button
          type="button"
          onClick={enableNotifications}
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
          {busy ? 'Registering…' : 'Enable match notifications'}
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
