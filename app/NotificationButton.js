'use client'

import { useEffect, useState } from 'react'

const storageKey = 'soh-notification-preferences-v1'
const defaultCustom = {
  goals: true,
  twoPointers: true,
  points: false,
  matchMilestones: true,
  manualUpdates: true
}

function convertPublicKey(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0))
}

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey))
    if (!['key_updates', 'every_score', 'custom'].includes(saved?.level)) {
      return { level: 'key_updates', custom: defaultCustom }
    }
    return {
      level: saved.level,
      custom: { ...defaultCustom, ...(saved.custom || {}) }
    }
  } catch {
    return { level: 'key_updates', custom: defaultCustom }
  }
}

function makePreferences(level, custom) {
  return level === 'custom' ? { level, ...custom } : { level }
}

async function saveSubscription(subscription, preferences) {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      preferences
    })
  })
  const data = await response.json()
  if (!response.ok || data.success !== true) {
    throw new Error(data.error || 'Unable to save subscription.')
  }
}

export default function NotificationButton() {
  const [status, setStatus] = useState('checking')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [level, setLevel] = useState('key_updates')
  const [custom, setCustom] = useState(defaultCustom)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function checkStatus() {
      const saved = loadPreferences()
      setLevel(saved.level)
      setCustom(saved.custom)

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
          saveSubscription(
            subscription,
            makePreferences(saved.level, saved.custom)
          ).catch(() => {
            if (!cancelled) {
              setMessage('Unable to refresh notification settings. Please try again.')
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

  function remember(nextLevel, nextCustom) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        level: nextLevel,
        custom: nextCustom
      }))
    } catch {}
  }

  async function storePreferences(nextLevel, nextCustom) {
    setSaving(true)
    setMessage('')

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) throw new Error('Please enable notifications first.')

      await saveSubscription(
        subscription,
        makePreferences(nextLevel, nextCustom)
      )
      remember(nextLevel, nextCustom)
      setMessage('')
      return true
    } catch (error) {
      setMessage(error instanceof Error
        ? error.message
        : 'Unable to save notification choices.')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function chooseLevel(nextLevel) {
    setLevel(nextLevel)
    const saved = await storePreferences(nextLevel, custom)
    if (saved && nextLevel !== 'custom') setSettingsOpen(false)
  }

  async function chooseCustom(name) {
    const nextCustom = { ...custom, [name]: !custom[name] }
    setCustom(nextCustom)
    await storePreferences('custom', nextCustom)
  }

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

      await saveSubscription(subscription, makePreferences(level, custom))
      remember(level, custom)
      setStatus('enabled')
      setMessage('Browser registered for match notifications.')
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
        const removed = await subscription.unsubscribe()
        if (!removed) throw new Error('Unable to turn off notifications.')

        const response = await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint })
        })

        if (!response.ok) {
          setMessage('Notifications are off on this device.')
          setStatus('available')
          return
        }
      }

      setStatus('available')
      setSettingsOpen(false)
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
      : ''

  const levelNames = {
    key_updates: 'Key updates',
    every_score: 'Every score',
    custom: 'Custom'
  }

  return (
    <div style={{ textAlign: 'center', margin: '0 auto 20px', maxWidth: '430px' }}>
      {status === 'available' && (
        <button type="button" onClick={enableNotifications} disabled={busy}
          style={buttonStyle}>
          {busy ? 'Enabling…' : 'Enable match notifications'}
        </button>
      )}

      {status === 'enabled' && (
        <>
          <button type="button" onClick={() => setSettingsOpen(true)}
            style={buttonStyle}>
            <span style={{ display: 'block' }}>🔔 Notification settings</span>
            <span style={{
              display: 'block', color: '#c4d0c8', fontSize: '12px',
              fontWeight: '600', marginTop: '3px'
            }}>
              {levelNames[level]} selected
            </span>
          </button>

          {settingsOpen && (
            <div style={backdropStyle} onClick={() => !saving && setSettingsOpen(false)}>
              <div role="dialog" aria-modal="true" aria-label="Notification choices"
                style={modalStyle} onClick={event => event.stopPropagation()}>
                <button type="button" aria-label="Close notification choices"
                  onClick={() => setSettingsOpen(false)} disabled={saving}
                  style={closeStyle}>×</button>

                <div style={{ color: '#ffffff', fontSize: '20px', fontWeight: '900', marginBottom: '12px' }}>
                  Notify me about
                </div>

                <ChoiceButton
                  selected={level === 'key_updates'}
                  title="Key updates"
                  detail="Goals, two-pointers, match milestones and selected score updates"
                  disabled={saving}
                  onClick={() => chooseLevel('key_updates')}
                />
                <ChoiceButton
                  selected={level === 'every_score'}
                  title="Every score"
                  detail="Everything in Key updates, plus every regular point"
                  disabled={saving}
                  onClick={() => chooseLevel('every_score')}
                />
                <ChoiceButton
                  selected={level === 'custom'}
                  title="Custom"
                  detail="Choose individual types below"
                  disabled={saving}
                  onClick={() => chooseLevel('custom')}
                />

                {level === 'custom' && (
                  <div style={customStyle}>
                    <CustomChoice label="Goals" name="goals" checked={custom.goals}
                      disabled={saving} onChange={chooseCustom} />
                    <CustomChoice label="Two-pointers" name="twoPointers"
                      checked={custom.twoPointers} disabled={saving} onChange={chooseCustom} />
                    <CustomChoice label="Regular points" name="points" checked={custom.points}
                      disabled={saving} onChange={chooseCustom} />
                    <CustomChoice label="Half-time and full-time" name="matchMilestones"
                      checked={custom.matchMilestones} disabled={saving} onChange={chooseCustom} />
                    <CustomChoice label="Selected score updates" name="manualUpdates"
                      checked={custom.manualUpdates} disabled={saving} onChange={chooseCustom} />
                    <button type="button" onClick={() => setSettingsOpen(false)}
                      disabled={saving} style={{ ...buttonStyle, width: '100%', marginTop: '10px' }}>
                      Done
                    </button>
                  </div>
                )}

                {saving && <div style={{ color: '#f4c430', fontSize: '13px', marginTop: '8px' }}>
                  Saving…
                </div>}

                <button type="button" onClick={disableNotifications} disabled={busy || saving}
                  style={turnOffStyle}>
                  {busy ? 'Turning off…' : 'Turn off notifications'}
                </button>
              </div>
            </div>
          )}
        </>
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

function ChoiceButton({ selected, title, detail, disabled, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      width: '100%', textAlign: 'left', display: 'block', marginBottom: '8px',
      padding: '10px 12px', borderRadius: '9px', cursor: 'pointer',
      border: selected ? '2px solid #f4c430' : '1px solid #37634e',
      background: selected ? '#1c4932' : '#123524', color: '#ffffff'
    }}>
      <div style={{ fontSize: '14px', fontWeight: '800' }}>
        {selected ? '✓ ' : ''}{title}
      </div>
      <div style={{ color: '#c4d0c8', fontSize: '12px', marginTop: '3px', lineHeight: 1.35 }}>
        {detail}
      </div>
    </button>
  )
}

function CustomChoice({ label, name, checked, disabled, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: '9px',
      color: '#ffffff', fontSize: '13px', padding: '5px 0'
    }}>
      <input type="checkbox" checked={checked} disabled={disabled}
        onChange={() => onChange(name)} />
      {label}
    </label>
  )
}

