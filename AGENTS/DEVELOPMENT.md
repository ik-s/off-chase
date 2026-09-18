# DEVELOPMENT.md

# Trust404 Track 3 — Development Guide

## 0. 이 문서의 목적

이 문서는 `PROJECT_OVERVIEW.md`에서 정의한 제품 방향을 실제 코드로 구현하기 위한 개발 기준 문서다.

Codex는 구현을 시작하기 전에 반드시 다음 순서로 문서를 읽는다.

1. `PROJECT_OVERVIEW.md`
2. `DEVELOPMENT.md`
3. 추후 작성될 `DESIGN.md`

이 문서는 **해커톤 MVP 구현 기준**이다.

실서비스 수준의 확장성, 고가용성, 복잡한 정책 엔진, 실제 금융기관 연동까지 구현하지 않는다.

---

# 1. MVP의 핵심 목표

이번 MVP의 성공 기준은 하나다.

> **Agent가 보낸 결제 요청과 Institution이 내린 오프체인 거절 판단을 검증 가능한 증거로 남기고, 이후 제3자가 Institution 내부 DB 없이도 해당 판단을 다시 검증할 수 있어야 한다.**

대표 시나리오:

- Enterprise Policy: 1회 최대 `4,000 USDC`
- Agent Request: `4,500 USDC`
- Expected Decision: `REJECT`
- Reason: `LIMIT_EXCEEDED`

MVP에서 반드시 보여줄 것:

1. 정상 거절 검증
2. Decision Record 변조 탐지
3. Decision Record 누락 탐지
4. 기관 DB가 없어도 외부 증거로 검증 가능

---

# 2. MVP와 Production 구조 구분

## MVP

가시성과 구현 단순성을 우선한다.

각 중요한 Record를 개별 Hash로 만든 뒤 EVM 테스트넷에 직접 Anchor한다.

```text
Request Record
→ Hash
→ On-chain Anchor

Decision Record
→ Hash
→ On-chain Anchor
```

이 방식은 요청량이 많은 실서비스에서는 비효율적일 수 있지만, 해커톤에서는 다음을 가장 명확하게 보여줄 수 있다.

- 요청이 실제로 존재했음
- 결정이 실제로 존재했음
- 이후 Record가 바뀌었음
- 요청은 있지만 결정이 누락됐음

## Production 확장 방향

실서비스에서는 요청마다 온체인 트랜잭션을 만들지 않는다.

```text
여러 Request / Decision
→ Off-chain Append-only Evidence Log
→ 일정 시간 또는 건수 단위 Batch
→ Merkle Tree
→ Merkle Root 하나만 On-chain Anchor
```

개별 Record는 Merkle Proof로 Batch 포함 여부를 검증한다.

특정 `request_id`의 상태 및 비포함 증명까지 필요해질 경우 `Sparse Merkle Tree` 같은 구조를 검토한다.

**중요:** Merkle batching은 MVP의 검증 모델을 바꾸는 기능이 아니라, 동일한 증거 구조를 더 저렴하게 운영하기 위한 확장성 최적화다.

---

# 3. 전체 시스템 구조

MVP는 다음 다섯 역할로 구성한다.

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
   │ Verified Request + Receipt
   ▼
Mock Institution Wallet
   │
   │ Signed Decision
   ▼
Verification Layer
   │
   │ Evidence + On-chain Anchor
   ▼
