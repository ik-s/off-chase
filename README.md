# TRUST404 — 검증 가능한 에이전트 결제 결정 로그

에이전트가 제출한 결제 요청을 **접수**한 시점과 정책 엔진이 **승인 또는 거절**한 시점을 각각 서명해 순서대로 기록합니다. 검증기는 운영자 데이터베이스에 접속하지 않고 `proof.json`, 신뢰하는 공개키, 외부에서 확보한 체크포인트 지문 또는 witness 영수증만으로 기록을 검사합니다.

현재 구현은 해커톤용 백엔드 MVP입니다. 실제 결제, 블록체인 전송, 프로덕션 키 관리, 공개 블록체인 앵커는 포함하지 않습니다. 서명과 해시의 정확한 범위는 [프로토콜 설명](docs/PROTOCOL.md), 공격자 가정과 보장 범위는 [위협 모델](docs/THREAT_MODEL.md)에 적었습니다.

## 빠른 실행

Python 3.11 이상이 필요합니다.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[test]'
.venv/bin/trust404 demo --out /tmp/trust404-demo
.venv/bin/python scripts/attack_report.py --demo-dir /tmp/trust404-demo
```

정상 증명과 다섯 가지 공격 파일이 생성됩니다. `issuer.pub`은 발행자 공개키이고 `checkpoint.pin`은 체크포인트 SHA-256 지문입니다.

```bash
ISSUER_KEY="$(cat /tmp/trust404-demo/issuer.pub)"
PIN="$(cat /tmp/trust404-demo/checkpoint.pin)"
.venv/bin/trust404 verify /tmp/trust404-demo/proof.json \
  --issuer-key "$ISSUER_KEY" --checkpoint-hash "$PIN" \
  --acceptance /tmp/trust404-demo/acceptance-receipt.json
```

종료 코드는 검증 성공 `0`, 증명 무효 또는 누락 탐지 `1`, 잘못된 입력 `2`입니다. 다음 파일을 같은 명령의 증명 경로에 넣으면 공격 탐지를 확인할 수 있습니다.

| 파일 | 시나리오 |
| --- | --- |
| `tampered-reason.json` | 거절 사유 변경 |
| `tampered-policy.json` | 정책 한도 변경 |
| `deleted-decision.json` | 결정 항목 삭제 |
| `missing-decision.json` | 접수된 요청의 결정 누락 |
| `rewritten-history.json` | 운영자가 발행자 키로 빈 로그와 새 체크포인트를 다시 서명해 접수 기록까지 삭제 |

`missing-decision.json`에는 별도 체크포인트가 있으므로 `missing-decision.pin`을 사용합니다. 이 예제의 `.pin` 파일은 같은 컴퓨터에서 만든 것입니다. 실제 독립 앵커가 되려면 결제 운영자가 통제하지 않는 채널에서 지문을 확보해야 합니다.

`rewritten-history.json`은 `rewritten-history.pin`만 사용하면 암호학적으로 유효한 빈 로그입니다. 이 경우에도 별도로 받은 `acceptance-receipt.json`을 `--acceptance`로 넣으면 `ACCEPTANCE_OMITTED`가, 기존 `witness-receipt.json`을 넣으면 `INVALID_WITNESS_RECEIPT`가 나옵니다. 이 사례는 외부에 보관한 증거가 왜 필요한지 보여줍니다.

전체 공격 결과와 컨테이너 실험 기록은 [검증 결과](docs/VALIDATION.md)에 정리했습니다.

## 별도 witness로 체크포인트 서명

witness는 **별도 키와 별도 SQLite DB**를 가지고 이전에 서명한 로그의 분기나 롤백을 거부합니다. 운영자와 분리된 호스트 및 관리 주체에서 다음 명령을 실행할 수 있습니다.

```bash
.venv/bin/trust404 keygen --out /secure/witness.key
.venv/bin/trust404 witness-anchor /tmp/trust404-demo/proof.json \
  --issuer-key "$ISSUER_KEY" \
  --witness-key-file /secure/witness.key \
  --db /secure/witness.db \
  --out /secure/witness-receipt.json

