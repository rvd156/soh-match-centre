'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function ControlLayout({ children }) {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [liveViewers, setLiveViewers] = useState(0)
  const [notificationDevices, setNotificationDevices] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')
  const [insightsUpdatedAt, setInsightsUpdatedAt] = useState(null)
  const [connectionStatus, setConnectionStatus] = useState('checking')

  useEffect(() => {
    let cancelled = false

    async function checkAccess() {
      const { data, error } = await supabase.auth.getUser()

      if (error || !data.user) {
        if (!cancelled) {
          router.replace('/login')
        }
        return
      }

      const { data: isAdmin, error: adminError } = await supabase
        .rpc('is_match_admin')

      if (adminError || !isAdmin) {
        await supabase.auth.signOut()

        if (!cancelled) {
          router.replace('/login')
        }
        return
      }

      if (!cancelled) {
        setAllowed(true)
      }
    }

    checkAccess()

    return () => {
      cancelled = true
    }
  }, [router])

  useEffect(() => {
    if (!allowed) return

    const channel = supabase
      .channel('live-page-viewers')
      .on('presence', { event: 'sync' }, () => {
        setLiveViewers(Object.keys(channel.presenceState()).length)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [allowed])

  useEffect(() => {
    if (!allowed) return
    let stopped = false
    let checking = false

    async function checkConnection() {
      if (stopped || checking) return
      if (!navigator.onLine) {
        setConnectionStatus('offline')
        return
      }

      checking = true
      setConnectionStatus(current => current === 'online' ? current : 'checking')
      try {
        const timeout = new Promise((_, reject) => {
          window.setTimeout(() => reject(new Error('Connection timed out')), 6000)
        })
        const databaseCheck = supabase.from('teams').select('id').limit(1)
        const websiteCheck = fetch(`/api/app-version?t=${Date.now()}`, { cache: 'no-store' })
        const [databaseResult, websiteResponse] = await Promise.race([
          Promise.all([databaseCheck, websiteCheck]),
          timeout
        ])
        if (databaseResult.error || !websiteResponse.ok) throw new Error('Connection check failed')
        if (!stopped) setConnectionStatus('online')
      } catch {
        if (!stopped) setConnectionStatus(navigator.onLine ? 'reconnecting' : 'offline')
      } finally {
        checking = false
      }
    }

    function handleOffline() { setConnectionStatus('offline') }
    function handleOnline() { setConnectionStatus('checking'); checkConnection() }
    function handleVisibility() {
      if (document.visibilityState === 'visible') checkConnection()
    }

    checkConnection()
    const interval = window.setInterval(checkConnection, 10000)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('focus', checkConnection)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stopped = true
      window.clearInterval(interval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('focus', checkConnection)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [allowed])

  async function refreshInsights() {
    if (insightsLoading) return
    setInsightsLoading(true)
    setInsightsError('')

    try {
      const { data } = await supabase.auth.getSession()
      const accessToken = data?.session?.access_token
      if (!accessToken) throw new Error('Your admin session has expired.')

      const response = await fetch('/api/admin/live-insights', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store'
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not load live insights.')

      setNotificationDevices(result.notificationDevices || 0)
      setInsightsUpdatedAt(new Date())
    } catch (error) {
      setInsightsError(error.message || 'Could not load live insights.')
    } finally {
      setInsightsLoading(false)
    }
  }

  function openInsights() {
    setInsightsOpen(true)
    refreshInsights()
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  if (!allowed) {
    return (
      <main
        style={{
          minHeight: '100vh',
          background: '#061a12',
          color: '#ffffff',
          display: 'grid',
          placeItems: 'center'
        }}
      >
        Checking control-panel access…
      </main>
    )
  }

  return (
    <>
      <style>{`@media (max-width: 760px) { .connection-label { display: none; } }`}</style>
      <div
  id="control-panel-header"
  style={{
          position: 'sticky',
          top: 0,
          zIndex: 1500,
          background: '#0b1f16',
          borderBottom: '1px solid #1c4932',
          padding: '8px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <div
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: 0
  }}
>
  <a
    href="/control"
    style={{
      color: '#f4c430',
      fontSize: '13px',
      fontWeight: '900',
      textDecoration: 'none'
    }}
  >
    SOH CONTROL PANEL
  </a>

  <a
    href="/control/results"
    style={{
      color: '#ffffff',
      fontSize: '12px',
      fontWeight: '800',
      textDecoration: 'none',
      borderLeft: '1px solid #52645b',
      paddingLeft: '12px'
    }}
  >
    Match Reports
  </a>
  <a
    href="/control/players"
    style={{
      color: '#ffffff',
      fontSize: '12px',
      fontWeight: '800',
      textDecoration: 'none'
    }}
  >
    Players
  </a>
</div>

        <div style={{ display: 'flex', gap: '7px', alignItems: 'center' }}>
        <div
          role="status"
          aria-live="polite"
          title={connectionStatus === 'online' ? 'Website and database connected' : connectionStatus === 'offline' ? 'This device is offline' : 'Checking the website and database connection'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            border: `1px solid ${connectionStatus === 'online' ? '#2f6f4e' : connectionStatus === 'offline' ? '#dc2626' : '#d69e2e'}`,
            borderRadius: '999px',
            padding: '6px 8px',
            color: '#ffffff',
            fontSize: '11px',
            fontWeight: '900',
            whiteSpace: 'nowrap'
          }}
        >
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: connectionStatus === 'online' ? '#22c55e' : connectionStatus === 'offline' ? '#ef4444' : '#f4c430', boxShadow: connectionStatus === 'online' ? '0 0 7px rgba(34,197,94,.8)' : 'none' }} />
          <span className="connection-label">
            {connectionStatus === 'online' ? 'Connected' : connectionStatus === 'offline' ? 'Offline' : 'Reconnecting'}
          </span>
        </div>
        <button
          type="button"
          onClick={openInsights}
          style={{
            background: '#174e35',
            border: '1px solid #2f6f4e',
            color: '#ffffff',
            borderRadius: '7px',
            padding: '7px 10px',
            fontWeight: '800',
            cursor: 'pointer'
          }}
        >
          Live Insights
        </button>
        <button
          type="button"
          onClick={signOut}
          style={{
            background: '#7f1d1d',
            border: '1px solid #dc2626',
            color: '#ffffff',
            borderRadius: '7px',
            padding: '7px 11px',
            fontWeight: '800',
            cursor: 'pointer'
          }}
        >
          Sign out
        </button>
        </div>
      </div>

      {children}

      {insightsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Live insights"
          onClick={() => setInsightsOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            display: 'grid', placeItems: 'center', padding: '20px',
            background: 'rgba(0,0,0,0.72)'
          }}
        >
          <section
            onClick={event => event.stopPropagation()}
            style={{
              width: 'min(420px, 100%)', boxSizing: 'border-box',
              padding: '22px', borderRadius: '18px', color: '#ffffff',
              background: '#0b281c', border: '1px solid #2f6f4e',
              boxShadow: '0 18px 60px rgba(0,0,0,0.45)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div>
                <small style={{ color: '#f4c430', fontWeight: '900' }}>CONTROL PANEL</small>
                <h2 style={{ margin: '4px 0 0' }}>Live Insights</h2>
              </div>
              <button type="button" onClick={() => setInsightsOpen(false)} aria-label="Close live insights" style={{ width: 'auto', padding: '8px 11px' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '20px 0' }}>
              <div style={{ padding: '18px 10px', borderRadius: '14px', textAlign: 'center', background: '#123524', border: '1px solid #2f6f4e' }}>
                <div style={{ fontSize: '34px', fontWeight: '900', color: '#f4c430' }}>{liveViewers}</div>
                <div style={{ fontSize: '14px', fontWeight: '800' }}>Viewing now</div>
              </div>
              <div style={{ padding: '18px 10px', borderRadius: '14px', textAlign: 'center', background: '#123524', border: '1px solid #2f6f4e' }}>
                <div style={{ fontSize: '34px', fontWeight: '900', color: '#f4c430' }}>{notificationDevices ?? '—'}</div>
                <div style={{ fontSize: '14px', fontWeight: '800' }}>Notifications enabled</div>
              </div>
            </div>

            <p style={{ color: '#b9c7be', fontSize: '13px', lineHeight: 1.45 }}>
              “Viewing now” is an approximate count of devices with the live page open. No names or personal details are collected.
            </p>
            {insightsError && <p style={{ color: '#ffb4b4', fontWeight: '700' }}>{insightsError}</p>}
            {insightsUpdatedAt && (
              <small style={{ display: 'block', marginBottom: '10px', color: '#b9c7be' }}>
                Updated at {insightsUpdatedAt.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}
              </small>
            )}
            <button type="button" onClick={refreshInsights} disabled={insightsLoading} style={{ background: '#16864a', color: '#fff' }}>
              {insightsLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </section>
        </div>
      )}
    </>
  )
}