Third-party Verifier
```

---

# 4. 각 컴포넌트 역할

## 4.1 Enterprise

기업 결제 정책을 정의한다.

MVP에서는 정책 하나만 사용한다.

```text
asset = USDC
max_amount = 4000 USDC
```

기업은 Policy Record에 서명한다.

---

## 4.2 Agent

기업을 대신해 결제 요청을 생성한다.

MVP에서는 실제 LLM Agent가 아니어도 된다.

Mock Agent가 다음을 수행하면 충분하다.

- Request Record 생성
- Agent Private Key로 서명
- Verification Layer에 전송

---

## 4.3 Verification Layer

이번 프로젝트의 핵심 서버다.

일반적인 Backend API로 구현한다.

역할:

1. Agent Signature 검증
2. Request Record 정규화
3. Request Hash 생성
4. Request를 온체인 Anchor
5. Verification Receipt 생성
6. Institution Wallet으로 Request 전달
7. Institution Decision 수신
8. Institution Signature 검증
9. Decision Hash 생성
10. Decision을 온체인 Anchor
11. Evidence Bundle 생성 지원

Verification Layer는 **선택적인 로그 서버가 아니라 결제 요청의 필수 Gateway**로 가정한다.

---

## 4.4 Mock Institution Wallet

실제 금융기관 Wallet을 대신하는 Mock 서비스다.

역할:

1. Verification Receipt가 있는 요청만 처리
2. Enterprise Policy 확인
3. 요청 금액과 정책 비교
4. APPROVE / REJECT 결정
5. Institution Private Key로 Decision Record 서명

MVP 판단 로직:

```text
if request.amount > policy.max_amount:
    REJECT / LIMIT_EXCEEDED
else:
    APPROVE
```

---

## 4.5 Third-party Verifier

기관 DB와 독립적으로 Evidence를 검증하는 도구다.

CLI 또는 Web UI로 구현할 수 있다.

입력:

```text
evidence-bundle.json
```

출력 예:

```text
✅ Agent signature valid
✅ Request integrity valid
✅ Policy valid
✅ Institution signature valid
✅ Request anchor matched
✅ Decision anchor matched
✅ 4500 > 4000
✅ Decision matches policy

VERIFIED
```

또는:

```text
❌ Decision hash does not match on-chain anchor