.venv/bin/trust404 verify /tmp/trust404-demo/proof.json \
  --issuer-key "$ISSUER_KEY" \
  --witness-receipt /secure/witness-receipt.json \
  --witness-key "$(cat /secure/witness.pub)"
```

검증자는 witness 공개키를 별도 신뢰 경로로 받아야 합니다. 데모가 같은 프로세스에서 만든 witness 키는 독립 운영을 증명하지 않습니다. witness 자체가 악의적으로 서로 다른 기록에 서명했는지 전 세계적으로 확인하는 공개 게시·gossip 기능도 아직 없습니다.

### witness를 별도 HTTP 서비스로 실행

운영자와 분리된 환경에서 witness 키와 DB를 보관합니다. 아래 설정은 로컬 실행 예시이며, 다른 호스트로 노출할 때는 HTTPS 종료 프록시를 사용해야 합니다. CLI는 외부 HTTP 주소로 토큰을 보내지 않습니다.

```bash
export TRUST404_WITNESS_DB="$PWD/witness.db"
export TRUST404_WITNESS_KEY_FILE="$PWD/witness.key"
export TRUST404_WITNESS_ALLOWED_ISSUER_KEYS="$ISSUER_KEY"
export TRUST404_WITNESS_TOKEN="replace-with-a-separate-random-token"
.venv/bin/trust404 witness-serve
```

다른 터미널에서 증명을 제출하고 witness 서명이 맞는지 확인합니다.

```bash
export TRUST404_WITNESS_TOKEN="replace-with-a-separate-random-token"
.venv/bin/trust404 witness-submit /tmp/trust404-demo/proof.json \
  --url http://127.0.0.1:8001 --issuer-key "$ISSUER_KEY" \
  --witness-key "$(cat witness.pub)" --out /tmp/remote-witness-receipt.json
.venv/bin/trust404 verify /tmp/trust404-demo/proof.json \
  --issuer-key "$ISSUER_KEY" \
  --witness-receipt /tmp/remote-witness-receipt.json \
  --witness-key "$(cat witness.pub)"
```

`GET /anchors?issuer_key=...`는 witness가 서명한 이력을 공개합니다. `trust404 witness-history --url http://127.0.0.1:8001 --issuer-key "$ISSUER_KEY" --witness-key "$(cat witness.pub)"`로 서명과 이전 영수증 연결을 검사할 수 있습니다. 별도로 보관한 최신 `receipt_hash`가 있다면 `--expected-latest-hash`도 전달해 이력 끝부분이 생략됐는지 확인하세요.

## 로컬 HTTP API

키 파일은 생성 시 소유자만 읽을 수 있는 `0600` 권한으로 저장됩니다. 발행자, 에이전트, 기업은 서로 다른 키를 사용합니다.

```bash
.venv/bin/trust404 keygen --out issuer.key
.venv/bin/trust404 keygen --out agent.key
.venv/bin/trust404 keygen --out enterprise.key

export TRUST404_DB="$PWD/ledger.db"
export TRUST404_ISSUER_KEY_FILE="$PWD/issuer.key"
export TRUST404_OPERATOR_TOKEN="replace-with-a-long-random-token"
export TRUST404_ALLOWED_AGENT_KEYS="$(cat agent.pub)"
.venv/bin/trust404 serve
```

기본 바인딩은 `127.0.0.1:8000`입니다. `TRUST404_ALLOWED_AGENT_KEYS`는 쉼표로 구분한 에이전트 공개키 목록입니다.

| API | 인증 | 동작 |
| --- | --- | --- |
| `POST /requests` | 허용된 에이전트 키와 요청 서명 | 접수 영수증 발행 |
| `POST /requests/{id}/decision` | `Authorization: Bearer <operator token>`와 기업 정책 서명 | 정책 평가 및 결정 영수증 발행 |
| `GET /proof` | 운영자 토큰 | 현재 전체 로그와 서명된 체크포인트 내보내기 |
| `GET /health` | 없음 | 프로세스 상태 |

