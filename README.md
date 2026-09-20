# TRUST404 — 검증 가능한 에이전트 결제 결정 기록

TRUST404는 에이전트의 결제 요청과 기관의 정책 결정을 서명·온체인 앵커·증거 번들로 연결하고, 운영 DB에 의존하지 않는 검증 화면을 제공하는 해커톤 MVP입니다.

- 프론트엔드: React + Vite (`frontend/`)
- API: Express + TypeScript (`backend/`)
- 영속성: Supabase PostgreSQL
- 앵커: Sepolia의 `DecisionAnchor` 계약
- 데모 흐름: 요청 접수 → 정책 거절 → 서명·앵커 확인 → 증거 재검증

이 MVP는 **실제 USDC를 전송하지 않습니다**. 테스트 요청은 Sepolia 테스트 ETH로 앵커 트랜잭션 수수료만 사용합니다.

## 사전 요구 사항

- Node.js `24.13` 이상
- npm
- Supabase 프로젝트 1개
- Sepolia RPC 엔드포인트와 테스트용 지갑 5개
- Anchor Writer 지갑이 소유한 Sepolia `DecisionAnchor` 배포본

Supabase 서비스 롤 키, RPC API 키, 개인 키는 절대 Git이나 `VITE_*` 환경 변수에 넣지 마세요. 실행에 필요한 비공개 값은 저장소 밖의 비밀 관리 도구와 제출용 비공개 정보란에만 기록합니다.

## 1. 데이터베이스 준비

전용 Supabase 프로젝트에서 다음 SQL migration을 **순서대로** 실행합니다.

1. `backend/supabase/migrations/001_evidence_store.sql`
2. `backend/supabase/migrations/20260920084656_demo_runs.sql`
3. `backend/supabase/migrations/20260920105620_pending_evidence.sql`
4. `backend/supabase/migrations/20260920112749_case_numbers.sql`

RLS가 켜져 있고 anonymous 클라이언트가 evidence 테이블을 읽거나 쓰지 못하는지 확인하세요. 서비스 롤 키는 백엔드에서만 사용합니다.

## 2. 백엔드 환경 설정 및 실행

```bash
cd backend
npm ci
cp .env.example .env
cp key-registry.example.json key-registry.json
```

Windows PowerShell에서는 `cp` 대신 `Copy-Item`을 사용합니다.

`backend/.env`에 아래 값을 설정합니다. 이 파일과 `backend/key-registry.json`은 `.gitignore`에 포함되어 있습니다.

| 변수 | 용도 |
| --- | --- |
| `SUPABASE_URL` | 전용 Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 Supabase 서비스 롤 키 |
| `RPC_URL` | Sepolia RPC URL |
| `CHAIN_ID` | `11155111` |
| `ANCHOR_CONTRACT_ADDRESS` | 배포한 `DecisionAnchor` 계약 주소 |
| `ENTERPRISE_PRIVATE_KEY` | 기업 정책 서명용 테스트 키 |
| `AGENT_PRIVATE_KEY` | 에이전트 요청 서명용 테스트 키 |
| `VERIFICATION_PRIVATE_KEY` | Gateway 영수증 서명용 테스트 키 |
| `INSTITUTION_PRIVATE_KEY` | 기관 결정 서명용 테스트 키 |
| `ANCHOR_WRITER_PRIVATE_KEY` | 계약 소유자이며 테스트 ETH를 보유한 앵커 작성자 키 |
| `KEY_REGISTRY_PATH` | 기본값 `key-registry.json` |
| `ENABLE_DEMOS` | 브라우저 테스트 요청을 쓰려면 로컬에서만 `true` |
| `PORT` | 기본값 `3000` |

`key-registry.json`에는 위 개인 키에 대응하는 **공개 주소만** 넣습니다. `enterprise-key-1`, `agent-key-1`, `verification-key-1`, `institution-key-1` 값이 각각 환경 변수의 개인 키에서 유도되는 주소와 일치해야 서버가 시작합니다. `ANCHOR_WRITER_PRIVATE_KEY`의 주소는 계약 owner여야 하며 테스트 ETH 잔액이 필요합니다.

검사와 API 실행:

```bash
npm run check
npm start
```

API는 기본적으로 `http://127.0.0.1:3000`에만 바인딩됩니다. 설정 누락, Supabase 연결 오류, 잘못된 체인/계약/키 레지스트리는 즉시 시작 실패로 처리되며 mock 저장소로 대체되지 않습니다.

## 3. 프론트엔드 실행

백엔드를 실행한 상태에서 새 터미널을 엽니다.

```bash
cd frontend
npm ci
npm run dev
```

브라우저에서 Vite가 출력한 주소(기본값 `http://127.0.0.1:5173`)를 엽니다. Vite는 `/api` 요청을 백엔드 `http://127.0.0.1:3000`으로 프록시합니다.

`ENABLE_DEMOS=true`인 로컬 환경에서만 상단의 **테스트 요청 +**를 사용해 거절 증거를 생성할 수 있습니다. 한도 초과 금액은 `LIMIT_EXCEEDED`, 한도 이하 금액은 테스트용 `KYT_RISK` 거절로 기록됩니다. 이는 데모 시나리오이며 실제 위험 평가나 실제 결제가 아닙니다.

## 4. 실행 확인

별도 터미널에서 다음 검사를 실행합니다.

```bash
# backend/
npm run check

# frontend/
npm test
npm run build
```

UI에서 테스트 요청을 하나 생성한 뒤 요청·결정·Evidence 화면에서 서명, policy, 링크, Sepolia 앵커 검증 결과를 확인합니다. 원본 증거 번들은 다운로드 후 UI의 검증기에 업로드해 다시 검증할 수 있습니다.

## 보안 및 운영 제한

- 이 저장소의 실행 런타임은 개발용이며 `ENABLE_DEMOS=true` 상태로 외부에 공개하면 안 됩니다.
- 개인 키와 Supabase 서비스 롤 키는 로컬 비밀 저장소 또는 CI secret에만 보관합니다.
- API를 외부에 노출하려면 동일 출처 프록시, 인증·인가, TLS, 키 회전과 운영 모니터링을 별도로 구현해야 합니다.
- 실행 중 하나의 Gateway 프로세스만 같은 Anchor Writer를 사용해야 합니다. 병렬 프로세스는 nonce 충돌을 유발할 수 있습니다.
- Sepolia는 테스트넷이며 실제 자산·개인정보·실사용 지갑을 사용하지 않습니다.

## 추가 문서

- [백엔드 통합 설정과 복구 제한](backend/INTEGRATION.md)
- [백엔드 검증 절차](backend/INTEGRATION_VERIFICATION.md)
- [프론트엔드 동작과 데이터 경계](frontend/README.md)
- [프로토콜](docs/PROTOCOL.md) · [위협 모델](docs/THREAT_MODEL.md)