TAMPERED
```

---

# 5. Mandatory Gateway 전제

정상 요청 경로는 반드시 다음과 같다.

```text
Agent
→ Verification Layer
→ Institution Wallet
```

Agent가 Institution Wallet을 직접 호출하는 요청은 공식적인 결제 요청으로 인정하지 않는다.

Institution은 Verification Layer가 발급한 Receipt가 없는 요청을 거절한다.

예:

```text
UNVERIFIED_REQUEST
```

이 전제가 필요한 이유는 `누락 탐지` 때문이다.

Verification Layer가 요청을 먼저 관측해야:

```text
Request 존재
Decision 없음
```

상태를 독립적으로 확인할 수 있다.

### Trust Boundary

기관이 Verification Layer Receipt 없이도 요청을 실행하도록 자신의 시스템을 임의 변경하는 경우는 MVP 보장 범위 밖이다.

즉 완전성 보장은 다음 전제 위에서 성립한다.

> **Institution Wallet은 Verification Layer를 통과한 요청만 유효한 요청으로 처리한다.**

---

# 6. 상태 모델

각 Request는 다음 상태를 가진다.

```text
PENDING
APPROVED
REJECTED
MISSING
```

## PENDING

Verification Layer가 Request를 관측했지만 아직 Institution Decision이 없는 상태.

## APPROVED

Institution이 승인 Decision을 반환한 상태.

## REJECTED

Institution이 거절 Decision을 반환한 상태.

## MISSING

Request의 `decision_deadline`을 넘겼지만 검증 가능한 Decision이 존재하지 않는 상태.

MVP 데모에서는 실제 10분을 기다리지 않고 짧은 Deadline을 사용해도 된다.

예:

```text
decision_deadline = observed_at + 30 seconds
```

---

# 7. Record 종류

MVP에서는 네 종류의 Record를 사용한다.

---

## 7.1 Policy Record

기업이 승인한 결제 정책.

예시:

```json
{
  "policy_id": "payment-limit-v1",
  "version": 1,
  "asset": "USDC",
  "max_amount_base_units": "4000000000",
  "valid_from": "2026-09-18T00:00:00Z",
  "enterprise_key_id": "enterprise-key-1",
  "enterprise_signature": "..."
}
```

### 중요

USDC는 6 decimals라고 가정한다.

따라서:

```text
4000 USDC
=
4,000,000,000 base units
```

금액은 JavaScript `float`로 처리하지 않는다.

항상 정수 문자열 또는 BigInt를 사용한다.

---

## 7.2 Request Record

Agent가 생성한 결제 요청.

예시:

```json
{
  "request_id": "REQ-001",
  "created_at": "2026-09-18T01:00:00Z",
  "asset": "USDC",
  "amount_base_units": "4500000000",
  "recipient": "0x1111111111111111111111111111111111111111",
  "policy_id": "payment-limit-v1",
  "nonce": "0x...",
  "agent_key_id": "agent-key-1",
  "agent_signature": "..."
}
```

`nonce`는 추후 외부 Hash만 보고 금액 등을 추측하기 어렵게 만들기 위한 랜덤값이다.

---

## 7.3 Verification Receipt

Verification Layer가 Request를 실제로 관측했다는 증거.

예시:

```json
{
  "request_id": "REQ-001",
  "request_hash": "0x...",
  "observed_at": "2026-09-18T01:00:01Z",
  "decision_deadline": "2026-09-18T01:00:31Z",
  "request_anchor_tx": "0x...",
  "verification_key_id": "verification-key-1",
  "verification_signature": "..."
}
```

---

## 7.4 Decision Record

Institution이 내린 최종 판단.

예시:

```json
{
  "request_id": "REQ-001",
  "request_hash": "0x...",
  "policy_id": "payment-limit-v1",
  "decision": "REJECT",
  "reason_code": "LIMIT_EXCEEDED",
  "decided_at": "2026-09-18T01:00:05Z",
  "institution_key_id": "institution-key-1",
  "institution_signature": "..."
}
```

---

# 8. 금액 표현 규칙

금융 데이터에서는 실수형을 사용하지 않는다.

금지:

```text
4500.00
```

권장:

```text
4500000000
```

즉 자산의 최소 단위로 변환해 정수로 저장한다.

이유:

- 부동소수점 오차 방지
- Hash 결과 일관성
- 스마트컨트랙트와 호환성
- 정책 비교 단순화

---

# 9. JSON 정규화

같은 의미의 JSON도 key 순서가 다르면 문자열 Hash가 달라질 수 있다.

따라서 Hash 및 Signature 전에 반드시 Canonicalization을 수행한다.

개념적인 흐름:

```text
Record Object
→ Canonical JSON
→ UTF-8 bytes
→ Hash
→ Signature / Anchor
```

직접 정렬 규칙을 임의 구현하기보다 검증된 canonical JSON 방식을 사용하는 것을 권장한다.

모든 컴포넌트는 동일한 정규화 함수를 공유해야 한다.

예:

```text
canonicalizeRecord(record)
hashRecord(record)
```

를 공용 모듈로 만든다.

---

# 10. Hash

MVP에서는 한 종류로 통일한다.

EVM 친화성을 위해 `keccak256` 사용을 권장한다.

예:

```text
requestHash = keccak256(canonicalRequestBytes)
decisionHash = keccak256(canonicalDecisionBytes)
policyHash = keccak256(canonicalPolicyBytes)
```

Hash가 확인하는 것은:

> **데이터가 과거와 동일한가**

이다.

Hash 자체가 작성자를 증명하지는 않는다.

---

# 11. Digital Signature

Signature는:

> **누가 해당 Record를 만들었는가**

를 확인한다.

역할별 서명:

| Record | 서명 주체 |
|---|---|
| Policy | Enterprise |
| Request | Agent |
| Verification Receipt | Verification Layer |
| Decision | Institution |

MVP에서는 EVM 생태계와 호환되는 `secp256k1` 계열 서명을 권장한다.

가능하면 일반 문자열 서명보다 구조화된 데이터를 명확히 서명하기 위해 `EIP-712 Typed Data` 사용을 권장한다.

Codex 구현 시 모든 Role에 테스트용 key pair를 생성한다.

Private Key는 서버 환경변수에 저장한다.

절대 Repository에 commit하지 않는다.

---

# 12. Public Key Registry

Evidence Bundle 안에 포함된 공개키를 그대로 신뢰하면 안 된다.

예:

```text
"이게 Institution 공개키입니다."
```

라는 값을 공격자가 마음대로 바꿀 수 있기 때문이다.

MVP에서는 사전에 등록된 Key Registry를 둔다.

예:

```json
{
  "enterprise-key-1": "0x...",
  "agent-key-1": "0x...",
  "verification-key-1": "0x...",
  "institution-key-1": "0x..."
}
```

Verifier는 Record의 `key_id`를 이용해 Registry에서 공식 공개키를 찾고 서명을 검증한다.

MVP에서는 정적 config 파일을 사용해도 충분하다.

---

# 13. nonce

Request Record에는 랜덤 `nonce`를 포함한다.

예:

```text
32-byte random value
```

이유:

만약 Hash가 단순히:

```text
hash(amount = 4500)
```

형태라면 공격자가 여러 금액을 Hash해 원본을 추측할 수 있다.

랜덤 nonce를 Record 안에 포함하면 이러한 사전대입 공격을 어렵게 만든다.

nonce는 Evidence Bundle에는 포함되어 검증자가 Hash를 재계산할 수 있어야 한다.

---

# 14. Smart Contract 역할

MVP 스마트컨트랙트는 복잡한 결제 로직을 수행하지 않는다.

역할은 오직:

> **Request / Decision Hash를 외부의 변경하기 어려운 기준점으로 저장**

하는 것이다.

개념적으로 필요한 함수:

```solidity
anchorRequest(
    bytes32 requestKey,
    bytes32 requestHash,
    bytes32 policyHash,
    uint64 decisionDeadline
)