`POST /requests` 본문은 `{"request": {...}, "agent_signature": "..."}`입니다. 요청에는 `request_id`, `agent_key`, `enterprise_key`, `amount_minor`, `currency`, `destination`이 필요합니다. `POST /requests/{id}/decision` 본문은 `{"policy": {...}, "policy_signature": "..."}`이고 정책에는 `version`, `max_amount_minor`, `currency`가 필요합니다. 서명할 JSON을 파일에 저장한 후 `.venv/bin/trust404 sign request.json --key-file agent.key` 또는 정책용 `enterprise.key`로 서명 문자열을 얻을 수 있습니다. 금액은 해당 통화의 최소 단위로 표현한 양의 정수입니다.

감사자가 에이전트와 기업의 공개키를 별도로 알고 있다면 `verify`에 `--agent-key "$(cat agent.pub)" --enterprise-key "$(cat enterprise.pub)"`를 추가해 키의 실세계 소유자와 증명 속 키가 일치하는지 강제할 수 있습니다.

## 두 컨테이너로 재현하기

Compose는 운영자와 witness를 별도 컨테이너, 별도 키 파일, 별도 SQLite 볼륨으로 실행합니다. 두 HTTP 포트는 기본적으로 로컬 호스트의 `18000`, `18001`에만 열립니다. 처음 한 번만 로컬 키와 토큰을 생성하세요. `.env`와 `.local/`은 Git에서 제외됩니다.

```bash
.venv/bin/python scripts/prepare_compose.py --project-root .
docker compose up --build -d
.venv/bin/python scripts/compose_smoke.py --project-root .
docker compose down
```

스모크 스크립트는 서명된 요청 접수 → 정책 거절 → 증명 내보내기 → 별도 witness 앵커 → 증명·영수증·공개 이력 검증을 수행합니다. 결과 증거는 `.local/runs/<request_id>/`에 저장됩니다. `prepare_compose.py`는 기존 키나 설정을 덮어쓰지 않습니다. 데이터 볼륨은 `docker compose down` 후에도 남아 재실행 시 로그가 이어집니다.

이 개발 호스트에서는 Docker Desktop의 credential helper가 공식 Python 이미지 조회 중 멈췄습니다. Docker 설정을 변경하지 않고 다음처럼 프로젝트 전용 빈 Docker 설정으로 이미지를 가져온 뒤 단독 Compose 실행 파일을 사용해 빌드·실행했습니다.

```bash
mkdir -p .local/docker-config
printf '{}\n' > .local/docker-config/config.json
DOCKER_CONFIG="$PWD/.local/docker-config" docker pull python:3.11-slim
DOCKER_CONFIG="$PWD/.local/docker-config" docker-compose up --build -d
```

## 검증과 측정

```bash
.venv/bin/python -m pytest -q
.venv/bin/trust404 benchmark --requests 1000
```

2026-09-18 이 개발 환경에서 1000건 요청, 2000개 로그 항목을 생성하는 데 약 9.1초, 1.47 MB 증명을 검증하는 데 약 2.9초가 걸렸습니다. 네 공격 사례는 모두 탐지됐습니다. 수치는 환경에 따라 달라집니다.

## 보장 범위

- 에이전트가 서명한 요청, 기업이 서명한 정책, 발행자가 서명한 접수·결정이 같은 요청에 묶입니다.
- 체크포인트 지문을 외부에 보관하거나 별도 witness가 서명한 뒤에는 그 시점의 로그에서 수정·삭제·순서 변경을 검출할 수 있습니다.
- 유효한 접수 영수증을 따로 가진 검증자는 운영자가 해당 접수 항목 전체를 새 증명에서 빼더라도 누락을 검출할 수 있습니다.
- `MISSING_DECISION`은 **해당 체크포인트 시점에 결정이 없음**을 뜻합니다. 처리 기한 위반 여부를 판정하지는 않습니다.
- 운영자가 접수 영수증을 발행하지 않은 요청은 이 시스템만으로 수신 사실을 증명할 수 없습니다.
- 공개키가 어느 실세계 기업·에이전트에 속하는지 확인하는 등록 체계, 공개 체인 앵커, 전송 암호화, 개인정보 보호, 로그 분할 공개는 아직 구현하지 않았습니다. 전체 증명에는 요청 금액과 목적지가 포함되므로 접근을 제한해야 합니다.
