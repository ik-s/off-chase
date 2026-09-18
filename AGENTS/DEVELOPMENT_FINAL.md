# Trust404 Track 3 — DEVELOPMENT.md

## 0. 문서 목적

이 문서는 Trust404 Track 3 MVP를 실제 코드로 구현하기 위한 **확정 개발 기준**이다.

Codex는 구현 전에 다음 순서로 문서를 읽는다.

1. `PROJECT_OVERVIEW.md`
2. `DEVELOPMENT.md`

이 문서는 **해커톤 MVP 구현 기준**이다.

실서비스 수준의 확장성, 실제 금융기관 연동, 복잡한 정책 엔진, Agentic Commerce 전체 구현은 범위 밖이다.

문서 규칙:

- **[확정]**: MVP에서 반드시 지켜야 하는 규칙
- **[Production]**: 실서비스 확장 시 고려하며 MVP에서는 구현하지 않는 항목

---

# 1. MVP 핵심 목표

## [확정]

이번 MVP의 성공 기준은 하나다.

> **Agent가 보낸 결제 요청과 Institution이 내린 오프체인 거절 판단을 검증 가능한 증거로 남기고, 이후 제3자가 Institution 내부 DB 없이도 해당 판단을 다시 검증할 수 있어야 한다.**

대표 시나리오는 고정한다.

```text
Enterprise Policy
1회 최대 4,000 USDC

Agent Request
4,500 USDC

Institution Decision
REJECT / LIMIT_EXCEEDED
```

MVP에서 반드시 보여줄 것:

1. 정상 거절 검증 → `VERIFIED`
2. Decision 내용 변조 탐지 → `TAMPERED`
3. Decision 누락 탐지 → `MISSING`
4. Institution DB에서 Decision이 삭제돼도 이미 확보한 외부 증거로 과거 Decision 검증

---

# 2. MVP 범위

## [확정] 전체 흐름

```text
Enterprise
   │
   │ Policy
   ▼
Agent
   │
   │ Signed Request
   ▼
Verification Layer
   │
   │ Verified Request + Verification Receipt
   ▼
Mock Institution Wallet
   │
   │ Signed Decision
   ▼
Verification Layer
   │
   │ Evidence Bundle + On-chain Anchor
   ▼
Third-party Verifier
```

## [확정] 이번 MVP에서 구현하지 않는 것

- 실제 금융기관 연동
- 실제 자금 전송
- 실제 LLM Agent
- Google AP2 SDK 연동
- Coinbase AgentKit
- ZeroDev
- x402
- Pimlico / ERC-4337
- KYT / AML 엔진
- 복잡한 다중 정책
- Merkle Tree / Merkle batching
- Sparse Merkle Tree
- Key Rotation
- HSM / KMS
- Multi-region 구조
- 실제 Custody Wallet 연동

이 프로젝트의 핵심은 **Agent Payment 자체를 구현하는 것**이 아니라 **오프체인 판단의 증거 생성과 독립 검증**이다.

---

# 3. 확정 기술 스택

## Frontend

```text
React + Vite
```

필요한 역할:

- 결제 요청 실행
- Request / Decision 상태 조회
- Evidence Bundle 다운로드
- Evidence Bundle 업로드 후 검증
- 데모용 변조 / 누락 / DB 삭제 동작 실행

화면 디자인 규칙은 별도 `DESIGN.md`에서 관리한다.

---

## Backend

```text
TypeScript
Node.js
Express
```

Agent, Verification Layer, Mock Institution은 하나의 Repository 안에서 모듈로 분리한다.

해커톤 MVP에서 서버를 물리적으로 여러 개 띄울 필요는 없다.

---

## Database

```text
Supabase PostgreSQL
@supabase/supabase-js
```

DB는 운영 편의를 위한 저장소다.

DB 내용을 최종 신뢰 근거로 사용하지 않는다.

---

## Blockchain

```text
Sepolia
Solidity
Hardhat
```

Smart Contract는 실제 결제를 수행하지 않는다.

역할은 Request / Decision Hash를 외부 기준점에 저장하는 것뿐이다.

---

# 4. 사용하는 외부 라이브러리

MVP에서는 아래 라이브러리만 사용한다.

| 라이브러리 | 역할 |
|---|---|
| `viem` | Hash, EVM 계정, 서명/검증, RPC, Contract 호출 |
| `canonicalize` | JSON을 항상 같은 형태로 변환 |
| `zod` | Record와 Evidence Bundle 구조 검증 |
| `@openzeppelin/contracts` | Anchor Contract의 접근 권한 |
| `hardhat` | Smart Contract 개발·배포·테스트 |
| `@nomicfoundation/hardhat-toolbox-viem` | Hardhat과 viem 연동 |
| `@supabase/supabase-js` | Supabase PostgreSQL 접근 |