anchorDecision(
    bytes32 requestKey,
    bytes32 decisionHash
)
```

`requestKey`는 `request_id`를 Hash한 bytes32 값으로 만들 수 있다.

예:

```text
requestKey = keccak256("REQ-001")
```

---

# 15. Smart Contract 최소 규칙

다음 규칙을 반드시 적용한다.

### Request 중복 Anchor 금지

이미 존재하는 `requestKey`에 다시 Request를 Anchor할 수 없다.

### Decision 중복 Anchor 금지

이미 Decision이 존재하는 Request에는 다시 Decision을 Anchor할 수 없다.

이렇게 해야 과거 Hash를 덮어쓰는 것을 방지할 수 있다.

### Decision은 Request가 먼저 존재해야 함

Request Anchor 없이 Decision Anchor를 만들 수 없다.

---

# 16. On-chain 상태 예시

정상:

```text
REQ-001

requestHash: 0xAAA
requestAnchoredAt: ...
decisionDeadline: ...

decisionHash: 0xBBB
decisionAnchoredAt: ...
```

누락:

```text
REQ-002

requestHash: 0xCCC
requestAnchoredAt: ...
decisionDeadline: 과거 시점

decisionHash: EMPTY
```

Verifier는 현재 시간이 Deadline을 넘었는지 확인해:

```text
MISSING_DECISION
```

으로 판단할 수 있다.

---

# 17. Event 사용 권장

Contract에서 다음 Event를 발생시키는 것을 권장한다.

```solidity
event RequestAnchored(
    bytes32 indexed requestKey,
    bytes32 requestHash,
    bytes32 policyHash,
    uint64 deadline
);

