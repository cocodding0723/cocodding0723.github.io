---
title: "AI 트레이딩 봇 개발기 - 7일차"
description: "KIS API CMA 파라미터 오류 등 실전 운영 버그 4건 수정, Claude 에이전트 3개로 전체 코드 감사까지 완료한 7일차 기록."
date: 2026-03-04
categories: [Project]
tags: [AI, Trading]
---

## 설계에서 다시 실전으로

[6일차](/blog/2026/03/03/ai-trading-bot-day-6/)는 코드를 한 줄도 쓰지 않고 설계만 했다. 배포 자동화 4가지를 비교하고, Unity 이벤트 트래킹 아키텍처를 그렸다. 그런 날 다음에는 보통 "이제 설계한 걸 구현해야지" 하고 시작하게 된다.

하지만 7일차는 그렇게 시작하지 않았다. 실제 계좌에서 봇을 돌리는데, 숫자가 맞지 않았다. 주문가능금액이 실제보다 턱없이 적고, 리포트에 찍히는 총자산이 증권사 앱과 다르고, 모니터가 이상한 종목 코드에 에러를 뱉었다. 설계보다 급한 것이 있었다. **운영 중 발견된 버그 수정**.

---

## 버그 1: 주문가능금액이 79,416원?

증권사 앱에서는 주문가능금액이 약 150만 원인데, 봇에서는 79,416원으로 표시되고 있었다. 이 금액 기준으로 주문 수량을 계산하니, 매수할 수 있는 주식이 거의 없다.

원인은 KIS API의 CMA 포함 여부 파라미터였다.

```python
# src/api/kis_domestic.py — 수정 전
params = {
    "CANO": self.account_no,
    "ACNT_PRDT_CD": self.account_prod,
    "CMA_EVLU_AMT_ICLD_YN": "N",  # CMA 평가금액 미포함
    # ...
}
```

`CMA_EVLU_AMT_ICLD_YN`이 `"N"`이었다. CMA 통장에 있는 금액을 예수금에 포함하지 않겠다는 설정이다. 대부분의 증권 계좌는 CMA와 연동되어 있으므로, 이 값이 `"N"`이면 실제 사용 가능한 금액의 극히 일부만 잡힌다.

```python
# src/api/kis_domestic.py — 수정 후
params = {
    "CANO": self.account_no,
    "ACNT_PRDT_CD": self.account_prod,
    "CMA_EVLU_AMT_ICLD_YN": "Y",  # CMA 평가금액 포함
    # ...
}
```

한 글자 수정이다. `"N"`을 `"Y"`로 바꿨을 뿐인데, 주문가능금액이 79,416원에서 약 150만 원으로 정상화되었다. API 문서를 꼼꼼히 읽지 않은 대가다. 이런 종류의 버그가 가장 무섭다. 코드 로직은 완벽한데, 파라미터 하나가 틀려서 시스템 전체가 잘못 동작한다.

---

## 버그 2: 리포트의 총자산이 증권사 앱과 다르다

일일 리포트에 찍히는 총자산 금액이 증권사 앱 화면과 일치하지 않았다. 봇이 자체적으로 보유 종목 평가금액을 합산해서 계산하고 있었는데, KIS API가 이미 정확한 총평가금액을 제공하고 있었다.

```python
# src/api/kis_domestic.py — 수정 후
result = {
    "balance": balance_list,
    "total_asset_value": float(summary.get("tot_evlu_amt", 0)),
    "deposit_total": float(summary.get("tot_evlu_amt", 0)) - float(summary.get("evlu_amt_smtl_amt", 0)),
    # ...
}
```

`total_asset_value`는 KIS가 계산한 총평가금액, `deposit_total`은 총평가금액에서 보유 주식 평가금액을 뺀 순수 현금이다. 리포트 쪽도 이 값을 우선 사용하도록 수정했다.

```python
# src/services/report_writer.py — KIS 총평가 우선 사용
if kis_total_asset:
    total_asset = kis_total_asset  # KIS 제공 값 우선
else:
    total_asset = deposit + sum(eval_amounts)  # 폴백: 자체 계산
```

해외 주식 API(`kis_overseas.py`)에도 동일한 필드를 추가했다. 추가로, 해외 주식에서 같은 종목을 분할 매수한 경우 중복 종목이 별도 행으로 나오는 문제가 있었다. 이를 합산하면서 평균 매입가를 가중평균으로 재계산하는 로직도 넣었다.

---

## 버그 3: 단타 모니터가 이상한 종목에 접근한다