설치 예:

```bash
npm install \
  viem \
  canonicalize \
  zod \
  @openzeppelin/contracts \
  @supabase/supabase-js
```

```bash
npm install -D \
  hardhat \
  @nomicfoundation/hardhat-toolbox-viem
```

랜덤 nonce는 외부 패키지를 추가하지 않고 Node.js 기본 `crypto` 모듈을 사용한다.

---

# 5. 사용하지 않는 SDK

## [확정]

다음 SDK는 MVP에서 사용하지 않는다.

```text
Google AP2 SDK
Coinbase AgentKit
ZeroDev
x402
permissionless.js
Pimlico
thirdweb Wallet SDK
```

이유:

- 현재 MVP 핵심 검증 흐름과 직접 관계없음
- 설정과 외부 의존성만 늘어남
- Mock Agent / Mock Institution으로 핵심 문제를 충분히 시연 가능
- 실제 Agent Payment 인프라 연동은 Production 확장 문제

Codex는 별도 요청 없이 위 SDK를 추가하지 않는다.

---

# 6. 각 컴포넌트 역할

## 6.1 Enterprise

기업 결제 정책을 정의한다.

MVP 정책:

```text
asset = USDC
max_amount = 4000 USDC
```

Enterprise는 Policy Record에 서명한다.

---

## 6.2 Agent

기업을 대신해 결제 요청을 생성한다.

Mock Agent 역할:

1. Request Record 생성
2. Agent Key로 Request 서명
3. Verification Layer에 Request 전송

---

## 6.3 Verification Layer

이번 프로젝트의 핵심 서버다.

역할:

1. Agent Signature 검증
2. Policy 확인
3. Request Hash 생성
4. Request를 온체인 Anchor
5. Verification Receipt 생성
6. Mock Institution에 Request 전달
7. Institution Decision 수신
8. Institution Signature 검증
9. Decision Hash 생성
10. Decision을 온체인 Anchor
11. Evidence Bundle 생성
12. Evidence Bundle 보관 / 다운로드 제공

Verification Layer는 선택적 로그 서버가 아니라 **필수 Gateway**다.

---

## 6.4 Mock Institution Wallet

역할:

1. Verification Receipt가 있는 요청만 처리
2. Policy 확인
3. 요청 금액과 Policy 비교
4. APPROVE / REJECT 결정
5. Decision Record 서명

판단 로직:

```text
if request.amount > policy.max_amount:
    REJECT / LIMIT_EXCEEDED
else:
    APPROVE
```

---

## 6.5 Third-party Verifier

Institution DB를 조회하지 않고 Evidence를 검증하는 독립 도구다.

입력:

```text
evidence-bundle.json
```

Verifier가 사용하는 외부 정보:

```text
Public Key Registry
Blockchain
```

Institution DB는 절대 조회하지 않는다.

---

# 7. Mandatory Gateway

## [확정]

정상 결제 요청은 반드시 다음 경로를 따른다.

```text
Agent
→ Verification Layer
→ Institution Wallet
```

Institution Wallet은 Verification Receipt가 없는 요청을 공식 요청으로 인정하지 않는다.

```text
UNVERIFIED_REQUEST
```

이 전제가 필요한 이유는 누락 탐지 때문이다.

Verification Layer가 Institution보다 먼저 Request를 확인해야:

```text
Request 존재
Decision 없음
```

상태를 증명할 수 있다.

### Trust Boundary

Institution이 Verification Layer를 우회하도록 자기 시스템 자체를 바꾸는 경우는 MVP 보장 범위 밖이다.

---

# 8. Record 종류

MVP에서는 네 종류의 Record를 사용한다.

```text
Policy Record
Request Record
Verification Receipt
Decision Record
```

모든 Record에는 `schema_version`을 포함한다.

모든 Record는 Zod Schema를 작성한다.

---

# 9. Policy Record

예시:

```json
{
  "schema_version": 1,
  "policy_id": "payment-limit-v1",
  "version": 1,
  "asset": "USDC",
  "max_amount_base_units": "4000000000",
  "valid_from": "2026-09-19T00:00:00Z",
  "enterprise_key_id": "enterprise-key-1",
  "enterprise_signature": "0x..."
}
```

## [확정]

Hash 대상:

```text
schema_version
policy_id
version
asset
max_amount_base_units
valid_from
enterprise_key_id
```

Hash 대상에서 제외:

```text
enterprise_signature
```

Policy Hash는 Request와 On-chain Request Anchor에 연결한다.

---

# 10. Request Record