event DecisionAnchored(
    bytes32 indexed requestKey,
    bytes32 decisionHash
);
```

장점:

- Explorer에서 데모하기 쉬움
- Backend가 Anchor 결과를 추적하기 쉬움
- UI에서 tx hash를 보여주기 쉬움

---

# 18. API 설계

MVP 기준 최소 API 예시.

---

## Agent → Verification Layer

```text
POST /api/requests
```

입력:

```json
{
  "request": { ...signed Request Record... }
}
```

서버 처리:

1. Agent Signature 검증
2. Policy 존재 확인
3. Request Hash 생성
4. On-chain Request Anchor
5. Verification Receipt 생성
6. Mock Institution에 전달

응답:

```json
{
  "request_id": "REQ-001",
  "status": "PENDING",
  "verification_receipt": { ... }
}
```

---

## Verification Layer → Institution

내부 API 예:

```text
POST /internal/institution/requests
```

Institution은:

1. Verification Receipt 검증
2. Policy 조회
3. 금액 비교
4. Decision 생성
5. Decision 서명

---

## Institution → Verification Layer

```text
POST /api/decisions
```

또는 Mock에서는 함수 반환으로 단순화 가능.

Verification Layer는:

1. Institution Signature 검증
2. Request와 연결 확인
3. Decision Hash 생성
4. Decision Anchor
5. DB 상태 업데이트

---

## Evidence Bundle 생성

```text
GET /api/requests/:requestId/evidence
```

응답:

```json
{
  "policy": { ... },
  "request": { ... },
  "verification_receipt": { ... },
  "decision": { ... },
  "anchors": { ... }
}
```

파일명 예:

```text
evidence-bundle-REQ-001.json
```

---

# 19. Database

MVP에서는 일반 DB를 사용한다.

권장 테이블:

```text
policies
requests
verification_receipts
decisions
anchors
```

DB는 운영 편의를 위한 저장소다.

최종 무결성의 유일한 근거로 사용하지 않는다.

DB 내용이 바뀌어도:

- Signature
- On-chain Hash

와 비교해 조작을 탐지해야 한다.

---

# 20. Evidence Bundle

`proof.json`이라는 이름은 ZK Proof와 혼동될 수 있으므로 `evidence-bundle.json` 사용을 권장한다.

포함 항목:

```json
{
  "schema_version": 1,
  "policy": {},
  "request": {},
  "verification_receipt": {},
  "decision": {},
  "anchors": {
    "request": {},
    "decision": {}
  }
}
```

Decision 누락 시:

```json
"decision": null
```

이어야 한다.

---

# 21. Verifier 검증 순서

Verifier는 다음 순서를 따른다.

## Step 1. Schema 확인

필수 Record와 필드 형식 확인.

## Step 2. Key Registry 확인

각 `key_id`가 사전 등록된 공식 키인지 확인.

## Step 3. Signature 확인

- Enterprise Policy
- Agent Request
- Verification Receipt
- Institution Decision

서명을 각각 검증한다.

Decision이 없는 경우 Institution Signature 검증은 생략한다.

## Step 4. Hash 재계산

Canonical JSON을 기준으로:

- policyHash
- requestHash
- decisionHash

를 다시 계산한다.

## Step 5. On-chain Anchor 확인

테스트넷 Contract에서 해당 `requestKey`를 조회한다.

현재 Evidence의 Hash와 On-chain Hash가 동일한지 비교한다.

## Step 6. Request ↔ Decision 연결 확인

Decision의:

```text
request_id
request_hash
policy_id
```

가 실제 Request와 일치하는지 확인.

## Step 7. Policy 재계산

```text
request.amount > policy.max_amount
```

이면 Expected Decision은 `REJECT`.

Institution Decision과 비교한다.

## Step 8. Missing 판단

Decision이 없고:

```text
now > decision_deadline
```

이면:

```text
MISSING
```

아직 Deadline 전이면:

```text
PROCESSING
```

---

# 22. Verifier 최종 상태

최소 다음 상태를 사용한다.

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

Record Hash가 On-chain Anchor와 불일치.

## MISSING

Request는 존재하지만 Deadline 이후에도 Decision이 없음.

## PROCESSING

Decision은 없지만 Deadline 이전.

## INVALID

서명 오류, 공식 요청 아님, Record 연결 불일치 등.

---

# 23. 핵심 오류 코드

예:

```text
INVALID_AGENT_SIGNATURE
INVALID_ENTERPRISE_SIGNATURE
INVALID_INSTITUTION_SIGNATURE
UNVERIFIED_REQUEST
REQUEST_ALREADY_ANCHORED
DECISION_ALREADY_ANCHORED
REQUEST_HASH_MISMATCH
DECISION_HASH_MISMATCH
POLICY_MISMATCH
MISSING_DECISION
INVALID_REQUEST_REFERENCE
```

오류 코드와 사용자 표시 문구는 분리한다.

예:

```text
DECISION_HASH_MISMATCH
```

UI:

> 현재 제출된 결정이 당시 기록된 결정과 일치하지 않습니다.

---

# 24. 데모 데이터

MVP 기본 데이터는 고정한다.

Enterprise:

```text
Acme Corp
```

Policy:

```text
max 4000 USDC
```

Agent:

```text
Treasury Agent
```

Request:

```text
4500 USDC
```

Institution:

```text
Mock Institutional Wallet
```

Decision:

```text
REJECT
LIMIT_EXCEEDED
```

실제 기업명이나 실제 금융기관 이름을 사용하지 않는다.

---

# 25. 데모 1 — 정상 거절

흐름:

```text
Policy 생성
→ Request 생성
→ Request Signature
→ Verification Layer 접수
→ Request Anchor
→ Institution 판단
→ Decision Signature
→ Decision Anchor
→ Evidence Bundle 생성
→ Verifier 실행
```

결과:

```text
VERIFIED
```

---

# 26. 데모 2 — Decision 변조

정상 Evidence Bundle을 복사한 뒤:

```text
reason_code:
LIMIT_EXCEEDED
```

를:

```text
KYT_RISK
```

로 수동 변경한다.

Verifier:

```text
hash(current decision)
!=
on-chain decisionHash
```

결과:

```text
TAMPERED
```

중요:

Institution이 변경된 Decision에 다시 정상 서명을 했더라도, 과거 On-chain Anchor와 Hash가 다르면 TAMPERED로 판단할 수 있도록 테스트하는 것을 권장한다.

---

# 27. 데모 3 — Decision 누락

Request Anchor까지만 수행한다.

Institution Decision 생성을 의도적으로 생략한다.

Deadline 이후 Verifier 실행.

조건:

```text
request exists
decision does not exist
now > deadline
```

결과:

```text
MISSING
```

이 데모가 Track의 `완전성`을 보여주는 핵심이다.

---

# 28. 데모 4 — Institution DB 삭제

정상 Request와 Decision을 만든 후 DB에서 Decision Row를 삭제한다.

하지만 이미 확보된 Evidence Bundle 및 On-chain Anchor를 이용해 Verifier는 정상 검증할 수 있어야 한다.

이 데모의 표현은 정확하게 한다.

잘못된 표현:

> 기관이 DB에서 삭제했다는 사실을 증명한다.

정확한 표현:

> 기관 DB에서 현재 기록을 찾을 수 없어도 당시 Decision의 존재와 무결성을 독립적으로 검증할 수 있다.

---

# 29. 보안 전제

MVP는 다음을 보장하지 않는다.

- Private Key 자체가 탈취된 경우
- Agent와 Institution이 완전히 공모한 경우
- Enterprise까지 포함한 전체 공모
- Verification Layer가 시스템 규칙 자체를 악의적으로 무시하는 경우
- 실제 KYT / AML 데이터의 진실성
- 블록체인 네트워크 자체의 공격

모든 보안 시스템에는 Trust Boundary가 존재하며, 이를 숨기지 않는다.

---

# 30. MVP 구현 우선순위

다음 순서를 권장한다.

## Phase 1 — Crypto Utility

- Canonical JSON
- Hash
- Key Pair
- Signature
- Signature Verification

## Phase 2 — Domain Model

- Policy Record
- Request Record
- Verification Receipt
- Decision Record

## Phase 3 — Mock Flow

- Mock Agent
- Verification Layer
- Mock Institution
- Policy 비교
- Reject 생성

## Phase 4 — Smart Contract

- Anchor Contract
- Request Anchor
- Decision Anchor
- Event

## Phase 5 — Evidence

- Evidence Bundle 생성
- Contract 조회
- Verifier 구현

## Phase 6 — Attack Demo

- Decision 변조
- Decision 누락
- DB Record 삭제

## Phase 7 — UI

- 정상 흐름
- Verifier 결과
- Tx / Hash 가시화

---

# 31. 권장 기술 스택

현재 팀의 구현 편의성을 기준으로 다음을 권장한다.

## Frontend

```text
React + Vite
```

또는 기존 팀 프로젝트에 맞춰 Next.js 사용 가능.

## Backend

```text
Node.js + Express
```

MVP에서는 Agent, Verification Layer, Mock Institution을 하나의 Repository 안에서 모듈로 분리해도 된다.

물리적으로 서버 세 개를 띄울 필요는 없다.

## Database

```text
Supabase PostgreSQL
```

또는 로컬 PostgreSQL.

## Blockchain

```text
EVM Testnet
```

예:

```text
Sepolia
```

## Smart Contract

```text
Solidity
```

## EVM Client

```text
viem
```

또는 ethers.js.

프로젝트 내부에서는 하나만 선택해 통일한다.

---

# 32. 환경변수 예시

```text
DATABASE_URL=

