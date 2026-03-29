// features/domain/components/HelpDrawer.tsx
// Right-side slide-in help panel for the Cloudflare domain setup wizard.
import { createPortal } from 'react-dom';
import { useI18n } from '../../../i18n/useI18n.js';
import { HELP_CONTENT_EN } from '../../../i18n/en-help.js';

interface HelpItem {
  title: string;
  what: string;
  howToGet: Array<{ step: string; detail?: string }>;
  note?: string;
  link: string;
  linkLabel: string;
}

const HELP_CONTENT: Record<string, HelpItem> = {
  'api-token': {
    title: 'Cloudflare API Token',
    what:
      'API Token은 Brewnet이 Cloudflare API를 통해 터널 생성 및 DNS 레코드를 자동으로 관리할 수 있는 인증 키입니다. ' +
      '계정 전체 권한의 Global API Key와 달리, 특정 작업에만 범위가 제한된 안전한 토큰입니다.',
    howToGet: [
      { step: '우측 상단 프로필 아이콘 클릭 → 「My Profile」 → 좌측 메뉴 「API Tokens」 클릭' },
      { step: '「Create Token」 버튼 클릭 → 목록 맨 아래 「Custom token」 행에서 「Get started」 클릭' },
      { step: 'Token Name 입력 (예: brewnet)' },
      {
        step: 'Permissions — 권한 1 : 터널 생성·관리',
        detail:
          '① 첫 번째 드롭다운 → Account 선택\n' +
          '② 두 번째 드롭다운 → Cloudflare Tunnel 선택\n' +
          '③ 세 번째 드롭다운 → Edit 선택',
      },
      {
        step: '「+ Add more」 클릭 → 권한 2 : DNS 레코드 자동 생성',
        detail:
          '① 첫 번째 드롭다운 → Zone 선택\n' +
          '② 두 번째 드롭다운 → DNS 선택\n' +
          '③ 세 번째 드롭다운 → Edit 선택',
      },
      {
        step: '「+ Add more」 클릭 → 권한 3 : 도메인 목록 조회',
        detail:
          '① 첫 번째 드롭다운 → Zone 선택\n' +
          '② 두 번째 드롭다운 → Zone 선택  ← 두 번째 드롭다운도 Zone\n' +
          '③ 세 번째 드롭다운 → Read 선택',
      },
      {
        step: 'Zone Resources — 토큰을 적용할 도메인 범위 지정',
        detail:
          '「Include」→「All zones from an account」→ 본인 계정 선택\n\n' +
          '특정 도메인만 허용하려면:\n' +
          '「Include」→「Specific zone」→ 사용할 도메인 선택',
      },
      { step: '「Continue to summary」 → 「Create Token」 클릭 → 표시된 토큰 즉시 복사' },
    ],
    note: '토큰은 생성 직후 한 번만 표시됩니다. 창을 닫으면 다시 확인할 수 없으니 반드시 복사 후 안전한 곳에 보관하세요.',
    link: 'https://dash.cloudflare.com/profile/api-tokens',
    linkLabel: 'Cloudflare API Tokens 페이지 열기 →',
  },

  'zone': {
    title: 'Domain (Zone)',
    what:
      'Cloudflare Zone은 Cloudflare에서 관리 중인 도메인(예: example.com)을 의미합니다. ' +
      'API Token이 유효하면 계정에 등록된 모든 도메인이 자동으로 목록에 불러와집니다.',
    howToGet: [
      {
        step: '도메인이 없는 경우',
        detail: 'Cloudflare Registrar에서 직접 구매하거나, 다른 업체(가비아, AWS 등)에서 구매 후 네임서버를 Cloudflare로 이전하세요.',
      },
      {
        step: '이미 Cloudflare에 도메인이 있는 경우',
        detail: '「Load Domains」를 누르면 자동으로 선택 목록에 표시됩니다.',
      },
      {
        step: '도메인 상태(Active/Pending)',
        detail: 'Pending 상태는 네임서버 변경이 아직 적용 중임을 의미합니다. Active 상태가 되어야 DNS 레코드 생성이 가능합니다.',
      },
    ],
    link: 'https://dash.cloudflare.com/',
    linkLabel: 'Cloudflare 대시보드에서 도메인 확인 →',
  },

  'subdomain': {
    title: 'Subdomain',
    what:
      '서브도메인은 도메인 앞에 붙는 접두사입니다. 예를 들어 앱 이름이 "my-blog"이면 ' +
      'my-blog.example.com 으로 외부에서 접근할 수 있게 됩니다. 서브도메인마다 Cloudflare에 ' +
      'CNAME DNS 레코드가 자동으로 생성되며, Tunnel 인그레스 규칙도 함께 추가됩니다.',
    howToGet: [
      {
        step: '앱 이름 기반으로 자동 입력됩니다',
        detail: '예: 앱 이름이 "nodejs-express"이면 "nodejs-express"로 자동 제안됩니다.',
      },
      {
        step: '규칙: 영문 소문자, 숫자, 하이픈(-)만 허용',
        detail: '대문자, 언더스코어(_), 공백은 사용 불가. 하이픈으로 시작하거나 끝날 수 없습니다.',
      },
      {
        step: '중복 확인',
        detail: '같은 도메인에 동일한 서브도메인이 이미 다른 앱에 연결되어 있으면 오류가 발생합니다.',
      },
    ],
    note: '연결 후 DNS 전파에 최대 수 분이 걸릴 수 있습니다. Cloudflare는 보통 즉시 반영됩니다.',
    link: 'https://dash.cloudflare.com/',
    linkLabel: 'Cloudflare DNS 레코드 확인 →',
  },

  'cloudflare-setup': {
    title: 'Cloudflare Tunnel 설정 가이드',
    what:
      'Cloudflare Tunnel을 사용하면 공인 IP나 포트 포워딩 없이 홈 서버의 앱을 외부 도메인(예: myapp.example.com)으로 안전하게 공개할 수 있습니다. ' +
      '설정은 최초 1회만 필요하며, 이후 앱마다 서브도메인만 연결하면 됩니다.',
    howToGet: [
      {
        step: 'Step 1 — API Token 발급 및 검증',
        detail:
          'My Profile → API Tokens → Create Token → Custom token → Get started\n\n' +
          '권한 3개 추가 (각 행: 카테고리 → 서비스 → 레벨):\n' +
          '  Account  →  Cloudflare Tunnel  →  Edit\n' +
          '  Zone     →  DNS                →  Edit\n' +
          '  Zone     →  Zone               →  Read\n\n' +
          'Zone Resources:\n' +
          '  Include → All zones from an account → 본인 계정 선택',
      },
      {
        step: 'Step 2 — Zone(도메인) 선택',
        detail: 'API Token이 검증되면 계정에 등록된 도메인이 자동으로 불러와집니다. 사용할 도메인을 선택하세요.',
      },
      {
        step: 'Step 3 — Tunnel 생성',
        detail: '이름을 입력하고 Create Tunnel을 클릭하면 Cloudflare에 터널이 자동으로 생성됩니다.',
      },
      {
        step: 'Step 4 — 앱별 서브도메인 연결',
        detail: '설정 완료 후 각 앱의 Domain 탭에서 서브도메인을 입력하고 Connect를 클릭하면 DNS 레코드가 자동 생성됩니다.',
      },
    ],
    note: 'Cloudflare 계정과 도메인이 없다면 먼저 가입하고 도메인을 Cloudflare로 이전해야 합니다.',
    link: 'https://dash.cloudflare.com/',
    linkLabel: 'Cloudflare 대시보드 열기 →',
  },

  'tunnel-name': {
    title: 'Tunnel Name',
    what:
      'Cloudflare Tunnel은 공인 IP나 포트 포워딩 없이 로컬 서버를 안전하게 외부에 노출하는 기술입니다. ' +
      '터널 이름은 Cloudflare Zero Trust 대시보드에서 이 연결을 식별하는 레이블로 사용됩니다.',
    howToGet: [
      { step: '이름은 프로젝트명을 기반으로 자동 입력됩니다. 그대로 사용하거나 원하는 이름으로 변경하세요.' },
      {
        step: '이름 규칙',
        detail: '영문 소문자, 숫자, 하이픈(-)만 사용 가능. Cloudflare 계정 내에서 고유해야 합니다.',
      },
      {
        step: '생성 후 확인 위치',
        detail: 'Cloudflare Zero Trust 대시보드 → Networks → Tunnels에서 생성된 터널과 상태를 확인할 수 있습니다.',
      },
    ],
    note: '동일한 이름의 터널이 이미 있으면 오류가 발생합니다. 기존 터널을 삭제하거나 다른 이름을 사용하세요.',
    link: 'https://one.dash.cloudflare.com/',
    linkLabel: 'Cloudflare Zero Trust에서 터널 확인 →',
  },
};