예시:

```json
{
  "schema_version": 1,
  "request_id": "REQ-001",
  "created_at": "2026-09-19T01:00:00Z",
  "asset": "USDC",
  "amount_base_units": "4500000000",
  "recipient": "0x1111111111111111111111111111111111111111",
  "policy_id": "payment-limit-v1",
  "policy_hash": "0x...",
  "nonce": "0x...",
  "agent_key_id": "agent-key-1",
  "agent_signature": "0x..."
}
```

## [확정]

Hash 대상:

```text
schema_version
request_id
created_at
asset
amount_base_units
recipient
policy_id
policy_hash
nonce
agent_key_id
```

Hash 대상에서 제외:

```text
agent_signature
```

Request에는 반드시:

```text
policy_id
policy_hash
```

를 모두 포함한다.

---

# 11. Verification Receipt

Verification Layer가 다음 사실을 증명한다.

> 이 Request가 공식 Gateway를 실제로 통과했고 Request Anchor가 생성됐다.

예시:

```json
{
  "schema_version": 1,
  "request_id": "REQ-001",
  "request_hash": "0x...",
  "policy_hash": "0x...",
  "request_anchor_tx": "0x...",
  "request_anchor_block": 12345678,
  "observed_at": 1789780000,
  "decision_deadline": 1789780030,
  "verification_key_id": "verification-key-1",
  "verification_signature": "0x..."
}
```

## [확정]

Hash 대상:

```text
schema_version
request_id
request_hash
policy_hash
request_anchor_tx
request_anchor_block
observed_at
decision_deadline
verification_key_id
```

Hash 대상에서 제외:

```text
verification_signature
```

`observed_at`과 `decision_deadline`은 온체인 값을 사용한다.

---

# 12. Decision Record

예시:

```json
{
  "schema_version": 1,
  "request_id": "REQ-001",
  "request_hash": "0x...",
  "policy_id": "payment-limit-v1",
  "policy_hash": "0x...",
  "decision": "REJECT",
  "reason_code": "LIMIT_EXCEEDED",
  "institution_key_id": "institution-key-1",
  "institution_signature": "0x..."
}
```

## [확정]

Hash 대상:

```text
schema_version
request_id
request_hash
policy_id
policy_hash
decision
reason_code
institution_key_id
```

Hash 대상에서 제외:

```text
institution_signature
```

Decision은 반드시:

```text
request_hash
policy_id
policy_hash
```

를 통해 원본 Request / Policy와 연결된다.

---

# 13. Canonical JSON / Hash / Signature 규칙

## [확정]

모든 Record는 같은 흐름을 사용한다.

```text
Record
→ Signature 필드 제거
→ canonicalize()
→ UTF-8 bytes
→ keccak256()
→ Hash
→ Hash에 서명
→ Signature를 Record에 추가
```

구현 예시 개념:

```ts
const payload = removeSignature(record)
const canonical = canonicalize(payload)
const hash = keccak256(toBytes(canonical))
const signature = await account.signMessage({
  message: { raw: hash }
})
```

Verifier는 같은 방식으로 Hash를 다시 만든 뒤 `verifyMessage`로 Signature를 검증한다.

## [확정]

직접 JSON key 정렬 알고리즘을 만들지 않는다.

`canonicalize` 라이브러리를 사용한다.

## [확정]

EIP-712는 MVP에서 사용하지 않는다.

서명 규칙을 하나로 유지하기 위해 모든 역할이 동일한:

```text
Canonical JSON
→ keccak256
→ viem signMessage(raw hash)
```

방식을 사용한다.

---

# 14. Golden Test Vector

## [확정]

Record 규칙이 구현 중 바뀌지 않도록 고정 테스트 데이터를 만든다.

```text
tests/fixtures/policy.json
tests/fixtures/request.json
tests/fixtures/decision.json
```

각 fixture에는 예상 Hash를 고정한다.

예:

```text
expectedPolicyHash
expectedRequestHash
expectedDecisionHash
```

모든 Hash 테스트는 이 값을 기준으로 통과해야 한다.

---

# 15. Policy 연결 규칙

## [확정]

Verifier는 Evidence Bundle의 Policy에서 `policyHash`를 다시 계산한다.

다음 값이 모두 동일해야 한다.

```text
재계산한 Policy Hash
=
Request.policy_hash
=
Decision.policy_hash
=
On-chain Request.policyHash
```

하나라도 다르면 정상 검증으로 인정하지 않는다.

---

# 16. 금액 표현

## [확정]

금융 데이터는 `float`를 사용하지 않는다.

USDC는 6 decimals로 가정한다.

```text
4000 USDC
→ 4000000000

4500 USDC
→ 4500000000
```