ENTERPRISE_PRIVATE_KEY=
AGENT_PRIVATE_KEY=
VERIFICATION_PRIVATE_KEY=
INSTITUTION_PRIVATE_KEY=

RPC_URL=
CHAIN_ID=
ANCHOR_CONTRACT_ADDRESS=
ANCHOR_WRITER_PRIVATE_KEY=
```

Private Key는 절대 Git에 commit하지 않는다.

`.env.example`에는 값 없이 변수명만 둔다.

---

# 33. Directory 구조 예시

```text
src/
├── agent/
│   └── mockAgent.ts
├── enterprise/
│   └── policy.ts
├── verification/
│   ├── service.ts
│   ├── receipt.ts
│   └── verifier.ts
├── institution/
│   └── mockWallet.ts
├── crypto/
│   ├── canonicalize.ts
│   ├── hash.ts
│   ├── signature.ts
│   └── keys.ts
├── blockchain/
│   ├── anchorClient.ts
│   └── contract.ts
├── evidence/
│   └── bundle.ts
├── db/
│   └── repositories/
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
├── normal-rejection.test.ts
├── tampered-decision.test.ts
├── missing-decision.test.ts
└── deleted-db-record.test.ts
```

---

# 34. 구현 원칙

## 1. MVP에 필요한 기능만 만든다

실제 Agentic Commerce 전체 구현 금지.

## 2. Crypto 로직을 한 곳에 모은다

Hash / Signature 구현을 여러 파일에서 중복하지 않는다.

## 3. Record는 생성 후 직접 수정하지 않는다

상태 변경이 필요하면 새로운 Record 또는 별도 DB 상태를 사용한다.

## 4. Hash 대상과 UI용 데이터를 구분한다

Hash 대상 필드를 명확히 고정한다.

## 5. Blockchain 호출 실패를 명시적으로 처리한다

Anchor 실패 후 Institution에 Request를 전달할지 여부를 애매하게 두지 않는다.

MVP에서는:

> Request Anchor 성공 후에만 Institution으로 전달

을 권장한다.

## 6. Institution DB를 Verifier에서 조회하지 않는다

이 프로젝트의 핵심 조건이다.

Verifier는:

- Evidence Bundle
- Key Registry
- Blockchain

만으로 검증해야 한다.

---

# 35. Production 확장 시 변경되는 부분

MVP:

```text
1 Request
→ 1 Request Anchor