interface HelpDrawerProps {
  helpKey: string | null;
  onClose: () => void;
}

export function HelpDrawer({ helpKey, onClose }: HelpDrawerProps) {
  const { locale } = useI18n();
  const dict = locale === 'en' ? HELP_CONTENT_EN : HELP_CONTENT;
  const item = helpKey ? (dict[helpKey] ?? null) : null;
  const isOpen = !!item;

  return createPortal(
    <>
      {/* Backdrop — click to close */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9000,
          pointerEvents: isOpen ? 'all' : 'none',
          background: 'transparent',
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          height: '100vh',
          width: 320,
          zIndex: 9001,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg1)',
          borderLeft: '1px solid var(--bdr)',
          boxShadow: isOpen ? '-12px 0 40px rgba(0,0,0,0.6)' : 'none',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 18px',
          borderBottom: '1px solid var(--bdr)',
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', fontFamily: 'var(--mono)', marginBottom: 3 }}>
              HELP
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--txt)' }}>
              {item?.title ?? ''}
            </div>
          </div>
          <button
            className="xbtn"
            onClick={onClose}
            aria-label="Close help"
            style={{ flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        {/* Drawer body */}
        <div style={{ overflowY: 'auto', padding: '20px 18px', display: 'flex', flexDirection: 'column', gap: 20, flex: 1 }}>
          {item && (
            <>
              {/* What is it */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#ffffff', fontFamily: 'var(--mono)', letterSpacing: '0.06em', marginBottom: 8 }}>
                  이게 뭔가요?
                </div>
                <p style={{ fontSize: 13, color: '#c8d4e8', lineHeight: 1.7, margin: 0 }}>
                  {item.what}
                </p>
              </div>

              {/* How to get */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#ffffff', fontFamily: 'var(--mono)', letterSpacing: '0.06em', marginBottom: 10 }}>
                  어디서 가져오나요?
                </div>
                <ol style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {item.howToGet.map((s, i) => (
                    <li key={i} style={{ fontSize: 13, color: '#c8d4e8', lineHeight: 1.6 }}>
                      <span style={{ fontWeight: 600, color: '#4db8a8' }}>{s.step}</span>
                      {s.detail && (
                        <div style={{
                          marginTop: 5,
                          padding: '6px 10px',
                          background: 'var(--bg2)',
                          border: '1px solid var(--bdr)',
                          borderRadius: 'var(--r)',
                          fontSize: 12,
                          color: '#a8bdd4',
                          fontFamily: 'var(--mono)',
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.6,
                        }}>
                          {s.detail}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Note */}
              {item.note && (
                <div style={{
                  padding: '10px 12px',
                  borderRadius: 'var(--r)',
                  background: 'rgba(232,168,73,0.07)',
                  border: '1px solid rgba(232,168,73,0.2)',
                  fontSize: 12,
                  color: 'var(--amber)',
                  lineHeight: 1.6,
                }}>
                  ⚠ {item.note}
                </div>
              )}

              {/* Cloudflare link */}
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 14px',
                  borderRadius: 'var(--r)',
                  background: 'rgba(61,214,200,0.07)',
                  border: '1px solid rgba(61,214,200,0.2)',
                  color: 'var(--teal)',
                  textDecoration: 'none',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <span>↗</span>
                {item.linkLabel}
              </a>
            </>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
