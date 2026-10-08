import { isValidElement, useState } from 'react'

export function Page({ title, desc, children }) {
  return (
    <section>
      <div className="page-head">
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      <div className="card">{children}</div>
    </section>
  )
}

export function SearchForm({ placeholder, onSearch, children }) {
  const [text, setText] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSearch(text.trim())
      }}
    >
      <input type="text" value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} />
      {children}
      <button className="btn" type="submit">검색</button>
    </form>
  )
}

export function Status({ loading, error, children }) {
  if (error) return <div className="status error">조회 실패: {error}</div>
  return <div className="status">{loading ? '조회 중...' : children}</div>
}

// ---------- 복사 ----------
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // http://IP 접속처럼 보안 컨텍스트가 아니면 clipboard API를 쓸 수 없어 임시 textarea로 대체
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

export function CopyButton({ text, label = '복사' }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className={`copy ${done ? 'done' : ''}`}
      title={`${text} 복사`}
      onClick={async (e) => {
        e.stopPropagation()
        await copyText(String(text))
        setDone(true)
        setTimeout(() => setDone(false), 1200)
      }}
    >
      {done ? '복사됨' : label}
    </button>
  )
}

// 값 + 복사 버튼. 값이 없으면 '-'
export function Cp({ text }) {
  if (text === null || text === undefined || text === '' || text === '-') return <span className="muted">-</span>
  return (
    <span className="cp">
      <span>{text}</span>
      <CopyButton text={text} />
    </span>
  )
}

// ---------- 정렬 가능한 표 ----------
// 셀은 문자열/숫자/React 요소. 정렬 기준이 표시값과 다르면 sortCell(기준값, 표시) 로 감싼다.
export const sortCell = (sort, node) => ({ __sort: sort, node })
const isSortCell = (c) => c && typeof c === 'object' && '__sort' in c

function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (isSortCell(node)) return node.__sort
  if (typeof node === 'string' || typeof node === 'number') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement(node)) {
    const p = node.props
    if (p.text !== undefined) return p.text
    if (p.state !== undefined) return p.state
    return textOf(p.children)
  }
  return ''
}

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' })
const NO_SORT = ['제어']

export function Table({ title, headers, rows, marks = [] }) {
  const [sort, setSort] = useState(null) // { col, dir }

  let order = rows.map((_, i) => i)
  if (sort) {
    const val = (i) => textOf(rows[i][sort.col])
    order = [...order].sort((a, b) => {
      const [x, y] = [val(a), val(b)]
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y))
      return sort.dir === 'asc' ? r : -r
    })
  }

  const click = (col) =>
    setSort((s) => (!s || s.col !== col ? { col, dir: 'asc' } : s.dir === 'asc' ? { col, dir: 'desc' } : null))

  return (
    <>
      {title && <h3 className="sub">{title} ({rows.length})</h3>}
      <div className="scroll">
        <table>
          <thead>
            <tr>
              {headers.map((h, c) =>
                NO_SORT.includes(h) ? (
                  <th key={h}>{h}</th>
                ) : (
                  <th key={h} className="sortable" onClick={() => click(c)} aria-sort={sort?.col === c ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    {h}
                    <span className="arrow">{sort?.col === c ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              order.map((i) => (
                <tr key={i} className={marks[i] ? 'mine' : ''}>
                  {rows[i].map((c, j) => (
                    <td key={j}>{(isSortCell(c) ? c.node : c) ?? '-'}</td>
                  ))}
                </tr>
              ))
            ) : (
              <tr><td className="empty" colSpan={headers.length}>결과가 없습니다.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

export const Pill = ({ state }) => <span className={`pill ${state}`}>{state}</span>
export const Name = ({ text, mine }) => (
  <>{text}{mine && <Badge>내 것</Badge>}</>
)
export const Badge = ({ children }) => <span className="badge">{children}</span>
export const Dash = () => <span className="muted">-</span>