1 Decision
→ 1 Decision Anchor
```

Production:

```text
많은 Request / Decision
→ Append-only Evidence Log
→ Merkle Batch
→ Root Anchor
```

확장 시 고려:

- Merkle Tree
- Merkle Proof
- Sparse Merkle Tree
- Batch ID
- Checkpoint sequence
- previous_root
- Batch deadline
- Multi-region Verification Layer
- Key rotation
- HSM / KMS
- Actual custody wallet integration

이번 MVP에서는 구현하지 않는다.

---

# 36. Codex 작업 규칙

Codex는 구현 중 다음 원칙을 따른다.

1. `PROJECT_OVERVIEW.md`의 제품 범위를 임의로 확대하지 않는다.
2. 실제 금융기관 연동을 임의로 추가하지 않는다.
3. 실제 자금 전송 기능을 구현하지 않는다.
4. 정책은 `max_amount` 하나만 사용한다.
5. 모든 금액은 base unit 정수로 처리한다.
6. 모든 Hash 대상 Record는 동일한 canonicalization 함수를 사용한다.
7. Verifier는 Institution DB를 참조하지 않는다.
8. 각 Record의 서명 검증을 생략하지 않는다.
9. On-chain Anchor가 있는 Record는 반드시 Chain 데이터와 비교한다.
10. 새로운 보안 전제를 추가할 경우 문서에 먼저 명시한다.
11. 구현 세부사항과 문서 내용이 달라지면 `DEVELOPMENT.md`를 함께 수정한다.
12. MVP에서는 Merkle batching을 구현하지 않는다.
13. Production 확장 설명에서만 Merkle / Sparse Merkle Tree를 언급한다.

---

# 37. 완료 조건

다음이 모두 동작하면 MVP 핵심 개발이 완료된 것으로 본다.

- [ ] Enterprise Policy를 생성하고 서명할 수 있다.
- [ ] Agent가 Request를 생성하고 서명할 수 있다.
- [ ] Verification Layer가 Agent Signature를 검증한다.
- [ ] Request Hash를 테스트넷에 Anchor한다.
- [ ] Verification Receipt를 생성한다.
- [ ] Mock Institution이 Receipt를 검증한다.
- [ ] Institution이 Policy를 기준으로 Request를 거절한다.
- [ ] Institution이 Decision을 서명한다.
- [ ] Decision Hash를 테스트넷에 Anchor한다.
- [ ] Evidence Bundle을 생성할 수 있다.
- [ ] Third-party Verifier가 기관 DB 없이 정상 거절을 검증한다.
- [ ] Decision 내용을 수정하면 `TAMPERED`가 나온다.
- [ ] Deadline 이후 Decision이 없으면 `MISSING`이 나온다.
- [ ] Institution DB에서 Record를 삭제해도 보유한 Evidence와 Chain Anchor로 과거 기록을 검증할 수 있다.

---

# 38. 핵심 기술 요약

이 프로젝트에서 각 기술의 역할은 다음과 같다.

| 기술 | 역할 |
|---|---|
| Hash | Record가 나중에 변경됐는지 확인 |
| Digital Signature | 누가 해당 Record를 만들었는지 확인 |
| Verification Layer | 요청을 먼저 관측하고 증거 흐름 연결 |
| Verification Receipt | 해당 요청이 실제 Gateway를 통과했음을 증명 |
| Blockchain Anchor | 과거 Hash를 독립적인 외부 기준점에 고정 |
| Deadline | Decision 누락 판단 기준 |
| Evidence Bundle | 분쟁 시 제3자에게 전달되는 증거 묶음 |
| Third-party Verifier | 기관 DB 없이 전체 증거를 다시 검증 |
| Merkle Tree | 실서비스 확장 시 많은 Record를 저렴하게 Anchor하기 위한 최적화 |

---

# 39. 가장 중요한 개발 원칙

> **Blockchain에 모든 데이터를 저장하는 것이 목적이 아니다.**

원본 요청과 결정은 오프체인에서 처리한다.

Blockchain은 오직:

> **“그 시점에 이 Record의 지문이 실제로 존재했다.”**

를 증명하는 외부 기준점으로 사용한다.

그리고 최종적으로 제3자가:

> **“기관이 지금 보여주는 로그가 맞는가?”**

를 묻는 대신:

> **“당시 남겨진 증거와 현재 제출된 Record가 일치하는가?”**

를 확인할 수 있게 만드는 것이 프로젝트의 핵심이다.
