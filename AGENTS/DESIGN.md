# Trust404 Track 3 — DESIGN.md

## 0. 문서 목적

이 문서는 Trust404 Track 3 MVP의 **화면 구조와 시각 표현 기준**을 정의한다.

개발 로직, API, Record Schema, Hash / Signature 규칙은 `DEVELOPMENT.md`를 따른다.

이 문서의 목적은 심사자가 5분 안에 다음을 이해하도록 만드는 것이다.

1. 어떤 결제 요청이 있었는가
2. 어떤 정책이 적용됐는가
3. 왜 승인 / 거절됐는가
4. 해당 판단이 실제로 검증됐는가
5. 기록을 조작하거나 누락했을 때 무엇이 달라지는가

핵심 디자인 방향:

> **화려한 금융 대시보드가 아니라, 결제 판단의 증거를 조사하는 감사·검증 도구**

---

# 1. 핵심 사용자 경험

첫 화면에서 다음 한 줄이 바로 이해돼야 한다.

```text
4,500 USDC 요청
→ 한도 4,000 USDC
→ REJECT
→ VERIFIED
```

심사자가 Hash나 Signature를 먼저 이해할 필요는 없다.

정보 노출 순서는 다음과 같다.

```text
1. 금액
2. 최종 판단
3. 적용 정책
4. 검증 상태
5. 사건 흐름
6. 기술적 증거
```

기술 정보는 클릭했을 때 깊게 볼 수 있게 한다.

---

# 2. 디자인 레퍼런스

## 2.1 첨부 레퍼런스 — Agent Trust Arena

첨부된 화면에서 가져올 부분:

- 짙은 네이비 기반의 차분한 보안 도구 느낌
- 얇은 Border로 구역을 나누는 카드 구성
- 좌 / 중앙 / 우가 명확히 분리된 데스크톱형 정보 구조
- 한 화면에 여러 정보를 보여주되 계층을 명확히 나누는 방식
- 상태값과 핵심 지표만 강조색을 사용하는 방식
- 기술 정보가 많아도 카드 단위로 잘게 나누어 읽기 쉽게 만드는 방식

가져오지 않을 부분:

- 게임 / Arena / Score 느낌
- 여러 Agent를 경쟁시키는 구조
- 과도한 카드 수
- 여러 색상을 장식적으로 사용하는 방식

우리 화면은 더 차분하고 **Audit Tool(감사 도구)**에 가깝게 정리한다.

---

## 2.2 Vercel Logs

가져올 부분:

```text
필터
→ 기록 목록
→ 선택한 기록 상세
```

3단 정보 구조.

우리 프로젝트에서는:

```text
사건 목록
→ 사건 Timeline
→ 선택한 Evidence 상세
```

로 적용한다.

---

## 2.3 Sentry Issue Detail

가져올 부분:

- 하나의 사건을 시간순으로 설명
- 최종 상태만 보여주지 않고 왜 그런 결과가 나왔는지 단계별로 설명
- 오류 / 사건의 원인을 Evidence 단위로 따라갈 수 있는 구조

우리 프로젝트에서는:

```text
Policy
→ Request
→ Verification Receipt
→ Decision
→ On-chain Anchor
```

흐름으로 적용한다.

---

## 2.4 Stripe Workbench

가져올 부분:

- 결제 금액과 상태를 가장 쉽게 읽히게 표시
- Request ID, 시각, 이벤트, 원본 데이터의 계층화
- 금융 데이터는 사람이 먼저 읽고 기술 데이터는 그 다음에 읽게 만드는 방식

---

## 2.5 Etherscan Transaction Detail

가져올 부분:

- Transaction Hash
- Block Number
- Timestamp
- Contract Address
- Record Hash

같은 온체인 증거 상세 표현.

단, 첫 화면에서 바로 노출하지 않는다.

```text
[On-chain Evidence 보기]
```

를 눌렀을 때 펼쳐지는 구조로 사용한다.

---

# 3. 전체 화면 구조

MVP는 **단일 데스크톱 Web App**을 기준으로 한다.

권장 화면 폭:

```text
1440px 이상
```

