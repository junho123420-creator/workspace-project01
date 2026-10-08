import { useEffect, useState } from 'react'
import { api } from './api'
import Ec2 from './pages/Ec2'
import Home from './pages/Home'
import S3 from './pages/S3'
import { CloudFront, Iam, Vpc } from './pages/ReadOnly'

const TABS = [
  { id: 'home', label: '홈', icon: 'HM', Page: Home },
  { id: 'ec2', label: 'EC2', icon: 'EC', Page: Ec2 },
  { id: 's3', label: 'S3', icon: 'S3', Page: S3 },
  { id: 'vpc', label: 'VPC', icon: 'VP', Page: Vpc },
  { id: 'cloudfront', label: 'CloudFront', icon: 'CF', Page: CloudFront },
  { id: 'iam', label: 'IAM', icon: 'IA', Page: Iam },
]

export default function App() {
  const [tab, setTab] = useState('home')
  const [meta, setMeta] = useState(null)
  const { Page } = TABS.find((t) => t.id === tab)

  useEffect(() => {
    api('/health').then(setMeta).catch(() => {})
  }, [])

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">AWS 콘솔<small>조회 · 제어</small></div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${t.id === tab ? 'active' : ''}`} onClick={() => setTab(t.id)}>
              <i>{t.icon}</i>{t.label}
            </button>
          ))}
        </nav>
        <div id="meta">
          {meta ? <>profile: {meta.profile}<br />region: {meta.region}</> : '백엔드 연결 안 됨'}
        </div>
      </aside>
      <main className="main">
        <Page go={setTab} />
      </main>
    </div>
  )
}
