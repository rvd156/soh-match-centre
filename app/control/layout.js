'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function ControlLayout({ children }) {
  const router = useRouter()
  const [allowed, setAllowed] = useState(false)

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
</div>

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

      {children}
    </>
  )
}
