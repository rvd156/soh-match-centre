'use client'

import { useEffect, useState } from 'react'

function convertPublicKey(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0))
}

async function saveSubscription(subscription) {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(subscription.toJSON())
  })
  const data = await response.json()
  if (!response.ok || data.success !== true) {
    throw new Error(data.error || 'Unable to save subscription.')
  }
}

export default function NotificationButton() {
  const [status, setStatus] = useState('checking')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false

    async function checkStatus() {
      const supported =
        window.isSecureContext &&
        'Notification' in window &&
        'serviceWorker' in navigator &&
        'PushManager' in window

      if (!supported) {
        if (!cancelled) setStatus('unsupported')
        return
      }

      if (Notification.permission === 'denied') {
        if (!cancelled) setStatus('blocked')
        return
      }

      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()

        if (cancelled) return

        if (subscription && Notification.permission === 'granted') {
          setStatus('enabled')

          // Repair a missing server record without interrupting the supporter.
          saveSubscription(subscription).catch(() => {
            if (!cancelled) {
              setMessage('Unable to refresh the server registration. Please try again.')
            }
          })
        } else {
          setStatus('available')
        }
      } catch {
        if (!cancelled) {
          setStatus('available')
          setMessage('Unable to check notification status. Please try again.')
        }
      }
    }

    checkStatus()
    return () => { cancelled = true }
  }, [])

  async function enableNotifications() {
    setBusy(true)
    setMessage('')

    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
      if (!publicKey) throw new Error('Notification setup is incomplete.')

      const permission = Notification.permission === 'default'
        ? await Notification.requestPermission()
        : Notification.permission

      if (permission === 'denied') {
        setStatus('blocked')
        return
      }

      if (permission !== 'granted') {
        setStatus('available')
        setMessage('No choice saved. You can try again whenever you like.')
        return
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertPublicKey(publicKey)
        })
      }

      await saveSubscription(subscription)
      setStatus('enabled')
      setMessage('This device will receive goal alerts.')
    } catch (error) {
      setStatus('available')
      setMessage(error instanceof Error
        ? error.message
        : 'Unable to enable notifications. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function disableNotifications() {
    setBusy(true)
    setMessage('')

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        const endpoint = subscription.endpoint

        // Unsubscribe locally first so this device stops receiving alerts.
        const removed = await subscription.unsubscribe()
        if (!removed) throw new Error('Unable to turn off notifications.')

        // Remove the now-inactive address from the server.
        const response = await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint })
        })

        if (!response.ok) {
          // The device is already unsubscribed, which stops local delivery.
          setMessage('Notifications are off on this device.')
          setStatus('available')
          return
        }
      }

      setStatus('available')
      setMessage('Notifications are off on this device.')
    } catch (error) {
      setMessage(error instanceof Error
        ? error.message
        : 'Unable to turn off notifications. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (status === 'checking') return null

  const fixedMessage = status === 'blocked'
    ? 'Notifications are blocked. Change this in your browser or device settings.'
    : status === 'unsupported'
      ? 'Match notifications are unavailable in this browser.'
      : status === 'enabled'
        ? 'Match notifications enabled'
        : ''

  return (
    <div style={{ textAlign: 'center', margin: '0 auto 20px' }}>
      {status === 'available' && (
        <button type="button" onClick={enableNotifications} disabled={busy}
          style={buttonStyle}>
          {busy ? 'Enabling…' : 'Enable match notifications'}
        </button>
      )}

      {status === 'enabled' && (
        <button type="button" onClick={disableNotifications} disabled={busy}
          style={{ ...buttonStyle, color: '#ffffff' }}>
          {busy ? 'Turning off…' : 'Turn off notifications'}
        </button>
      )}

      <div role="status" style={{
        color: status === 'enabled' ? '#f4c430' : '#aebdb4',
        fontSize: '13px', marginTop: '8px', lineHeight: 1.5
      }}>
        {fixedMessage}
        {message && <div>{message}</div>}
      </div>
    </div>
  )
}

const buttonStyle = {
  background: '#123524',
  border: '1px solid #1c4932',
  color: '#f4c430',
  borderRadius: '10px',
  padding: '10px 16px',
  fontSize: '14px',
  fontWeight: '800',
  cursor: 'pointer'
}
