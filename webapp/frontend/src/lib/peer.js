export function normalizePeerBaseUrl(input, defaultPort = 3001) {
  const trimmed = String(input || '').trim()
  if (!trimmed) return ''

  try {
    const hasScheme = /^https?:\/\//i.test(trimmed)
    const url = new URL(hasScheme ? trimmed : `http://${trimmed}`)

    if (!hasScheme && !url.port) {
      url.port = String(defaultPort)
    }

    url.pathname = ''
    url.search = ''
    url.hash = ''

    return url.origin
  } catch {
    return ''
  }
}

export function peerApiUrl(baseUrl, path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${cleanPath}`
}


export function getPeerBaseUrlFromLocation() {
  if (typeof window === 'undefined') return ''
  try {
    const params = new URLSearchParams(window.location.search)
    return normalizePeerBaseUrl(params.get('peer'))
  } catch {
    return ''
  }
}

export function resolveApiUrl(url) {
  if (/^https?:\/\//i.test(url)) return url
  const peerBaseUrl = getPeerBaseUrlFromLocation()
  if (peerBaseUrl && url.startsWith('/api/')) {
    return peerApiUrl(peerBaseUrl, url)
  }
  return url
}
