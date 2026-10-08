import { useState } from 'react'
import { fmtDate } from '../api'
import { useApi } from '../hooks'
import { Cp, Name, Page, SearchForm, Status, Table, sortCell } from '../ui'

// 응답의 목록(배열)들에서 내 것(mine)만 남긴다.
function onlyMine(d) {
  const out = { ...d }
  for (const [k, v] of Object.entries(d)) if (Array.isArray(v)) out[k] = v.filter((r) => r.mine)
  out.count = Object.values(out).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0)
  return out
}

function ReadOnlyPage({ title, desc, path, placeholder, children }) {
  const [q, setQ] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const { data, error, loading } = useApi(path, { keyword: q })
  const d = data && (mineOnly ? onlyMine(data) : data)
  return (
    <Page title={title} desc={desc}>
      <SearchForm placeholder={placeholder} onSearch={setQ}>
        <label className="chk">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> 내 것만
        </label>
      </SearchForm>
      <Status loading={loading} error={error}>{d?.count ?? 0}개 (조회 전용)</Status>
      {d && children(d)}
    </Page>
  )
}

const marks = (rows) => rows.map((r) => r.mine)

export function Vpc() {
  return (
    <ReadOnlyPage title="VPC" desc="VPC, 서브넷, 보안 그룹 (조회 전용)" path="/vpc" placeholder="이름, ID, CIDR 검색">
      {(d) => (
        <>
          <Table title="VPC" headers={['Name', 'VpcId', 'CIDR', 'State', 'Default']} marks={marks(d.vpcs)}
            rows={d.vpcs.map((v) => [<Name key="n" text={v.name} mine={v.mine} />, <Cp key="id" text={v.id} />, v.cidr, v.state, v.default ? '예' : '-'])} />
          <Table title="Subnet" headers={['Name', 'SubnetId', 'VpcId', 'CIDR', 'AZ', '자동 Public IP']} marks={marks(d.subnets)}
            rows={d.subnets.map((x) => [<Name key="n" text={x.name} mine={x.mine} />, <Cp key="id" text={x.id} />, <Cp key="vpc" text={x.vpc_id} />, x.cidr, x.az, x.public_ip_on_launch ? '예' : '-'])} />
          <Table title="Security Group" headers={['Name', 'GroupId', 'VpcId', '설명', 'Inbound', 'Outbound']} marks={marks(d.security_groups)}
            rows={d.security_groups.map((g) => [<Name key="n" text={g.name} mine={g.mine} />, <Cp key="id" text={g.id} />, <Cp key="vpc" text={g.vpc_id} />, g.description, g.inbound_rules, g.outbound_rules])} />
        </>
      )}
    </ReadOnlyPage>
  )
}

export function CloudFront() {
  return (
    <ReadOnlyPage title="CloudFront" desc="배포 목록 (조회 전용)" path="/cloudfront" placeholder="ID, 도메인, 설명 검색">
      {(d) => (
        <Table headers={['Id', 'Domain', 'Aliases', 'Origins', 'Status', 'Enabled', 'Comment']} marks={marks(d.items)}
          rows={d.items.map((x) => [<Name key="n" text={x.id} mine={x.mine} />, <Cp key="dom" text={x.domain} />, x.aliases, x.origins, x.status, x.enabled ? '예' : '아니오', x.comment])} />
      )}
    </ReadOnlyPage>
  )
}

export function Iam() {
  return (
    <ReadOnlyPage title="IAM" desc="사용자와 역할 (조회 전용)" path="/iam" placeholder="이름, ARN 검색">
      {(d) => (
        <>
          <Table title="User" headers={['Name', 'ARN', 'Created', '마지막 로그인']} marks={marks(d.users)}
            rows={d.users.map((u) => [<Name key="n" text={u.name} mine={u.mine} />, <Cp key="arn" text={u.arn} />, sortCell(u.created, fmtDate(u.created)), u.last_used ? sortCell(u.last_used, fmtDate(u.last_used)) : '-'])} />
          <Table title="Role" headers={['Name', 'ARN', 'Created', '설명']} marks={marks(d.roles)}
            rows={d.roles.map((r) => [<Name key="n" text={r.name} mine={r.mine} />, <Cp key="arn" text={r.arn} />, sortCell(r.created, fmtDate(r.created)), r.description])} />
        </>
      )}
    </ReadOnlyPage>
  )
}