기본 레이아웃:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Header                                                              │
├───────────────┬───────────────────────────────┬─────────────────────┤
│               │                               │                     │
│ Case List     │ Case Timeline                 │ Evidence Detail     │
│               │                               │                     │
│ 사건 목록      │ 선택한 요청의 시간순 흐름        │ 선택 Evidence 검증  │
│               │                               │                     │
└───────────────┴───────────────────────────────┴─────────────────────┘
```

권장 비율:

```text
Left   260–300px
Center 520–640px
Right  420–520px
```

---

# 4. Header

Header는 매우 단순하게 구성한다.

왼쪽:

```text
Trust404
Verifiable Off-chain Decision
```

또는 최종 프로젝트명.

오른쪽:

```text
Network: Sepolia
Anchor Contract
Verifier
```

정도만 제공한다.

Wallet Connect는 핵심 UX가 아니므로 별도 기능이 꼭 필요하지 않다면 강조하지 않는다.

---

# 5. 첫 화면 핵심 요약

선택된 사건의 가장 중요한 정보를 한 번에 보여주는 Summary Card를 중앙 상단에 둔다.

예:

```text
REQ-001

4,500 USDC
REJECTED

Applied Policy
1회 최대 4,000 USDC

Reason
LIMIT_EXCEEDED
한도 초과

Verification
VERIFIED
```

## 강조 순서

### 1순위

```text
4,500 USDC
```

가장 크게.

### 2순위

```text
REJECTED
```

### 3순위

```text
VERIFIED
```

### 4순위

```text
Policy: Max 4,000 USDC
```

Hash와 Tx Hash는 이 Summary에서 강조하지 않는다.

---

# 6. 왼쪽 — Case List

왼쪽 영역은 사건 목록이다.

예:

```text
All Cases

REQ-001
4,500 USDC
REJECTED
VERIFIED

REQ-002
2,000 USDC
APPROVED
VERIFIED

REQ-003
4,500 USDC
—
MISSING

REQ-004
4,500 USDC
REJECTED
TAMPERED
```

## 필터

최소 필터:

```text
ALL
VERIFIED
PROCESSING
MISSING
TAMPERED
INVALID
```

복잡한 검색 / 고급 필터는 MVP에서 구현하지 않는다.

---

# 7. 중앙 — Case Timeline

선택한 Request 한 건의 사건 흐름을 시간순으로 보여준다.

기본 순서:

```text
Policy
↓
Request
↓
Verification Receipt
↓
Decision
↓
On-chain Evidence
```

각 Step에는 다음만 우선 노출한다.

## Policy

```text
Enterprise Policy
Max 4,000 USDC
Policy v1
```

## Request

```text
Agent Request
4,500 USDC
REQ-001
```

## Verification Receipt

```text
Request Observed
Gateway Verified
```

## Decision

```text
Institution Decision
REJECT
LIMIT_EXCEEDED
```

## On-chain Evidence

```text
Request Anchored
Decision Anchored
```

각 Step을 클릭하면 오른쪽 Evidence Detail이 바뀐다.

---

# 8. 오른쪽 — Evidence Detail

오른쪽은 현재 선택한 Evidence의 상세 정보와 검증 근거를 보여준다.

예:

```text
Decision Record

Status
REJECT

Reason
LIMIT_EXCEEDED

Request Reference
REQ-001

Policy
payment-limit-v1

Verification Checks

✓ Institution Signature
✓ Request Hash Match
✓ Policy Hash Match
✓ On-chain Anchor Match
✓ Decision matches policy
```

가장 중요한 원칙:

> **VERIFIED라는 결과만 보여주지 말고 왜 VERIFIED인지 보여준다.**

---

# 9. 검증 근거 표현

검증 결과는 체크리스트 형태로 보여준다.

정상:

```text
✓ Schema valid
✓ Official key confirmed
✓ Signature valid
✓ Record hash matched
✓ On-chain anchor matched
✓ Policy matched
✓ Decision matched policy
```

변조:

```text
✓ Schema valid
✓ Official key confirmed
! Decision hash mismatch
! On-chain anchor does not match
```

누락:

```text
✓ Request anchor exists
✓ Decision deadline passed
! Decision anchor missing
```

---

# 10. 상태 표현

색상은 장식이 아니라 **상태 구분**에만 사용한다.

## VERIFIED

의미:

```text
증거 검증 성공
```

Color:

```text
Green
```

추천:

```text
#22C55E
```

---

## PROCESSING

의미:

```text
아직 Decision Deadline 이전
```

Color:

```text
Amber
```

추천:

```text
#F59E0B
```

---

## TAMPERED

의미:

```text
과거 Anchor와 현재 Record 불일치
```

Color:

```text
Red
```

추천:

```text
#EF4444
```

---

## MISSING

의미:

```text
Deadline 이후 Decision이 존재하지 않음
```

Color:

```text
Red
```

TAMPERED와 동일한 위험 계열을 사용하되 Label로 구분한다.

---

## INVALID

의미:

```text
공식 Evidence로 인정할 수 없음
```

Color:

```text
Red / Neutral Red
```

---

# 11. 기본 Color System

전체는 Dark Theme를 기본으로 한다.

추천:

```text
Background        #070B18
Surface 1         #0D1324
Surface 2         #111A2E
Border            #25304A

