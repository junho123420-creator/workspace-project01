import { Fragment, useRef, useState } from 'react'
import { api, fmtDate, fmtSize } from '../api'
import { useApi } from '../hooks'
import { Badge, Cp, Dash, Page, SearchForm, Status, Table, sortCell } from '../ui'

export default function S3() {
  const [bucket, setBucket] = useState(null)
  const [q, setQ] = useState('')
  const [prefix, setPrefix] = useState('')
  const fileRef = useRef(null)

  const path = bucket ? `/s3/buckets/${encodeURIComponent(bucket)}/objects` : '/s3/buckets'
  const { data, error, loading, reload } = useApi(path, bucket ? { keyword: q, prefix } : { keyword: q })
  const items = data?.items ?? []
  const mine = bucket && data?.mine

  function open(name) {
    setBucket(name)
    setQ('')
    setPrefix('')
  }

  async function remove(key) {
    if (!confirm(`${key}\n객체를 삭제할까요? 되돌릴 수 없습니다.`)) return
    try {
      await api(path, { key }, 'DELETE')
      reload()
    } catch (e) {
      alert('실패: ' + e.message)
    }
  }

  async function upload(e) {
    e.preventDefault()
    const file = fileRef.current?.files[0]
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    try {
      await api(path, { prefix }, 'POST', fd)
      fileRef.current.value = ''
      reload()
    } catch (err) {
      alert('업로드 실패: ' + err.message)
    }
  }

  const headers = bucket ? ['Key', 'Size', 'LastModified', '제어'] : ['Bucket', 'Region', 'Created']
  const rows = bucket
    ? items.map((o) => [
        <Cp key="key" text={o.key} />,
        sortCell(o.size, fmtSize(o.size)),
        sortCell(o.last_modified, fmtDate(o.last_modified)),
        mine ? (
          <Fragment key="act">
            <a className="act" href={`/api/s3/buckets/${encodeURIComponent(bucket)}/download?key=${encodeURIComponent(o.key)}`}>
              다운로드
            </a>
            <button className="act danger" onClick={() => remove(o.key)}>삭제</button>
          </Fragment>
        ) : (
          <Dash key="act" />
        ),
      ])
    : items.map((b) => [
        <Fragment key="name">
          <button className="link" onClick={() => open(b.name)}>{b.name}</button>
          {b.mine && <Badge>내 것</Badge>}
        </Fragment>,
        b.region,
        sortCell(b.created, fmtDate(b.created)),
      ])

  return (
    <Page title="S3" desc="버킷과 객체. 내 버킷은 업로드·다운로드·삭제할 수 있습니다.">
      <SearchForm key={bucket ?? ''} placeholder={bucket ? '객체 키 검색' : '버킷 이름 검색'} onSearch={setQ}>
        {bucket && (
          <input type="text" placeholder="경로(prefix) 예: static/" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
        )}
      </SearchForm>
      {bucket && (
        <div className="crumb">
          <button className="link" onClick={() => open(null)}>← 버킷 목록</button> / {bucket}
        </div>
      )}
      {mine && (
        <form onSubmit={upload}>
          <input type="file" ref={fileRef} />
          <button className="btn" type="submit">업로드</button>
        </form>
      )}
      <Status loading={loading} error={error}>
        {items.length}개{!bucket && ' — 버킷 이름을 누르면 객체를 볼 수 있습니다.'}
      </Status>
      <Table headers={headers} rows={rows} marks={bucket ? [] : items.map((b) => b.mine)} />
    </Page>
  )
}
