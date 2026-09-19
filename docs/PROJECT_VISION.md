# Trust404 Track 3 — Verifiable Off-chain Decision Layer for Agent Payments

> **기관의 현재 로그를 믿는 것이 아니라, 당시 남겨진 증거를 검증한다.**

AI Agent가 기업을 대신해 디지털자산 결제를 요청하고, 기관 Wallet이 실제 실행 전에 정책에 따라 승인·거절하는 환경을 가정합니다.

이 프로젝트는 **Agent와 Institution 사이에서 발생한 오프체인 결제 판단을 검증 가능한 증거로 남기고, 이후 제3자가 Institution 내부 DB 없이도 당시 사실관계를 독립적으로 검증할 수 있게 하는 Verification Layer**를 구현합니다.

---

## Why

온체인에서 실제로 실행된 거래는 블록체인에 기록이 남습니다.

하지만 Agent의 요청이 기관의 정책 검사 단계에서 거절되면 실제 결제가 실행되지 않을 수 있으며, 다음과 같은 정보는 기관 내부 로그에만 남을 수 있습니다.

- Agent가 실제로 어떤 요청을 보냈는가
- 당시 어떤 기업 정책이 적용됐는가
- 기관이 어떤 결정을 내렸는가
- 해당 결정이 정책과 일치했는가
- 과거 기록이 이후 수정되거나 누락되지는 않았는가

분쟁이 발생했을 때 어느 한쪽의 내부 DB만 신뢰해서는 제3자가 당시 사실관계를 독립적으로 확인하기 어렵습니다.

---

## What We Build

우리는 Agent Payment 전체를 새로 만들지 않습니다.

이번 MVP는 다음 하나의 흐름에 집중합니다.

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

Verification Layer는 선택적 로그 서비스가 아니라 **Agent와 Institution 사이의 필수 Gateway**로 동작합니다.

평상시에는 요청과 판단의 증거를 남기고, 분쟁 시에는 제3자가 해당 증거를 다시 검증합니다.

---

## MVP Scenario

대표 시나리오는 하나로 고정합니다.

```text
Enterprise Policy
1회 결제 한도: 4,000 USDC

Agent Request
4,500 USDC

Institution Decision
REJECT / LIMIT_EXCEEDED
```

Verifier는 Institution의 현재 DB를 신뢰하지 않고 다음을 확인합니다.

```text
요청이 실제 존재했는가
        ↓
Agent가 실제 서명했는가
        ↓
당시 Policy가 무엇이었는가
        ↓
Institution이 어떤 Decision을 남겼는가
        ↓
Decision이 Policy와 일치하는가
        ↓
당시 남겨진 증거와 현재 Record가 일치하는가
```

---

## Verification Goals

Trust404 Track 3의 핵심 기준에 맞춰 네 가지를 검증합니다.

### Immutability — 불변성

과거 Request나 Decision 내용이 변경되면 탐지합니다.

### Completeness — 완전성

Verification Layer가 관측한 Request에 대응하는 Decision이 정해진 시간 안에 존재하지 않으면 `MISSING`으로 판단합니다.

### Independent Verification — 독립 검증

Institution DB 없이 Evidence Bundle과 공개 검증 정보만으로 한 건의 판단을 다시 검증합니다.

### Non-repudiation — 부인 방지

Agent와 Institution의 서명을 이용해 이후 자신의 Request / Decision을 쉽게 부인하지 못하도록 합니다.

---

## Verifier Status

MVP에서는 다음 상태만 사용합니다.

| Status | Meaning |
|---|---|
| `VERIFIED` | 모든 증거와 정책 판단이 정상 |
| `TAMPERED` | 현재 Record가 과거 On-chain Anchor와 불일치 |
| `PROCESSING` | Request는 존재하지만 Decision 기한 이전 |
| `MISSING` | Decision 기한 이후에도 공식 Decision이 없음 |
| `INVALID` | 서명·연결 관계 등 공식 Evidence 조건을 충족하지 못함 |

---

## Demo Scenarios

### 1. Normal Rejection

```text
4,500 USDC Request
→ 4,000 USDC Policy
→ REJECT / LIMIT_EXCEEDED
→ VERIFIED
```

### 2. Decision Tampering

```text
Original
LIMIT_EXCEEDED

Modified
KYT_RISK

→ On-chain Hash mismatch
→ TAMPERED
```

### 3. Missing Decision

```text
Request Anchor exists
Decision does not exist

Deadline before
→ PROCESSING

Deadline after
→ MISSING
```

### 4. Institution DB Deletion