저장 타입:

```text
정수 문자열 또는 BigInt
```

DB에서는 문자열 또는 큰 정수를 안전하게 표현할 수 있는 타입을 사용한다.

---

# 17. nonce

## [확정]

Request에는 Node.js `crypto.randomBytes(32)`를 이용한 random nonce를 넣는다.

역할:

- 동일한 금액 / 수신자의 Request도 서로 다른 Hash 생성
- 단순 Hash만 보고 금액을 반복 대입해 추측하는 공격 완화

nonce는 Evidence Bundle에 포함한다.

---

# 18. Deadline

## [확정] MVP 값

```text
DECISION_WINDOW = 30 seconds
```

이 값은 실제 금융기관 SLA가 아니다.

해커톤 시연에서 `PROCESSING → MISSING` 상태를 확인하기 위한 데모 값이다.

---

## [확정] 시간 기준

Request Anchor가 포함된 블록의 `block.timestamp`를 기준으로 한다.

```text
requestAnchoredAt = block.timestamp
decisionDeadline = requestAnchoredAt + 30 seconds
```

사용자 브라우저 / PC 시각을 누락 판정에 사용하지 않는다.

---

## [확정] Decision 상태

```text
Decision 없음
+
현재 Chain Time <= Deadline
→ PROCESSING
```

```text
Decision 없음
+
현재 Chain Time > Deadline
→ MISSING
```

```text
Decision Anchor 존재
+
Decision Anchor Time <= Deadline
→ Decision 존재
```

---

## [확정] Deadline 이후 Decision

Deadline 이후 Decision은 공식 Decision으로 인정하지 않는다.

Smart Contract에서 막는다.

```solidity
require(block.timestamp <= decisionDeadline, "DEADLINE_EXPIRED");
```

Verification Layer도 Anchor 전에 Deadline을 확인한다.

Deadline 이후 요청:

```text
DEADLINE_EXPIRED
```

최종 상태:

```text
MISSING
```

## [Production]

실서비스에서는 `LATE` 등 별도 상태를 설계할 수 있다.

MVP에서는 구현하지 않는다.

---

# 19. Smart Contract

Contract의 역할:

> Request / Decision Hash를 외부의 변경하기 어려운 기준점에 저장

실제 결제 로직은 넣지 않는다.

---

## 19.1 데이터 구조

개념 예:

```solidity
struct RequestAnchorData {
    bytes32 requestHash;
    bytes32 policyHash;
    uint64 requestAnchoredAt;
    uint64 decisionDeadline;
    bytes32 decisionHash;
    uint64 decisionAnchoredAt;
}
```

```solidity
mapping(bytes32 => RequestAnchorData) public records;
```

`requestKey`:

```text
keccak256(request_id)
```

---

## 19.2 Request Anchor

개념:

```solidity
function anchorRequest(
    bytes32 requestKey,
    bytes32 requestHash,
    bytes32 policyHash
) external onlyOwner
```

Contract가 내부에서 저장:

```text
requestAnchoredAt = block.timestamp
decisionDeadline = block.timestamp + 30
```

---

## 19.3 Decision Anchor

개념:

```solidity
function anchorDecision(
    bytes32 requestKey,
    bytes32 decisionHash
) external onlyOwner
```

---

## 19.4 Contract 규칙

## [확정]

1. 동일 Request 두 번 Anchor 금지
2. 동일 Decision 두 번 Anchor 금지
3. Request 없는 Decision 금지
4. Deadline 이후 Decision 금지
5. Verification Layer Anchor Wallet만 기록 가능

접근 권한은 OpenZeppelin `Ownable`을 사용한다.

복잡한 Role 시스템은 구현하지 않는다.

---

## 19.5 Event

```solidity
event RequestAnchored(
    bytes32 indexed requestKey,
    bytes32 requestHash,
    bytes32 policyHash,
    uint64 requestAnchoredAt,
    uint64 decisionDeadline
);

event DecisionAnchored(
    bytes32 indexed requestKey,
    bytes32 decisionHash,
    uint64 decisionAnchoredAt
);
```

---

# 20. Key 관리

## [확정]

MVP에서는 다음 Key를 고정한다.

```text
Enterprise Key
Agent Key
Verification Layer Key
Institution Key
Anchor Writer Key
```

Private Key:

```text
.env
```

Public Key / Address:

```text
static key-registry.json
```

예:

```json
{
  "enterprise-key-1": "0x...",
  "agent-key-1": "0x...",
  "verification-key-1": "0x...",
  "institution-key-1": "0x..."
}
```

Verifier는 Evidence Bundle 내부의 임의 Public Key를 신뢰하지 않는다.