단타 모니터(stock_short_term_monitor)가 실시간 체결 데이터를 받다가 `Q550098`, `APBK1681` 같은 종목 코드에서 에러를 뱉었다. 이들은 ETN이나 ELW 같은 파생상품으로, 숫자 6자리가 아닌 종목 코드를 가진다.

```python
# src/services/stock_short_term_monitor.py — ETN/ELW 필터 추가
def _is_valid_stock_code(self, code: str) -> bool:
    """일반 주식 종목코드만 허용 (숫자 6자리)"""
    return bool(code) and code[0].isdigit()
```

종목 코드 첫 글자가 숫자인지만 확인하면 된다. 일반 주식은 `005930`(삼성전자) 같은 숫자 6자리이고, ETN/ELW는 `Q`, `J` 등의 알파벳으로 시작한다. 간단한 필터지만, 이게 없으면 존재하지 않는 종목을 조회하려다 API 에러가 연쇄적으로 발생한다.

---

## 버그 4: StockMainMonitor 시작 실패

주식 메인 모니터가 아예 시작되지 않았다. 에러 메시지는 `AttributeError: 'StockMainMonitor' object has no attribute 'take_profit_pct'`.

이전에 take profit 로직을 단일 비율(`take_profit_pct`)에서 다단계 티어(`take_profit_tiers`)로 리팩토링했는데, 로그 메시지와 일부 코드에서 옛 속성명을 참조하고 있었다.

```python
# src/services/stock_main_monitor.py — 수정 전
logger.info(f"Take profit: {self.take_profit_pct}%")

# src/services/stock_main_monitor.py — 수정 후
logger.info(f"Take profit tiers: {self.take_profit_tiers}")
```

여기에 더해, TP tier 접근 시 bounds check도 추가했다. 티어 리스트가 비어있거나 인덱스를 초과하는 경우의 방어 코드다.

```python
# TP tier bounds check 예시
if tier_index < len(self.take_profit_tiers):
    target = self.take_profit_tiers[tier_index]
else:
    target = self.take_profit_tiers[-1]  # 마지막 티어로 폴백
```

crypto_futures_monitor에도 동일한 bounds check를 적용했고, VAT(Volatility Adjusted Trailing) ATR 값이 재시작 시 즉시 갱신되도록 `vat_last_update`를 `0.0`으로 초기화하는 수정도 함께 넣었다.

---

## AI 에이전트 3개로 전체 코드 감사

4건의 긴급 버그를 수정한 뒤, 더 많은 잠재적 문제가 숨어있을 것 같다는 불안감이 있었다. 직접 코드를 한 줄씩 읽어볼 수도 있지만, 프로젝트가 이미 상당한 규모다. 그래서 **Claude 에이전트 3개를 병렬로 돌려 전체 코드베이스를 감사**했다.

각 에이전트에 다른 관점을 부여했다.

| 에이전트 | 담당 영역 | 발견 건수 |
|----------|----------|-----------|
| Agent 1 | API 계층 + 데이터 정합성 | 4건 |
| Agent 2 | 서비스 계층 + 비즈니스 로직 | 4건 |
| Agent 3 | 백테스트 + 유틸리티 | 3건 |

총 10건 이상의 잠재적 이슈를 발견했다. 이 중 즉시 수정한 것과, 검토만 하고 남겨둔 것을 나눴다.

### 즉시 수정한 것

**pandas reindex deprecated 경고 (5곳)**

```python
# src/backtest/futures_simulator.py — 수정 전
df = df.reindex(new_index, method="ffill")

# src/backtest/futures_simulator.py — 수정 후
df = df.reindex(new_index).ffill()
```

pandas에서 `reindex(method="ffill")`이 deprecated되어 `.reindex().ffill()`로 분리하라는 경고가 나오고 있었다. `futures_simulator.py`에서 5곳, `test_futures_backtest.py`에서도 동일하게 수정했다. 당장 에러가 나는 것은 아니지만, pandas 버전 업그레이드 시 깨질 코드다.

### 검토 후 보류한 것

**1. mock_ai vs composite `_score_to_action` 임계값 불일치**

백테스트용 mock AI와 프로덕션 composite AI에서 점수를 액션으로 변환하는 임계값이 서로 달랐다. 예를 들어, mock에서는 0.7 이상이 "strong buy"인데 composite에서는 0.8 이상이 "strong buy"인 식이다. 백테스트 결과가 프로덕션과 정확히 일치하지 않을 수 있다는 의미다.

