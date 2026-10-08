import { useApi } from '../hooks'
import { Cp, Page, Pill, Status, Table } from '../ui'

function Stat({ title, total, lines, mine, onClick }) {
  return (
    <button className={`stat ${total === undefined ? 'na' : ''}`} onClick={onClick}>
      <div className="stat-title">{title}</div>
      <div className="stat-num">{total ?? '-'}</div>
      <div className="stat-sub">
        {lines?.map((l) => <span key={l}>{l}</span>)}
        {mine !== undefined && <span className="mine-n">내 것 {mine}</span>}
      </div>
    </button>
  )
}

export default function Home({ go }) {
  const { data: d, error, loading } = useApi('/summary')
  const ec2 = d?.ec2
  const running = ec2?.states?.running ?? 0

  return (
    <Page title="홈" desc="계정 전체 현황과 내 리소스 요약입니다. 카드를 누르면 해당 서비스로 이동합니다.">
      <Status loading={loading} error={error}>{d && '카드의 “내 것”은 이름에 내 ID가 들어간 리소스 개수입니다.'}</Status>
      {d && (
        <div style={{ padding: '0 16px 4px' }}>
          <div className="stats">
            <Stat title="EC2 인스턴스" total={ec2?.total}
              lines={ec2 && [`실행 중 ${running}`, `기타 ${ec2.total - running}`]} mine={ec2?.mine} onClick={() => go('ec2')} />
            <Stat title="S3 버킷" total={d.s3?.total} mine={d.s3?.mine} onClick={() => go('s3')} />
            <Stat title="VPC" total={d.vpc?.vpcs.total}
              lines={d.vpc && [`서브넷 ${d.vpc.subnets.total}`, `보안 그룹 ${d.vpc.security_groups.total}`]}
              mine={d.vpc?.vpcs.mine} onClick={() => go('vpc')} />
            <Stat title="CloudFront" total={d.cloudfront?.total} mine={d.cloudfront?.mine} onClick={() => go('cloudfront')} />
            <Stat title="IAM" total={d.iam?.users.total}
              lines={d.iam && [`사용자 ${d.iam.users.total}`, `역할 ${d.iam.roles.total}`]}
              mine={d.iam && d.iam.users.mine + d.iam.roles.mine} onClick={() => go('iam')} />
          </div>
        </div>
      )}
      {ec2 && (
        <Table title="내 인스턴스" headers={['Name', 'InstanceId', 'Type', 'State', 'PublicIP']}
          rows={ec2.my_instances.map((i) => [i.name, <Cp key="id" text={i.instance_id} />, i.type, <Pill key="s" state={i.state} />, <Cp key="ip" text={i.public_ip} />])} />
      )}
    </Page>
  )
}
