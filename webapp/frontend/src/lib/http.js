export async function fetchJson(url, options = {}) {
  const res = await fetch(url, options)
  const contentType = res.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')

  let data = null
  let text = ''
  if (isJson) {
    data = await res.json().catch(() => null)
  } else {
    text = await res.text().catch(() => '')
    data = text ? { text } : null
  }

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && (data.error || data.message)) ||
      text ||
      res.statusText ||
      'Request failed'
    const error = new Error(message)
    error.status = res.status
    error.data = data
    throw error
  }

  return data || {}
}
