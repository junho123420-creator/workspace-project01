// 백엔드 API 호출. /api 는 개발 서버(vite)가 백엔드로 프록시한다.
export async function api(path, params = {}, method = 'GET', body = undefined) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v))
  const url = '/api' + path + (qs.toString() ? '?' + qs : '')
  const res = await fetch(url, { method, body })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.detail || res.statusText)
  return data
}

export const fmtDate = (s) => new Date(s).toLocaleString('ko-KR')

export const fmtSize = (n) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`
