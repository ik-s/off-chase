# TRUST404 검증 결과 — 2026-09-19

## 자동 검증

| 명령 | 결과 |
| --- | --- |
| `.venv/bin/python -m pytest -q` | 49개 통과. 설치된 FastAPI/Starlette 테스트 클라이언트에서 나온 deprecation 경고 2개 |
| `.venv/bin/ruff check src scripts tests` | 통과 |
| `.venv/bin/python -m pip check` | 의존성 충돌 없음 |
| `.venv/bin/trust404 benchmark --requests 1000` | 요청 1000건, 로그 2000항목, 증명 1,470,144바이트, 생성 2.36초, 검증 1.00초, 네 기본 공격 4/4 탐지 |

시간 수치는 이 개발 호스트의 한 실행 결과입니다. 다른 실행에서는 생성 9.1초, 검증 2.9초가 기록됐으므로 고정 성능 보장으로 사용하면 안 됩니다.

## 공격 실험

`trust404 demo --out .local/attack-demo`와 `python scripts/attack_report.py --demo-dir .local/attack-demo`를 실행했습니다. 원본 증명은 검증됐고 다섯 공격 사례가 모두 탐지됐습니다. 결과 JSON은 `.local/attack-report.json`에 저장했습니다.

| 사례 | 결과 |
| --- | --- |
| 거절 사유 수정 | 항목 해시·서명·정책 결과 불일치 |
| 정책 한도 수정 | 항목 해시·서명·정책 해시·기업 서명·결과 불일치 |
| 결정 항목 삭제 | 체크포인트 크기·머리 해시 불일치, 결정 누락 |
| 접수 후 결정 미발행 | `MISSING_DECISION` |
| 운영자 키로 빈 로그 재서명 | 새 지문만 사용하면 유효. 외부 접수 영수증으로 `ACCEPTANCE_OMITTED`, 기존 witness 영수증으로 불일치 탐지 |

마지막 사례는 검증기가 **어떤 외부 증거를 받아야 하는지**를 보여줍니다. 운영자가 새로 만든 지문만 운영자로부터 받으면 과거 기록의 삭제를 판정할 기준이 없습니다.

## 두 서비스 왕복 실행

`compose.yaml`로 운영자와 witness를 별도 컨테이너·키·DB 볼륨으로 실행했습니다. 두 서비스 모두 Docker 헬스 체크에서 `healthy`였고 로컬 포트 `18000`, `18001`에만 바인딩됐습니다. `scripts/compose_smoke.py`의 결과는 다음과 같습니다.

- 서명된 접수, 결정, witness 앵커: 각각 HTTP 201.
- 정책 한도 초과 요청: `REJECTED`.
- 내보낸 전체 증명, witness 영수증, 서명된 공개 이력: 모두 검증 성공.
- 재실행 증거: `.local/runs/<request_id>/`에 요청·접수·결정·증명·witness 영수증·이력 저장.

Docker Desktop의 기존 credential helper가 공식 Python 이미지 조회를 지연시켜, 프로젝트 전용 빈 `DOCKER_CONFIG`로 이미지를 가져온 뒤 Compose를 실행했습니다. 사용자의 Docker 설정은 바꾸지 않았습니다.

CI에 추가한 `up --build --wait -d` 절차도 로컬에서 실행했습니다. 처음에는 두 서비스가 같은 이미지 태그를 동시에 빌드해 충돌했고, witness 이미지 태그를 분리한 뒤 두 서비스가 다시 `healthy`가 됐습니다. 이어서 `compose_smoke.py`를 재실행해 접수·결정·앵커와 세 가지 검증이 모두 성공했습니다. [CI 워크플로](../.github/workflows/ci.yml)에는 같은 왕복 절차를 넣었으며, 원격 GitHub Actions 실행 결과는 아직 없습니다.

## 현재 제한

컨테이너 두 개는 같은 개발 호스트에 있으므로 독립 기관 운영이나 공개 테스트넷 앵커를 증명하지 않습니다. 공개키 배포, TLS 종료, 프로덕션 비밀 관리, 공개 witness 이력의 전 세계적 비교, 전체 로그에 포함된 결제 정보의 선택적 공개도 구현 범위 밖입니다. 이 제한은 [위협 모델](THREAT_MODEL.md)에 명시했습니다.