Primary Text      #F8FAFC
Secondary Text    #94A3B8
Muted Text        #64748B

Verified          #22C55E
Processing        #F59E0B
Danger            #EF4444
```

청록 / 파랑은 상태 의미가 없으므로 장식용으로 과하게 사용하지 않는다.

버튼 Primary는 Neutral 또는 Accent 한 가지로 제한한다.

---

# 12. Typography

## 일반 본문

한국어가 잘 읽히는 Sans-serif 사용.

추천:

```text
Pretendard
Inter
system-ui
```

우선순위 예:

```css
font-family:
  Pretendard,
  Inter,
  system-ui,
  sans-serif;
```

## 기술 데이터

다음 항목은 Monospace(고정폭 서체)를 사용한다.

```text
Hash
Tx Hash
Address
request_id
policy_id
reason_code
Raw JSON
```

추천:

```text
JetBrains Mono
ui-monospace
monospace
```

---

# 13. 정보 계층

한 카드 안에서 다음 순서를 지킨다.

```text
Label
↓
Human-readable Value
↓
Technical Value
```

예:

```text
Decision

거절
REJECT
```

또는:

```text
Reason

1회 결제 한도 초과
LIMIT_EXCEEDED
```

사용자가 영어 코드부터 읽게 만들지 않는다.

---

# 14. 기술 정보 노출 규칙

첫 화면에서 다음은 숨긴다.

```text
Raw JSON
Full Hash
Full Signature
Contract ABI
긴 Address
```

기본 표현:

```text
0xA13F...91BC
```

상세 패널이나 Expand를 눌렀을 때 전체 값을 보여준다.

---

# 15. On-chain Evidence 상세

별도 Expand 영역으로 제공한다.

예:

```text
On-chain Evidence

Network
Sepolia

Transaction
0xABC...123

Block
#9123812

Recorded At
2026-09-19 02:13:42 UTC

Request Hash
0xDEF...456

Policy Hash
0x789...ABC
```

가능하면 Explorer Link를 제공한다.

---

# 16. Evidence Bundle UX

Evidence Bundle은 사용자가 이해할 수 있게 다음 이름으로 표시한다.

```text
Evidence Bundle
판단 검증용 증거 파일
```

기능:

```text
Download Evidence
Upload Evidence
Verify
```

업로드 후 결과:

```text
Verification Result
VERIFIED
```

아래에 검증 단계를 표시한다.

---

# 17. 공격 데모 UX

심사자가 정상 / 공격 상태를 빠르게 비교할 수 있어야 한다.

MVP 공격 시나리오:

```text
Normal
Decision Tampered
Decision Missing
Institution DB Deleted
```

데모 기능은 별도의 `Demo Controls` 영역에서 실행한다.

---

## 17.1 Normal

결과:

```text
VERIFIED
```

---

## 17.2 Decision Tampered

화면에서 변경 전 / 후를 바로 보여준다.

```text
Before
LIMIT_EXCEEDED

After
KYT_RISK
```

검증:

```text
Decision Hash mismatch
```

결과:

```text
TAMPERED
```

---

## 17.3 Decision Missing

```text
Request Anchored
Decision 없음
Deadline 초과
```

결과:

```text
MISSING
```

---

## 17.4 Institution DB Deleted

표현에 주의한다.

잘못된 표현:

```text
기관이 DB Record를 삭제했다는 사실을 증명
```

정확한 표현:

```text
기관 DB에 현재 Decision이 없어도
기존 Evidence Bundle과 On-chain Anchor로
과거 Decision을 검증
```

결과:

```text
VERIFIED
```

---

# 18. Raw JSON

Evidence Detail 최하단에:

```text
View Raw Record
```

Collapse를 둔다.

펼치면:

```json
{
  "request_id": "REQ-001",
  "decision": "REJECT",
  "reason_code": "LIMIT_EXCEEDED"
}
```

형태로 보여준다.

Raw JSON은 기본적으로 접혀 있어야 한다.

---

# 19. 빈 상태

아직 Request가 없을 경우:

```text
No decision evidence yet.

