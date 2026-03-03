---
title: "AI 트레이딩 봇 개발기 - 5일차"
description: "30건의 시스템 이슈를 7개 배치로 나눠 수정하고, 매 배치마다 779개 테스트로 검증한 대규모 안정화 작업 기록"
date: 2026-03-02
categories: [Project]
tags: [AI, Trading]
---

## 30건의 이슈, 한 번에 고칠 것인가

[4일차](/blog/2026/03/01/ai-trading-bot-day-4/)까지 시스템을 운영하면서 쌓인 이슈가 30건이었다. 미래참조 버그부터 메모리 누수, WebSocket 불안정, 로깅 미흡까지 심각도가 제각각이었다. 이걸 한 번에 전부 고치고 싶은 유혹이 있었지만, 그러지 않았다.

이유는 단순하다. **30곳을 동시에 바꾸고 테스트가 깨지면, 어디서 깨졌는지 모른다.** 5곳을 고치고 테스트를 돌리면 원인 범위가 5곳으로 좁혀진다. 디버깅 시간이 근본적으로 달라진다.

30건을 심각도 기준으로 7개 배치로 나눴다.

| 배치 | 심각도 | 영역 | 이슈 수 |
|------|--------|------|---------|
| 1 | CRITICAL | 백테스트 정확성 | 4 |
| 2 | CRITICAL | 메모리 누수 | 3 |
| 3 | HIGH | 프로덕션 안정성 | 4 |
| 4 | MEDIUM | API/데이터 레이어 | 6 |
| 5 | MEDIUM | WebSocket 안정성 | 4 |
| 6 | LOW | 로깅/설정 개선 | 5 |
| 7 | LOW | 기타 정리 | 4 |

각 배치를 수정한 뒤 779개 테스트를 전부 돌렸다. 한 번도 깨지지 않았다. 이 과정을 7번 반복했다.

---

## Batch 1: 미래참조 — 백테스트를 무의미하게 만드는 버그

가장 먼저 잡은 건 백테스트의 미래참조(look-ahead bias) 문제다. 이건 CRITICAL 중에서도 최우선이었다. 미래참조가 있는 백테스트는 아무리 수익률이 좋아도 의미가 없기 때문이다.

### 문제: resample이 미래 데이터를 포함하고 있었다

`futures_simulator.py`에서 OHLCV 데이터를 일정 주기로 리샘플링할 때, pandas의 기본 설정을 그대로 사용하고 있었다.

```python
# futures_simulator.py (변경 전)
resampled = df.resample("1h").agg(ohlcv_agg)
```

pandas `resample`의 기본 동작은 `label="left", closed="left"`다. 이 설정에서 09:00~10:00 구간의 봉은 09:00 라벨을 달지만, 실제로는 10:00 시점의 데이터까지 포함할 수 있다. 백테스트에서 09:00 시점에 이 봉을 참조하면, 아직 발생하지 않은 10:00까지의 가격 변동을 미리 보고 판단을 내리는 셈이다.

```python
# futures_simulator.py (변경 후)
resampled = df.resample("1h", label="right", closed="right").agg(ohlcv_agg)
```

`label="right", closed="right"`로 바꾸면, 09:00~10:00 구간의 봉은 10:00 라벨을 달게 된다. 10:00 시점 이후에야 이 봉을 참조할 수 있으므로 미래참조가 원천 차단된다.

### MACD min_periods 상향

같은 배치에서 MACD 지표의 `min_periods`를 50에서 100으로 올렸다. MACD는 26일 EMA를 사용하는데, 충분한 데이터가 쌓이기 전의 MACD 값은 불안정하다. 50개 봉으로는 EMA가 수렴하지 않은 상태에서 신호를 생성할 수 있다.

```python
# min_periods=50 → 100으로 변경
macd_line = ema_fast - ema_slow  # min_periods=100 이후부터 유효
```

### metrics.py 방어 로직