반드시 Registry에서 공식 Address를 가져온다.

## [Production]

Key Rotation은 MVP에서 구현하지 않는다.

---

# 21. 중복 Request

## [확정]

`request_id`는 유일해야 한다.

Database:

```text
UNIQUE(request_id)
```

Contract:

```text
동일 requestKey 두 번째 Anchor 금지
```

API:

### 같은 ID + 같은 Hash

기존 요청으로 간주하고 기존 상태를 반환한다.

### 같은 ID + 다른 Hash

```text
REQUEST_ID_CONFLICT
```

복잡한 분산 Idempotency 시스템은 구현하지 않는다.

---

# 22. Evidence Bundle

Evidence Bundle은 **특정 Request 한 건을 독립 검증하기 위한 사건 증거 파일**이다.

파일:

```text
evidence-bundle-REQ-001.json
```

구조:

```json
{
  "schema_version": 1,
  "policy": {},
  "request": {},
  "verification_receipt": {},
  "decision": {},
  "anchors": {
    "chain_id": 11155111,
    "contract_address": "0x...",
    "request_tx": "0x...",
    "decision_tx": "0x..."
  }
}
```

Decision이 존재하지 않는 경우:

```json
"decision": null
```

---

## 22.1 Evidence Bundle 수정 가능성

## [확정]

Evidence Bundle은 일반 JSON 파일이다.

파일 자체를 수정하지 못하게 만들 필요는 없다.

수정하면 Verifier가 다음을 통해 탐지해야 한다.

```text
Signature
Hash
On-chain Anchor
Record 연결
Policy Hash
Deadline
```

목표:

> **수정 불가능한 파일이 아니라, 수정하면 반드시 들키는 파일**

---

## 22.2 생성 / 보관

## [확정]

정상 Decision:

```text
Request Anchor
→ Receipt
→ Decision
→ Decision Anchor
→ Evidence Bundle 생성
```

Verification Layer는 Evidence Bundle을 저장한다.

Frontend는 다운로드 API를 제공한다.

Decision이 누락된 경우에는 Request / Receipt / Request Anchor만 포함한 Bundle을 생성할 수 있다.

---

## 22.3 Institution DB 삭제 데모 전제

DB 삭제 전에 다음이 완료되어 있어야 한다.

1. Signed Decision 수신
2. Decision Anchor 완료
3. Evidence Bundle 생성
4. Evidence Bundle 확보

이후 Institution DB Decision Row를 삭제한다.

Verifier는:

```text
Evidence Bundle
+
Key Registry
+
Blockchain
```

만으로 과거 Decision을 검증한다.

이 데모는:

> 기관이 DB에서 삭제했다는 행위 자체를 증명하는 것이 아니다.

증명하는 것:

> 기관 DB에 현재 Record가 없어도 과거 Decision의 존재와 무결성을 확인할 수 있다.

---

# 23. Evidence Bundle Schema

Zod를 사용해 다음 Schema를 작성한다.

```text
PolicySchema
RequestSchema
VerificationReceiptSchema
DecisionSchema
EvidenceBundleSchema
```

Verifier는 가장 먼저:

```ts
EvidenceBundleSchema.parse(...)
```

를 수행한다.

Schema가 틀리면:

```text
INVALID
```

---

# 24. Verifier 검증 순서

## [확정]

1. Evidence Bundle Zod Schema 검증
2. `key_id`가 Registry에 존재하는지 확인
3. Enterprise Policy Signature 검증
4. Agent Request Signature 검증
5. Verification Receipt Signature 검증
6. Decision이 있다면 Institution Signature 검증
7. Policy Hash 재계산
8. Request Hash 재계산
9. Decision이 있다면 Decision Hash 재계산
10. On-chain Request Anchor 조회
11. Evidence Request Hash와 On-chain Hash 비교
12. Evidence Policy Hash와 On-chain Policy Hash 비교
13. Decision이 있다면 On-chain Decision Anchor 비교
14. Request ↔ Receipt ↔ Decision 연결 확인
15. Policy 직접 재계산
16. Deadline 상태 확인
17. 최종 상태 계산

---

# 25. Policy 재계산

MVP 정책은 하나다.

```text
request.amount <= policy.max_amount
```

예:

```text
request = 4,500 USDC
policy.max = 4,000 USDC
```

Expected:

```text
REJECT
LIMIT_EXCEEDED
```

Verifier는 Institution이 남긴 `reason_code`를 그대로 믿지 않는다.

Policy를 직접 다시 계산한다.

---

# 26. Verifier 상태

MVP에서는 다섯 개만 사용한다.

```text
VERIFIED
TAMPERED
MISSING
PROCESSING
INVALID
```

