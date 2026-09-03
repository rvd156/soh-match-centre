'use client'

import { useEffect } from 'react'

const versionStorageKey = 'soh-match-centre-version'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    let checking = false
    let stopped = false

    async function checkForUpdate() {
      if (
        stopped ||
        checking ||
        document.visibilityState !== 'visible' ||
        !window.location.pathname.startsWith('/live')
      ) return

      checking = true

      try {
        const response = await fetch(`/api/app-version?t=${Date.now()}`, {
          cache: 'no-store'
        })
        if (!response.ok) return

        const { version } = await response.json()
        if (!version || version === 'local') return

        const previousVersion = localStorage.getItem(versionStorageKey)
        localStorage.setItem(versionStorageKey, version)

        if (previousVersion && previousVersion !== version) {
          window.location.reload()
        }
      } catch {
        // A temporary connection problem can wait for the next check.
      } finally {
        checking = false
      }
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => registration.update())
        .catch(error => {
          console.error('Service worker registration failed:', error)
        })
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') checkForUpdate()
    }

    checkForUpdate()
    window.addEventListener('focus', checkForUpdate)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    const interval = window.setInterval(checkForUpdate, 60000)

    return () => {
      stopped = true
      window.clearInterval(interval)
      window.removeEventListener('focus', checkForUpdate)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return null
}
