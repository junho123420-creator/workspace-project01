import { useEffect, useState } from 'react'
import { fmtDate, fmtSize } from '../api'
import { useApi } from '../hooks'
import { Badge, CopyButton, Pill, Table } from '../ui'

const TABS = ['세부 정보', '상태 및 경고', '모니터링', '보안', '네트워킹', '스토리지', '태그']

const COPYABLE = /ID|ARN|IPv4|DNS|AMI|IAM 역할|키 페어/

function KeyValue({ data }) {
  return (
    <dl className="kv">
      {Object.entries(data).map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>
            <span>{typeof v === 'boolean' ? (v ? '예' : '아니오') : v || '-'}</span>
            {COPYABLE.test(k) && v && v !== '-' && typeof v === 'string' && <CopyButton text={v} />}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function SshCommand({ keyName, ip, privateIp }) {
  if (!ip || ip === '-') {
    return <p className="muted">퍼블릭 IP가 없습니다. 같은 VPC 안에서 프라이빗 IP({privateIp})로 접속하세요.</p>
  }
  const cmd = `ssh -i ~/.ssh/${keyName && keyName !== '-' ? keyName : '<키페어>'}.pem ec2-user@${ip}`
  return (
    <>
      <h4>SSH 접속 명령</h4>
      <div className="cmd"><span>{cmd}</span><CopyButton text={cmd} /></div>
      <p className="muted">사용자 이름은 AMI에 따라 다릅니다(Amazon Linux: ec2-user, Ubuntu: ubuntu).</p>
    </>
  )
}

// ---------- 상태 및 경고 ----------
const CHECK = {
  ok: ['pass', '검사 통과'],
  impaired: ['fail', '검사 실패'],
  initializing: ['wait', '초기화 중'],
  'insufficient-data': ['wait', '데이터 부족'],
  'not-applicable': ['na', '해당 없음'],
}

function Check({ title, value }) {
  const [cls, label] = CHECK[value] ?? ['na', '-']
  return (
    <div className="check">
      <div className="check-title">{title}</div>
      <div className={`check-val ${cls}`}>
        <span className="dot" />{label}
      </div>
    </div>
  )
}

// ---------- 모니터링 ----------
function LineChart({ title, points, format }) {
  if (!points.length) {
    return (
      <div className="chart">
        <div className="chart-title">{title}</div>
        <div className="muted">최근 데이터가 없습니다.</div>
      </div>
    )
  }
  const W = 600, H = 150, PAD = 6
  const xs = points.map((p) => new Date(p.t).getTime())
  const vs = points.map((p) => p.v)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)]
  const max = Math.max(...vs, 1e-9)
  const px = (x) => PAD + ((x - x0) / (x1 - x0 || 1)) * (W - PAD * 2)
  const py = (v) => H - PAD - (v / max) * (H - PAD * 2)
  const line = points.map((p, i) => `${px(xs[i]).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ')
  const last = points[points.length - 1]
  const hhmm = (t) => new Date(t).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  return (
    <div className="chart">
      <div className="chart-title">
        {title}
        <span className="chart-last">최근 {format(last.v)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={title}>
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} className="axis" />
        <polygon points={`${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`} className="area" />
        <polyline points={line} className="line" fill="none" />
      </svg>
      <div className="chart-axis">
        <span>{hhmm(points[0].t)}</span>
        <span>최대 {format(max)}</span>
        <span>{hhmm(last.t)}</span>
      </div>
    </div>
  )
}

const pct = (v) => `${v.toFixed(1)}%`

// ---------- 본문 ----------
function Body({ tab, d }) {
  switch (tab) {
    case '세부 정보':
      return (
        <>
          <KeyValue data={{ 'Instance ID': d.id, ...d.details, '시작 시간': fmtDate(d.details['시작 시간']) }} />
          <SshCommand keyName={d.details['키 페어']} ip={d.networking['퍼블릭 IPv4']} privateIp={d.networking['프라이빗 IPv4']} />
        </>
      )
    case '상태 및 경고':
      return (
        <>
          <h4>상태 검사</h4>
          <div className="checks">
            <Check title="시스템 상태" value={d.status.system} />
            <Check title="인스턴스 상태" value={d.status.instance} />
            <Check title="EBS 상태" value={d.status.ebs} />
          </div>
          <p className="muted">인스턴스가 실행 중이 아니면 검사 결과가 &lsquo;해당 없음&rsquo;으로 나옵니다.</p>
        </>
      )
    case '모니터링':
      return (
        <>
          <p className="muted">최근 3시간, 5분 간격 (CloudWatch)</p>
          <LineChart title="CPU 사용률" points={d.monitoring.cpu} format={pct} />
          <LineChart title="네트워크 수신 (5분 합계)" points={d.monitoring.network_in} format={fmtSize} />
          <LineChart title="네트워크 송신 (5분 합계)" points={d.monitoring.network_out} format={fmtSize} />
        </>
      )
    case '보안':
      return (
        <>
          <KeyValue data={{ 'IAM 역할': d.security.iam_role, '키 페어': d.security.key_name }} />
          {d.security.groups.map((g) => (
            <div key={g.id}>
              <h4>{g.name} <span className="muted">({g.id})</span></h4>
              <Table title="인바운드 규칙" headers={['프로토콜', '포트', '소스']} rows={g.inbound.map((r) => [r.protocol, r.port, r.source])} />
              <Table title="아웃바운드 규칙" headers={['프로토콜', '포트', '대상']} rows={g.outbound.map((r) => [r.protocol, r.port, r.source])} />
            </div>
          ))}
        </>
      )
    case '네트워킹': {
      const { interfaces, ...rest } = d.networking
      return (
        <>
          <KeyValue data={rest} />
          <Table title="네트워크 인터페이스" headers={['ID', '프라이빗 IP', '서브넷', '상태']}
            rows={interfaces.map((n) => [n.id, n.private_ip, n.subnet, n.status])} />
        </>
      )
    }
    case '스토리지':
      return (
        <Table title="EBS 볼륨" headers={['볼륨 ID', '디바이스', '크기', '유형', 'IOPS', '암호화', '상태', '종료 시 삭제']}
          rows={d.storage.map((v) => [v.id, v.device, `${v.size} GiB`, v.type, v.iops, v.encrypted ? '예' : '아니오', v.state, v.delete_on_termination ? '예' : '아니오'])} />
      )
    case '태그':
      return <Table headers={['키', '값']} rows={d.tags.map((t) => [t.key, t.value])} />
    default:
      return null
  }
}

export default function Ec2Detail({ id, onClose }) {
  const [tab, setTab] = useState(TABS[0])
  const { data, error, loading } = useApi(`/ec2/${id}`)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="drawer-back" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-head">
          <div>
            <h3>{data?.name ?? id}{data?.mine && <Badge>내 것</Badge>}</h3>
            <div className="muted">{id}{data && <> · <Pill state={data.status.state} /></>}</div>
          </div>
          <button className="act" onClick={onClose} aria-label="닫기">닫기 ✕</button>
        </header>
        <nav className="dtabs">
          {TABS.map((t) => (
            <button key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>
          ))}
        </nav>
        <div className="drawer-body">
          {loading && <div className="muted">불러오는 중...</div>}
          {error && <div className="status error">조회 실패: {error}</div>}
          {data && <Body tab={tab} d={data} />}
        </div>
      </aside>
    </div>
  )
}