## VERIFIED

모든 증거와 판단이 정상.

## TAMPERED

Evidence Record Hash가 과거 On-chain Anchor와 다름.

## MISSING

Request Anchor는 존재하지만 Deadline 이후 Decision Anchor가 없음.

## PROCESSING

Request Anchor는 존재하지만 아직 Deadline 이전이며 Decision이 없음.

## INVALID

공식 증거로 인정할 수 없는 구조.

예:

- Signature 오류
- Registry에 없는 Key
- Request / Decision 연결 오류
- Policy Hash 연결 오류
- Verification Receipt 오류

---

## 26.1 여러 오류가 동시에 발생한 경우

## [확정]

복잡한 우선순위 시스템을 만들지 않는다.

On-chain Hash 불일치가 하나라도 있으면:

```text
TAMPERED
```

그 외 구조적 / 서명 오류:

```text
INVALID
```

Verifier는 최종 상태와 별개로 발견한 오류 코드 목록을 모두 반환한다.

예:

```json
{
  "status": "TAMPERED",
  "errors": [
    "DECISION_HASH_MISMATCH",
    "INVALID_INSTITUTION_SIGNATURE"
  ]
}
```

---

# 27. 핵심 오류 코드

```text
INVALID_AGENT_SIGNATURE
INVALID_ENTERPRISE_SIGNATURE
INVALID_VERIFICATION_SIGNATURE
INVALID_INSTITUTION_SIGNATURE

UNVERIFIED_REQUEST

REQUEST_ID_CONFLICT
REQUEST_ALREADY_ANCHORED
DECISION_ALREADY_ANCHORED

REQUEST_HASH_MISMATCH
DECISION_HASH_MISMATCH
POLICY_MISMATCH

MISSING_DECISION
DEADLINE_EXPIRED

INVALID_REQUEST_REFERENCE
INVALID_EVIDENCE_SCHEMA
```

UI 문구는 개발 오류 코드와 분리한다.

---

# 28. API

## 28.1 Request

```text
POST /api/requests
```

입력:

```json
{
  "request": {}
}
```

처리:

1. Zod Schema 검증
2. Agent Signature 검증
3. Policy 조회
4. Policy Hash 검증
5. Request Hash 생성
6. 중복 Request 확인
7. Request Anchor
8. Chain에서 Anchor 결과 / Deadline 조회
9. Verification Receipt 생성 / 서명
10. Mock Institution 호출

---

## 28.2 Decision

```text
POST /api/decisions
```

처리:

1. Zod Schema 검증
2. Institution Signature 검증
3. Request 존재 확인
4. Request Hash 연결 확인
5. Policy Hash 연결 확인
6. Deadline 확인
7. Decision Hash 생성
8. Decision Anchor
9. Evidence Bundle 생성

Deadline이 지난 경우:

```text
DEADLINE_EXPIRED
```

---

## 28.3 Evidence Download

```text
GET /api/requests/:requestId/evidence
```

응답은 JSON 파일 다운로드가 가능해야 한다.

---

## 28.4 Evidence Verify

Backend API 방식:

```text
POST /api/verifier
```

또는 독립 CLI:

```bash
npm run verify -- evidence-bundle-REQ-001.json
```

독립 Verifier는 Institution DB를 사용하지 않는다.

---

# 29. Database

MVP 테이블:

```text
policies
requests
verification_receipts
decisions
anchors
evidence_bundles
```

필수 Constraint:

```text
requests.request_id UNIQUE
```

DB Row는 수정될 수 있다고 가정한다.

최종 검증은:

```text
Signature
+
On-chain Anchor
```

를 기준으로 한다.

---

# 30. 핵심 데모

## Demo 1 — 정상 거절

```text
Policy
4000 USDC

Request
4500 USDC

Decision
REJECT / LIMIT_EXCEEDED

Verifier
VERIFIED
```

---

## Demo 2 — Decision 변조

정상 Decision:

```text
LIMIT_EXCEEDED
```

기관 DB의 Decision을:

```text
KYT_RISK
```

로 변경하고 필요하면 Institution Key로 다시 서명한다.

과거 On-chain Decision Hash는 변경하지 않는다.

Verifier:

```text
현재 Decision Hash
!=
On-chain Decision Hash
```

결과:

```text
TAMPERED
```

---

## Demo 3 — Decision 누락

Request Anchor까지만 만든다.

Institution Decision 생성을 생략한다.

30초 이전:

```text
PROCESSING
```

30초 이후:

```text
MISSING
```

---

## Demo 4 — Institution DB 삭제