수익률 지표 계산에서도 엣지 케이스를 보강했다.

```python
# Sortino ratio — downside 수익률이 1개 이하면 계산 불가
if len(downside) > 1:  # 기존: > 0
    sortino = mean_return / downside.std()

# Alpha/Beta — 공분산 행렬의 rank 체크
if np.linalg.matrix_rank(cov_matrix) >= 2:
    beta = cov_matrix[0, 1] / cov_matrix[1, 1]
```

`len(downside) > 0`일 때 단 하나의 값으로 표준편차를 구하면 0이 되어 ZeroDivisionError가 발생한다. `matrix_rank` 체크 없이 특이 행렬(singular matrix)로 beta를 구하면 수치적으로 무의미한 값이 나온다.

---

## Batch 2: 메모리 누수 — 며칠째 돌리면 터지는 dict

두 번째로 잡은 건 메모리 누수다. `crypto_futures_monitor.py`에서 여러 딕셔너리가 데이터를 쌓기만 하고 정리하지 않고 있었다.

```python
# crypto_futures_monitor.py — 문제가 된 딕셔너리들
self._mark_prices = {}      # 실시간 마크 가격
self._symbol_locks = {}      # 심볼별 Lock
self._macd_cache = {}        # MACD 캐시
```

이 딕셔너리들은 새로운 심볼이 유니버스에 들어올 때마다 키가 추가된다. 그런데 유니버스에서 빠진 심볼의 키는 삭제되지 않는다. 코인 선물은 유니버스가 수시로 바뀌므로, 며칠만 돌려도 수백 개의 사용하지 않는 키가 쌓인다.

해결은 주기적 정리 로직 추가다. 현재 유니버스에 없는 심볼의 항목을 일정 주기로 삭제한다. 패턴 자체는 단순하지만, 발견하지 못하면 프로덕션에서 OOM(Out of Memory)으로 프로세스가 죽는다.

---

## Batch 3: 프로덕션 안정성 — 타임아웃과 시장 상태 재확인

세 번째 배치는 실제 운영 환경에서 발생하는 문제들이다.

### 파이프라인 타임아웃

`scheduler.py`에서 파이프라인 실행에 타임아웃이 없었다. AI API가 응답을 안 하거나 네트워크가 끊기면 파이프라인이 무한 대기에 빠진다. 600초(10분) 타임아웃을 추가했다.

### 모니터 백오프 상한 조정

모니터의 에러 백오프 상한이 300초(5분)였다. 연속 에러 시 재시도 간격이 5분까지 벌어지면, 그 사이에 시장 상황이 급변해도 대응이 늦어진다. 60초로 줄였다.

### 주문 전 시장 상태 재확인

`pipeline.py`에서 AI 분석과 실제 주문 사이에 시간 차가 있을 수 있다. AI가 "매수"라고 판단한 시점과 실제 주문을 넣는 시점 사이에 시장이 급변할 수 있다. 주문 직전에 시장 상태를 한 번 더 확인하는 로직을 추가했다.

```python
# pipeline.py — 주문 실행 전
market_state = self._check_market_state(symbol)
if market_state.is_valid:
    self._execute_order(signal)
else:
    logger.warning(f"시장 상태 변경으로 주문 취소: {symbol}")
```

---

## Batch 4-5: API 레이어와 WebSocket

나머지 MEDIUM 이슈들은 개별적으로는 치명적이지 않지만, 모이면 시스템 신뢰도를 갉아먹는 것들이다.

### KIS API 안전장치

- `kis_domestic.py` — 잔고 조회 폴백 시 예수금의 80%만 사용하도록 안전계수 적용. 폴백 데이터가 실시간이 아닐 수 있으므로, 100%를 투입하면 잔고 초과 주문이 발생할 위험이 있다.
- `kis_overseas.py` — 같은 티커가 중복으로 잡히는 경우 수량을 합산. 이전에는 마지막 값으로 덮어썼다.

### 크립토 파이프라인