보류 이유: 백테스트는 전략의 대략적인 방향성을 검증하는 용도이지, 프로덕션과 1:1 동일한 결과를 기대하는 것이 아니다. 백테스트 정확도를 올려야 할 시점에 통일하기로 했다.

**2. RSI 계산 공식 3곳 불일치**

`signal_generator`, `momentum`, `mean_reversion` 세 모듈에서 RSI를 각각 다른 방식으로 계산하고 있었다. 결과값이 크게 다르지는 않지만, 같은 지표를 세 곳에서 다르게 계산하는 것은 유지보수 부채다.

보류 이유: RSI 유틸리티 함수를 하나로 통합하는 리팩토링이 필요하다. 단순 수정이 아니라 설계 변경이므로, 별도 작업으로 분리했다.

**3. pipeline.py balance 기반 buy quantity 사전계산 race condition**

매수 수량을 잔고 기준으로 사전 계산하는데, 계산 시점과 실제 주문 시점 사이에 잔고가 변할 수 있다. 이론적으로는 race condition이다.

보류 이유: 실제로는 주문 간격이 충분히 길어서 문제가 발생할 확률이 극히 낮다. KIS API 자체가 잔고 부족 시 주문을 거부하므로, 최악의 경우에도 주문 실패로 끝난다. 돈을 잃는 방향의 버그가 아니다.

**4. stock_short_term_monitor 포지션 복구 시 WebSocket 구독 lock 밖에서 실행**

포지션을 복구하면서 WebSocket 구독을 추가하는 코드가 lock 바깥에 있었다. 동시에 여러 포지션이 복구되면 구독 목록이 꼬일 수 있다.

보류 이유: 포지션 복구는 시작 시 한 번만 실행되므로, 동시 실행 자체가 발생하지 않는다. 구조적으로는 lock 안에 넣는 것이 맞지만, 실질적 위험은 없다.

---

## 운영 → 발견 → 수정 → 감사

7일간의 패턴을 돌아보면, 이런 순환이 반복되고 있다.

| 일차 | 핵심 작업 | 성격 |
|------|----------|------|
| 1일차 | Claude API 529 폴백 + OpenAI 자동 전환 | 장애 대응 |
| 2일차 | 트레일링 스탑 구현 | 신규 기능 |
| 3일차 | 백테스트 프레임워크 구축 | 인프라 |
| 4일차 | 선물 백테스트 확장 | 기능 확장 |
| 5일차 | 30건 버그 수정 | 안정화 |
| 6일차 | 배포 자동화 + 이벤트 트래킹 설계 | 설계 |
| **7일차** | **운영 버그 4건 수정 + 전체 코드 감사** | **안정화** |

기능 추가 → 안정화 → 설계 → 안정화. 새 기능을 넣으면 버그가 나오고, 버그를 잡으면 설계를 다듬고 싶어지고, 설계를 하면 다시 코드를 만지게 된다.

흥미로운 점은 5일차와 7일차 모두 "안정화"지만, 성격이 다르다는 것이다. 5일차는 코드 리뷰 중 발견한 논리적 결함들이었고, 7일차는 **실제 운영 중 실제 돈이 관련된 상태에서 발견된 것**들이다. CMA 미포함 버그는 매수 수량에 직접 영향을 미치고, 총자산 표시 오류는 수익률 계산을 왜곡한다. 운영 환경에서만 드러나는 버그는 코드 리뷰만으로는 잡을 수 없다.

AI 에이전트를 활용한 코드 감사도 유의미했다. 사람이 직접 읽으면 반나절은 걸릴 코드를 세 에이전트가 병렬로 훑으면서 10건 이상의 이슈를 뽑아냈다. 물론 모든 이슈가 즉시 수정할 만한 것은 아니었다. 중요한 것은 **발견과 우선순위 판단을 분리**하는 것이다. 발견은 에이전트에게 맡기고, 이 중 무엇을 지금 고치고 무엇을 나중에 고칠지는 사람이 판단한다.

### 다음 할 일

- 실제 계좌에서 CMA 포함 주문가능금액 정상 반영 확인
- mock_ai vs composite 임계값 통일 검토
- RSI 공식 통일 리팩토링
- Webhook 배포 자동화 구현 (6일차 설계분)

---

*실전 운영에서 터진 버그 4건을 수정하고, AI 에이전트 3개로 코드베이스를 감사해 10건 이상의 잠재 이슈를 찾아낸 7일차 기록이다.*
