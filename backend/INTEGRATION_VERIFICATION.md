# 실제 연동 검증 — 2026-09-20

브랜치: `develop` · Supabase: Off-Chase (서울) · 체인: Sepolia (11155111).
사용자가 설정한 역할별 서명 계정과 배포 컨트랙트 `0x7ae38b44e8c3f5d52747492ab2dd57b2f1a8f7d6`를 사용했다.
Agent·기관은 MVP 서버 모듈이며, 서명·DB 저장·온체인 기록·검증은 실제 수행했다. USDC 송금은 실행하지 않았다.

| 시나리오 | 요청 ID | 실제 결과 |
| --- | --- | --- |
| 정상 거절 | REQ-26e7a4e0-f1be-4244-b0ca-7c0dc587b5ab | 4,500 / 4,000 → REJECT / LIMIT_EXCEEDED → VERIFIED |
| 정책 기록 변조 | REQ-9b6ee530-ce4a-44fc-b743-3506c48d9b06 | 3,500 요청, 원본 한도 4,000 보존, 제출 사본 3,000 → TAMPERED |
| 알 수 없는 거절 | REQ-4aeb22a7-5a8b-415c-9aea-e0d962327b84 | REJECT / KYT_RISK → VERIFIED, 기관 서명 passed, 사유 판단 not-applicable |
| 응답 누락 | REQ-095826f9-d8ba-4920-8e9c-d6eec123cc04 | 실제 체인 시각으로 PROCESSING → MISSING 전환 확인 |

정상 사례의 [Request 트랜잭션](https://sepolia.etherscan.io/tx/0xe86365341a122a7a6cb020379a08eca05cd7a632bae2fbb68f4f287a9be4d908)과 [Decision 트랜잭션](https://sepolia.etherscan.io/tx/0x5e2e5b8417eda4587db1b74a863423f0111931854868e7dded8ab28b0c36af41)을 실제 Verifier로 확인했다.

서버 프로세스 종료·재시작 후 다섯 사건의 목록과 상태가 유지됐다. 정상 사건을 JSON으로 다운로드하고 다시 검증해 VERIFIED를 확인했다. 브라우저에서도 실제 사건 목록과 요청 → 판단 → 증거 검증의 단계, 실제 검사 결과를 확인했다.

## 발견·수정한 저장 오류

최초 요청 REQ-2891f23f-db8a-4d73-bec4-e944952a99f8은 Request Anchor 이후 저장에 실패했다. 기존 DB 함수가 JSON `null`을 SQL NULL과 구분하지 못해, 결정이 없는 요청에서 잘못된 Decision 삽입을 시도했다.

`20260920105620_pending_evidence.sql`로 수정하고 완료된 증거를 pending으로 덮어쓰는 것도 차단했다. 실제 DB에서 덮어쓰기 거부를 검증했다. Gateway는 이미 생성된 Request Anchor를 원래 블록·이벤트에서 복구하며 중복 트랜잭션을 전송하지 않는다.

최초 요청은 원래 30초 기한이 지난 상태이므로 MISSING으로 보존했다. 성공한 사례로 변경하거나 삭제하지 않았다.

## 자동 검사

- 백엔드 단위 테스트 28개 통과.
- 로컬 체인 테스트 24개 통과. 네 시나리오 HTTP 통합과 요청 Anchor 복구 포함.
- 프론트 테스트 18개 및 프로덕션 빌드 통과.
- `.env`와 실제 `key-registry.json`은 Git 제외 상태 확인. 개인키·RPC 인증값은 이 문서에 포함하지 않는다.