const customStyle = {
  textAlign: 'left', borderTop: '1px solid #37634e',
  padding: '8px 4px 0', marginTop: '10px'
}

const buttonStyle = {
  background: '#123524', border: '1px solid #1c4932', color: '#f4c430',
  borderRadius: '10px', padding: '10px 16px', fontSize: '14px',
  fontWeight: '800', cursor: 'pointer'
}

const backdropStyle = {
  position: 'fixed', inset: 0, zIndex: 2000,
  background: 'rgba(0, 0, 0, 0.72)', padding: '18px',
  display: 'flex', alignItems: 'center', justifyContent: 'center'
}

const modalStyle = {
  position: 'relative', width: '100%', maxWidth: '430px', maxHeight: '88vh',
  overflowY: 'auto', background: '#0b1f16', border: '1px solid #37634e',
  borderRadius: '14px', padding: '20px 16px 16px',
  boxShadow: '0 18px 50px rgba(0, 0, 0, 0.45)'
}

const closeStyle = {
  position: 'absolute', top: '6px', right: '10px', border: 0,
  background: 'transparent', color: '#ffffff', fontSize: '30px',
  lineHeight: 1, cursor: 'pointer'
}

const turnOffStyle = {
  marginTop: '14px', background: 'transparent', border: 0,
  color: '#aebdb4', textDecoration: 'underline', fontSize: '13px',
  cursor: 'pointer'
}