- `crypto_pipeline.py` — BTC 패널티 값이 비정상적으로 커지는 경우를 clamp로 제한. 유니버스 폴백 시 캐시를 활용해 API 호출을 줄임.

### WebSocket 재연결

- `binance_websocket.py` — `_mark_disconnected()` 호출 시 Lock으로 보호. 여러 스레드에서 동시에 disconnect를 감지하면 재연결이 중복 실행되는 문제가 있었다. 하트비트 기반 재연결로 전환해 연결 상태를 더 정확하게 판단한다.

```python
# binance_websocket.py — Lock 보호 추가
def _mark_disconnected(self):
    with self._disconnect_lock:
        if not self._disconnected:
            self._disconnected = True
            self._schedule_reconnect()
```

---

## Batch 6-7: 로깅과 정리

마지막 두 배치는 LOW 이슈들이다. 로깅 레벨 조정, 불필요한 debug 로그 제거, `_closing_locks` 딕셔너리 주기적 정리 등. 기능에는 영향이 없지만, 운영 시 로그 가독성과 디스크 사용량에 영향을 준다.

---

## 779개 테스트가 안전망이 된 순간

이번 작업에서 가장 중요한 역할을 한 건 코드가 아니라 테스트다.

30건을 7배치로 나눠 수정하면서, 매 배치 후 779개 테스트를 전부 돌렸다. 7번 모두 전체 통과. 이 결과가 주는 안도감은 상당하다. resample 설정을 바꿔도, 메모리 정리 로직을 추가해도, 타임아웃을 변경해도 기존 동작이 깨지지 않았다는 확인이다.

만약 테스트가 없었다면? 30곳을 수정하고 프로덕션에 배포한 뒤, 런타임에서 문제를 발견하는 수밖에 없다. 트레이딩 봇에서 런타임 버그는 곧 실제 손실이다.

```text
[Batch 수정 워크플로우]

Batch 1 수정 → pytest (779/779 pass) ✓
Batch 2 수정 → pytest (779/779 pass) ✓
Batch 3 수정 → pytest (779/779 pass) ✓
Batch 4 수정 → pytest (779/779 pass) ✓
Batch 5 수정 → pytest (779/779 pass) ✓
Batch 6 수정 → pytest (779/779 pass) ✓
Batch 7 수정 → pytest (779/779 pass) ✓
```

---

## AI에게 대규모 수정을 시키는 방법

이번에 얻은 실전 교훈이 하나 있다. AI(Claude)에게 대규모 수정을 시킬 때, **이슈 목록을 주고 배치로 나눠서 처리하게 하면 안전하다.**

구체적인 흐름은 이렇다.

1. 이슈 30건을 정리해서 AI에게 전달한다.
2. AI가 심각도별로 배치를 나눈다 (CRITICAL → HIGH → MEDIUM → LOW).
3. 배치 하나를 수정한다.
4. 테스트를 돌린다.
5. 통과하면 다음 배치로 넘어간다. 실패하면 해당 배치 내에서 원인을 찾는다.

이 방식의 핵심은 **피드백 루프가 짧다**는 것이다. 배치 하나의 범위가 좁으니 문제가 생겨도 원인을 빠르게 특정할 수 있다. 전체를 한 번에 고치는 것보다 총 시간이 더 걸릴 수 있지만, 디버깅에 허비하는 시간을 고려하면 오히려 빠르다.

---

## 다음 단계

- 미래참조 수정 후 백테스트 결과 비교 (수익률이 떨어질 가능성이 높다 — 그게 정상이다)
- 메모리 사용량 장기 모니터링 (정리 로직이 실제로 효과가 있는지)
- WebSocket 재연결 안정성 실전 검증

---

*30건의 시스템 이슈를 7개 배치로 나눠 수정하고, 매 배치마다 779개 테스트를 돌려 하나도 깨뜨리지 않은 대규모 안정화 5일차 기록이다.*
