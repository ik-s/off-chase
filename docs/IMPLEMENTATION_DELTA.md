# 원안과 Python 백엔드 시제품의 차이

이 브랜치는 [프로젝트 원안](PROJECT_VISION.md)과 `AGENTS/DEVELOPMENT_FINAL.md`를 보존하면서, 독립 검증이 가능한 백엔드 흐름을 먼저 실행해 본 시제품입니다. 원안의 확정 MVP를 완료했다고 주장하지 않습니다.

| 항목 | 원안의 확정 기준 | 이 브랜치의 동작 |
| --- | --- | --- |
| 구현 스택 | TypeScript, Express, Supabase PostgreSQL | Python, FastAPI, SQLite |
| 서명·해시 | EVM 서명, canonical JSON, Keccak-256 | Ed25519, 정렬된 JSON, SHA-256. 서로 호환되지 않음 |
| 외부 앵커 | Sepolia의 Request·Decision 앵커 | 별도 키·DB를 가진 witness가 전체 로그 체크포인트에 서명. 온체인 앵커가 아님 |
| 처리 경로 | Verification Layer가 기관보다 먼저 Request를 확인하는 필수 Gateway | 단일 운영자 API가 접수와 정책 판단을 기록. 독립 기관 Wallet 전달·검증 단계는 없음 |
| 정책 연결 | Request가 사전에 `policy_id`, `policy_hash`를 포함 | 결정 시점에 기업이 서명한 정책을 첨부. 접수 당시 정책 사전 약속은 없음 |
| 결정 서명 | Institution과 Verification Layer의 역할·키 분리 | 운영자 issuer 키가 접수·결정 로그 항목에 모두 서명 |
| 결정 누락 | 온체인 기준 시각과 기한을 비교해 `PROCESSING` 또는 `MISSING` | 지정한 체크포인트에 결정이 없으면 `MISSING_DECISION`. 기한 위반 여부는 판단하지 않음 |
| 증거 파일 | 사건별 Evidence Bundle과 체인 참조 | 전체 로그가 포함된 `proof.json`, 별도 접수·witness 영수증 |

현재 시제품은 요청·정책·결정 서명 검증, 로그 무결성, 별도로 보유한 접수 영수증을 통한 누락 탐지, witness의 롤백·분기 거부를 자동 테스트와 실제 HTTP 왕복으로 검증합니다. witness를 같은 개발 호스트의 별도 컨테이너로 실행한 데모는 독립 기관 운영을 증명하지 않습니다.

원안대로 진행하려면 Sepolia 계약과 앵커 검증, Request의 정책 사전 연결, Gateway와 Institution의 분리, 온체인 기준 기한 상태, 사건별 Evidence Bundle, 정해진 스택으로의 구현이 추가로 필요합니다. 기존 Python 증명 형식은 EVM 계약 및 원안의 Record 스키마와 직접 호환되지 않으므로 마이그레이션 설계가 선행돼야 합니다.
