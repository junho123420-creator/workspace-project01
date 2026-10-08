import { Fragment, useEffect, useState } from 'react'
import { api } from '../api'
import { useApi } from '../hooks'
import { Badge, Cp, Dash, Page, Pill, SearchForm, Status, Table } from '../ui'
import Ec2Detail from './Ec2Detail'

const LABEL = { start: '시작', stop: '중지', reboot: '재부팅' }
const TRANSIENT = ['pending', 'stopping', 'shutting-down']

function Actions({ item, onAct }) {
  const btn = (act) => (
    <button key={act} className={`act ${act === 'stop' ? 'danger' : ''}`} onClick={() => onAct(item, act)}>
      {LABEL[act]}
    </button>
  )
  if (item.state === 'running') return <>{btn('stop')}{btn('reboot')}</>
  if (item.state === 'stopped') return btn('start')
  return <span className="muted">대기</span>
}

export default function Ec2() {
  const [q, setQ] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [stateFilter, setStateFilter] = useState('all')
  const [note, setNote] = useState('')
  const [selected, setSelected] = useState(null)
  const { data, error, loading, reload } = useApi('/ec2', { keyword: q })

  const base = (data?.items ?? []).filter((i) => !mineOnly || i.mine)
  const items = base.filter((i) => stateFilter === 'all' || i.state === stateFilter)
  const changing = base.some((i) => TRANSIENT.includes(i.state))

  // 상태별 개수 (칩에 표시)
  const counts = base.reduce((m, i) => ({ ...m, [i.state]: (m[i.state] ?? 0) + 1 }), {})
  const chips = [['all', '전체', base.length], ...Object.entries(counts).map(([s, n]) => [s, s, n])]

  // 시작/중지 중인 인스턴스가 있으면 4초마다 자동 새로고침
  useEffect(() => {
    if (!changing) return
    const t = setTimeout(() => reload(true), 4000)
    return () => clearTimeout(t)
  }, [changing, data, reload])

  async function act(item, action) {
    if (!confirm(`${item.name}\n인스턴스를 ${LABEL[action]}할까요?`)) return
    try {
      await api(`/ec2/${item.instance_id}/${action}`, {}, 'POST')
      setNote(`${item.name}: ${LABEL[action]} 요청됨`)
      setTimeout(() => reload(true), 1500)
    } catch (e) {
      alert('실패: ' + e.message)
    }
  }

  const rows = items.map((i) => [
    <Fragment key="name">
      <button className="link" onClick={() => setSelected(i.instance_id)}>{i.name}</button>
      {i.mine && <Badge>내 것</Badge>}
    </Fragment>,
    <Cp key="id" text={i.instance_id} />,
    i.type,
    <Pill key="state" state={i.state} />,
    i.az,
    <Cp key="pri" text={i.private_ip} />,
    <Cp key="pub" text={i.public_ip} />,
    i.mine ? <Actions key="act" item={i} onAct={act} /> : <Dash key="act" />,
  ])

  return (
    <Page title="EC2 인스턴스" desc="서버 목록과 상태. 이름을 누르면 상세 정보가 열립니다. 내 인스턴스는 시작·중지·재부팅할 수 있습니다.">
      <SearchForm placeholder="이름, ID, 타입, 상태, AZ, IP 검색" onSearch={setQ}>
        <label className="chk">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> 내 것만
        </label>
        <button className="btn ghost" type="button" onClick={() => reload()}>새로고침</button>
      </SearchForm>
      <div className="chips">
        {chips.map(([key, label, n]) => (
          <button key={key} className={`chip ${stateFilter === key ? 'active' : ''}`} onClick={() => setStateFilter(key)}>
            {label}<b>{n}</b>
          </button>
        ))}
      </div>
      <Status loading={loading} error={error}>
        {items.length}개{changing && ' · 상태 변경 중 — 4초마다 자동 새로고침'}
        {note && ` · ${note}`}
      </Status>
      {selected && <Ec2Detail id={selected} onClose={() => setSelected(null)} />}
      <Table headers={['Name', 'InstanceId', 'Type', 'State', 'AZ', 'PrivateIP', 'PublicIP', '제어']} rows={rows} marks={items.map((i) => i.mine)} />
    </Page>
  )
}