1. 정상 Request / Decision 생성
2. Decision Anchor 완료
3. Evidence Bundle 다운로드
4. Institution DB Decision Row 삭제
5. 다운로드한 Evidence Bundle을 Independent Verifier로 검증

결과:

```text
VERIFIED
```

---

# 31. 자동 테스트

반드시 작성:

```text
golden-records.test.ts
normal-rejection.test.ts
tampered-decision.test.ts
missing-decision.test.ts
deleted-db-record.test.ts
duplicate-request.test.ts
anchor-access.test.ts
deadline.test.ts
```

## 핵심 테스트

### Golden Hash

같은 Fixture에서 항상 같은 Hash가 나와야 한다.

### Signature

올바른 Key:

```text
VALID
```

다른 Key:

```text
INVALID
```

### Anchor 접근 권한

Verification Layer Anchor Wallet:

```text
SUCCESS
```

다른 Wallet:

```text
REVERT
```

### Deadline

Deadline 전 Decision:

```text
SUCCESS
```

Deadline 후 Decision:

```text
REVERT
```

---

# 32. Directory 구조

```text
src/
├── agent/
│   └── mockAgent.ts
│
├── enterprise/
│   └── policy.ts
│
├── verification/
│   ├── service.ts
│   ├── receipt.ts
│   └── verifier.ts
│
├── institution/
│   └── mockWallet.ts
│
├── records/
│   ├── schemas.ts
│   ├── policy.ts
│   ├── request.ts
│   ├── receipt.ts
│   └── decision.ts
│
├── crypto/
│   ├── canonicalize.ts
│   ├── hash.ts
│   ├── signature.ts
│   ├── nonce.ts
│   └── keyRegistry.ts
│
├── blockchain/
│   ├── publicClient.ts
│   ├── walletClient.ts
│   └── anchorClient.ts
│
├── evidence/
│   └── bundle.ts
│
├── db/
│   └── repositories/
│
└── api/
    └── routes/
```

Contract:

```text
contracts/
└── DecisionAnchor.sol
```

Tests:

```text
tests/
├── fixtures/
│   ├── policy.json
│   ├── request.json
│   └── decision.json
├── golden-records.test.ts
├── normal-rejection.test.ts
├── tampered-decision.test.ts
├── missing-decision.test.ts
├── deleted-db-record.test.ts
├── duplicate-request.test.ts
├── anchor-access.test.ts
└── deadline.test.ts
```

---

# 33. 환경변수

```text
DATABASE_URL=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

ENTERPRISE_PRIVATE_KEY=
AGENT_PRIVATE_KEY=
VERIFICATION_PRIVATE_KEY=
INSTITUTION_PRIVATE_KEY=
ANCHOR_WRITER_PRIVATE_KEY=

RPC_URL=
CHAIN_ID=
ANCHOR_CONTRACT_ADDRESS=
```

Private Key는 Git에 Commit하지 않는다.

`.env.example`에는 변수명만 둔다.

---

# 34. 구현 순서

## Phase 1 — Record / Crypto

1. Zod Schema
2. Canonical JSON
3. Hash
4. Signature
5. Signature Verification
6. Golden Test Vector

## Phase 2 — Domain Flow

1. Enterprise Policy
2. Mock Agent Request
3. Verification Layer
4. Mock Institution
5. `4500 > 4000 → REJECT`

## Phase 3 — Smart Contract

1. `DecisionAnchor.sol`
2. Ownable
3. Request Anchor
4. Decision Anchor
5. Deadline
6. Event
7. Sepolia 배포

## Phase 4 — Evidence

1. Verification Receipt
2. Evidence Bundle
3. Evidence Download
4. Third-party Verifier

## Phase 5 — Attack Demo

1. Decision 변조
2. Decision 누락
3. Institution DB 삭제

## Phase 6 — Frontend Integration

개발 기능만 연결한다.

1. Request 실행
2. 상태 조회
3. Evidence 다운로드
4. Evidence 업로드 / 검증
5. 공격 Demo 호출

화면 구조와 디자인은 `DESIGN.md`에서 별도로 정의한다.

---

# 35. Production 확장

## [Production]

MVP:

```text
1 Request
→ 1 Request Anchor

1 Decision
→ 1 Decision Anchor
```

실서비스:

```text
많은 Request / Decision
→ Append-only Evidence Log
→ Batch
→ Merkle Tree
→ Merkle Root Anchor
```

실서비스 추가 고려:

- Merkle Proof
- Sparse Merkle Tree
- Key Rotation
- HSM / KMS
- 실제 Agent Wallet
- 실제 Institution Wallet
- 실제 AP2 연동
- 기관별 Decision SLA
- Late Decision 상태
- Multi-region Verification Layer

MVP에서는 구현하지 않는다.

