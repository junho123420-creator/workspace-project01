import { useCallback, useEffect, useState } from 'react'
import { api } from './api'

// GET API를 조회하고 결과/오류/로딩을 관리한다. params가 바뀌면 자동으로 다시 조회한다.
export function useApi(path, params = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const key = JSON.stringify(params)

  const load = useCallback(
    async (silent = false) => {
      if (silent !== true) setLoading(true)
      try {
        setData(await api(path, JSON.parse(key)))
        setError('')
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    },
    [path, key],
  )

  useEffect(() => {
    load()
  }, [load])

  return { data, error, loading, reload: load }
}