새로운 Agent Payment Request를 실행하면
여기에 검증 가능한 기록이 표시됩니다.
```

기술적인 Error 문구를 먼저 보여주지 않는다.

---

# 20. 로딩 / 처리 중 상태

Anchor가 진행 중이면:

```text
Request received
↓
Creating on-chain anchor...
```

처럼 현재 Step을 알려준다.

`PROCESSING`은 실패가 아니다.

Amber 계열로 표시한다.

---

# 21. 반응형 범위

해커톤 발표는 Desktop을 기준으로 한다.

## [확정]

Desktop:

```text
1440px 이상 최적화
```

Tablet / Mobile은 기본적인 깨짐 방지만 대응한다.

모바일용 별도 UX를 만드는 것은 MVP 범위 밖이다.

---

# 22. 개발 컴포넌트 기준

권장 컴포넌트:

```text
<AppShell />

<Header />

<CaseList />
<CaseListItem />
<CaseFilter />

<CaseSummary />

<EvidenceTimeline />
<EvidenceTimelineItem />

<EvidenceDetail />
<VerificationChecklist />

<StatusBadge />

<OnchainEvidence />

<EvidenceBundleActions />

<DemoControls />

<RawJsonViewer />
```

디자인 컴포넌트는 개발 비즈니스 로직과 분리한다.

---

# 23. 상태 Badge 기준

모든 Status는 같은 컴포넌트를 사용한다.

예:

```tsx
<StatusBadge status="VERIFIED" />
```

Status별 색상은 한 곳에서 관리한다.

```text
VERIFIED   Green
PROCESSING Amber
TAMPERED   Red
MISSING    Red
INVALID    Red
```

---

# 24. 데모용 기본 사건

기본 선택 Case:

```text
Request ID
REQ-001

Policy
Max 4,000 USDC

Request
4,500 USDC

Decision
REJECT

Reason
LIMIT_EXCEEDED

Verification
VERIFIED
```

앱이 실행되면 이 시나리오를 가장 쉽게 재현할 수 있어야 한다.

---

# 25. 디자인 우선순위

## 1순위

심사자가 3초 안에 이해:

```text
4,500 USDC
>
4,000 USDC

→ REJECT
```

## 2순위

왜 결과를 신뢰할 수 있는지 이해:

```text
Signature
Hash
Policy
On-chain Anchor
```

## 3순위

공격 후 무엇이 깨졌는지 비교:

```text
Before
vs
After
```

## 4순위

Raw JSON / Tx Hash 등 기술 세부정보 탐색.

---

# 26. 하지 말아야 할 것

- Agent 성능 점수
- Agent Leaderboard
- 게임형 점수판
- 복잡한 금융 차트
- 장식 목적의 그래프
- 여러 색의 Gradient 남발
- 첫 화면부터 Raw JSON 표시
- Hash를 핵심 정보보다 크게 표시
- 불필요한 Wallet Dashboard
- 실제 결제 앱처럼 꾸미기
- 한 화면에 모든 기술정보 펼쳐놓기

---

# 27. 최종 화면 인상

최종 화면은 다음 느낌이어야 한다.

```text
Vercel Logs
+
Sentry Issue Detail
+
Stripe Workbench
+
Etherscan Evidence
```

하지만 시각적 분위기는 첨부된 `Agent Trust Arena`처럼:

- Dark
- Dense but organized
- Thin border
- Serious
- Security / Audit Tool

느낌을 가져간다.

한 문장으로 정리하면:

> **“결제 한 건을 클릭하면, 그 요청이 왜 거절됐고 그 판단을 왜 믿을 수 있는지 끝까지 추적할 수 있는 디지털 감사 화면.”**

---

# 28. 최종 확인 기준

디자인 완료 전 다음 질문을 확인한다.

- [ ] 첫 화면에서 `4,500 USDC → 4,000 USDC 한도 → REJECT`가 바로 읽히는가?
- [ ] `VERIFIED`가 무엇을 의미하는지 근거까지 확인할 수 있는가?
- [ ] Policy → Request → Receipt → Decision 순서가 자연스럽게 보이는가?
- [ ] Hash / JSON 같은 기술 정보가 핵심 정보보다 먼저 나오지 않는가?
- [ ] TAMPERED 상태에서 무엇이 변경됐는지 비교 가능한가?
- [ ] MISSING 상태에서 Request는 존재하고 Decision만 없다는 점이 보이는가?
- [ ] Evidence Bundle 다운로드 / 업로드 위치가 명확한가?
- [ ] On-chain Evidence를 필요할 때만 펼쳐볼 수 있는가?
- [ ] 색상이 상태 구분 외의 장식 목적으로 과하게 사용되지 않았는가?
- [ ] 심사자가 5분 안에 Normal / Tampered / Missing / DB Deleted 시나리오를 비교할 수 있는가?