---

# 36. Codex 구현 규칙

## [확정]

Codex는 다음 규칙을 지킨다.

1. 이 문서에 없는 외부 SDK를 임의 추가하지 않는다.
2. 실제 Agentic Commerce 전체를 구현하지 않는다.
3. 실제 자금 전송 기능을 만들지 않는다.
4. 정책은 `max_amount` 하나만 사용한다.
5. 금액은 base unit 정수로 처리한다.
6. 모든 Hash는 `canonicalize → keccak256` 규칙을 사용한다.
7. Signature 필드는 Hash 대상에서 제외한다.
8. 모든 역할은 동일한 `viem signMessage(raw hash)` 방식을 사용한다.
9. Request와 Decision은 `policy_hash`를 포함한다.
10. Verifier는 Institution DB를 조회하지 않는다.
11. Anchor 데이터는 Chain 데이터와 직접 비교한다.
12. Deadline은 Chain Time을 사용한다.
13. Deadline 이후 Decision을 Anchor하지 않는다.
14. Anchor Contract 기록 권한은 Verification Layer만 가진다.
15. 동일 `request_id`로 새로운 Record를 중복 생성하지 않는다.
16. Key Rotation을 구현하지 않는다.
17. Merkle batching을 구현하지 않는다.
18. UI 디자인 판단은 `DESIGN.md` 없이 임의로 확장하지 않는다.
19. 구현이 문서와 달라지면 코드가 아니라 문서를 먼저 수정한다.

---

# 37. MVP 완료 조건

다음이 모두 동작하면 핵심 개발 완료로 본다.

- [ ] Policy Record 생성
- [ ] Policy Signature
- [ ] Policy Hash 생성
- [ ] Request Record 생성
- [ ] Request Signature
- [ ] Request에 `policy_hash` 연결
- [ ] Request Hash 생성
- [ ] Request Anchor
- [ ] Verification Receipt 생성
- [ ] 30초 Deadline 생성
- [ ] Institution Policy 판단
- [ ] `4500 > 4000`
- [ ] `REJECT / LIMIT_EXCEEDED`
- [ ] Decision Signature
- [ ] Decision Hash 생성
- [ ] Decision Anchor
- [ ] Evidence Bundle 생성
- [ ] Evidence Bundle 다운로드
- [ ] Institution DB 없이 정상 Decision 검증
- [ ] 정상 → `VERIFIED`
- [ ] Decision 변조 → `TAMPERED`
- [ ] Deadline 전 Decision 없음 → `PROCESSING`
- [ ] Deadline 후 Decision 없음 → `MISSING`
- [ ] Deadline 이후 Decision Anchor 거절
- [ ] Institution DB Decision 삭제 후 기존 Bundle → `VERIFIED`
- [ ] 동일 request_id 중복 생성 차단
- [ ] 비인가 Wallet의 Anchor 호출 차단
- [ ] Golden Hash Test 통과

---

# 38. 핵심 기술 역할

| 기술 | 역할 |
|---|---|
| Zod | Record / Evidence 형식 검증 |
| canonicalize | 같은 데이터를 항상 같은 문자열로 변환 |
| keccak256 | Record의 지문 생성 |
| Digital Signature | 누가 Record를 만들었는지 확인 |
| Policy Hash | 당시 사용한 Policy 버전 고정 |
| Verification Layer | Institution보다 먼저 Request를 확인 |
| Verification Receipt | Request가 공식 Gateway를 통과했음을 증명 |
| Blockchain Anchor | 과거 Hash를 외부 기준점에 고정 |
| Deadline | Decision 누락 판단 기준 |
| Evidence Bundle | 제3자에게 전달하는 사건 증거 묶음 |
| Third-party Verifier | Institution DB 없이 전체 증거 검증 |

---

# 39. 가장 중요한 개발 원칙

> **Blockchain에 모든 데이터를 저장하는 것이 목적이 아니다.**

원본 Policy / Request / Decision은 오프체인에서 처리한다.

Blockchain은:

> **“그 시점에 이 Record의 Hash가 실제로 존재했다.”**

를 증명하는 외부 기준점으로 사용한다.

Evidence Bundle도 수정 불가능한 파일일 필요가 없다.

Verifier가:

> **“현재 제출된 Evidence가 당시 Signature와 On-chain Anchor와 일치하는가?”**

를 독립적으로 확인할 수 있으면 된다.

최종적으로 이 프로젝트가 답해야 하는 질문은 하나다.

> **Institution이 현재 보여주는 내부 로그를 믿지 않고도, 당시 어떤 Request와 Decision이 실제로 존재했는지 제3자가 검증할 수 있는가?**