Institution DB에서 Decision Row가 사라져도, 이미 확보한 Evidence와 On-chain Anchor를 이용해 과거 Decision을 독립적으로 검증합니다.

> 이 데모는 “기관이 삭제 행위를 했다는 사실”을 증명하는 것이 아니라, **현재 기관 DB에 Record가 없어도 당시 Decision의 존재와 무결성을 확인할 수 있음**을 보여줍니다.

---

## Evidence Bundle

분쟁 시 제3자가 받는 한 사건의 증거 묶음입니다.

```text
evidence-bundle-REQ-001.json
```

포함 내용:

```text
Policy
Request
Verification Receipt
Decision
Anchor Information
```

Evidence Bundle 자체는 수정 가능한 일반 JSON 파일입니다.

중요한 것은 파일을 수정할 수 없게 만드는 것이 아니라:

> **파일이 변경되면 Signature / Hash / On-chain Anchor 검증에서 반드시 드러나게 만드는 것**

입니다.

---

## Blockchain Role

Blockchain에 원본 결제 데이터를 모두 저장하지 않습니다.

Blockchain은 오직:

> **“이 시점에 이 Record의 Hash가 실제로 존재했다.”**

를 고정하는 외부 기준점으로 사용합니다.

```text
Off-chain Record
→ Hash
→ On-chain Anchor
```

---

## Tech Stack

### Application

- TypeScript
- React + Vite
- Node.js + Express
- Supabase PostgreSQL

### Verification / EVM

- `viem`
- `canonicalize`
- `zod`
- Solidity
- OpenZeppelin Contracts
- Hardhat
- Sepolia Testnet

---

## Core Libraries

| Library | Purpose |
|---|---|
| `viem` | Hash, Signature, RPC, Contract interaction |
| `canonicalize` | 동일 JSON → 동일한 문자열 표현 |
| `zod` | Record / Evidence Bundle Schema 검증 |
| `@openzeppelin/contracts` | Anchor Contract 접근 권한 |
| `hardhat` | Contract 개발·테스트·배포 |
| `@supabase/supabase-js` | PostgreSQL 접근 |

AgentKit, AP2 SDK, x402, ERC-4337 Wallet SDK 등은 이번 MVP에 사용하지 않습니다.

핵심 검증 로직에 집중하기 위해 Agent와 Institution은 Mock으로 구현합니다.

---

## Project Scope

### In Scope

- 기업 Policy 한 가지: `max_amount`
- Signed Agent Request
- Mandatory Verification Gateway
- Signed Institution Decision
- Request / Decision On-chain Anchor
- Verification Receipt
- Evidence Bundle
- Independent Verifier
- Tampered / Missing / DB Deleted Demo

### Out of Scope

- 실제 자금 전송
- 실제 금융기관 연동
- 실제 LLM Agent
- Agent Payment 전체 프로토콜
- AP2 전체 연동
- KYT / AML 판단 정확성
- 복잡한 정책 엔진
- Merkle batching
- Key Rotation
- 실제 Custody Wallet

---

## Documents

프로젝트 문서는 역할별로 분리합니다.

### `PROJECT_OVERVIEW.md`

무엇을 왜 만드는지 설명합니다.

- 문제 정의
- 제품 방향
- MVP 범위
- 핵심 사용자 흐름
- 데모 시나리오

### `DEVELOPMENT.md`

실제 구현 기준입니다.

- Record Schema
- Hash / Signature
- Policy Hash
- Deadline
- Anchor Contract
- Evidence Bundle
- Verifier
- API
- Tests

### `DESIGN.md`

검증 과정을 심사자에게 이해하기 쉽게 보여주는 화면 기준입니다.

- Case List
- Evidence Timeline
- Evidence Detail
- 상태 표현
- 공격 데모 UX

---

## Development Principle

이 프로젝트의 목적은 Blockchain에 모든 것을 기록하는 것이 아닙니다.

```text
Agent Request
     ↓
Verification Layer
     ↓
Institution Decision
     ↓
Evidence
     ↓
Independent Verification
```

최종적으로 우리가 답하려는 질문은 하나입니다.

> **Institution이 지금 보여주는 내부 로그를 믿지 않고도, 당시 어떤 Request와 Decision이 실제로 존재했는지 제3자가 검증할 수 있는가?**

---

## Hackathon

**Trust404 — Track 3: Verifiable Off-chain Decisions**

MVP는 넓은 Agentic Commerce 제품을 만드는 대신, **한 건의 오프체인 거절을 끝까지 검증하는 핵심 경로의 기술 완성도**에 집중합니다.
