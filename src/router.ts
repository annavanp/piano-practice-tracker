import { useEffect, useState } from 'react'

export type Route = { name: 'library' } | { name: 'practice'; id: string } | { name: 'setup'; id: string }

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'piece' && parts[1]) {
    if (parts[2] === 'setup') return { name: 'setup', id: parts[1] }
    return { name: 'practice', id: parts[1] }
  }
  return { name: 'library' }
}

export function navigate(route: Route): void {
  let hash = '#/'
  if (route.name === 'practice') hash = `#/piece/${route.id}`
  if (route.name === 'setup') hash = `#/piece/${route.id}/setup`
  if (window.location.hash === hash) return
  window.location.hash = hash
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
