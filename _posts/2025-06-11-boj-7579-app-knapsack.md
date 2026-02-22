---
title: "BOJ 7579 — 앱 (C++ 풀이)"
description: "Knapsack DP의 변형 문제. 비용을 기준으로 DP 테이블을 구성하고 메모리 조건을 만족하는 최소 비용을 찾는다."
date: 2025-06-11
categories: [Algorithm]
tags: [Algorithm, DP]
---

## 문제

[BOJ 7579 - 앱](https://www.acmicpc.net/problem/7579)

N개의 앱이 있고 각각 메모리와 비활성화 비용이 있다. 최소 M바이트의 메모리를 확보하기 위한 최소 비용을 구하는 문제다.

## 핵심 아이디어

1. 일반 Knapsack과 다르게, **비용을 기준(인덱스)**으로 DP를 구성한다.
2. `dp[i][j]` = i번째 앱까지 고려했을 때, 비용 j를 사용하여 확보할 수 있는 최대 메모리.
3. `dp[i][j] >= M`을 만족하는 최소 j가 정답이다.
4. 비용의 총합이 최대 10,000이므로 DP 테이블 크기가 관리 가능하다.

## 풀이

```cpp
#define INF 100 * 100 + 1
#include <iostream>

using namespace std;

int main() {
    int n, m, sum = 0, result = INF;

    int memory[101];
    int cost[101];
    int dp[101][INF];

    cin >> n >> m;

    for (int i = 1; i <= n; i++) cin >> memory[i];
    for (int i = 1; i <= n; i++) {
        cin >> cost[i];
        sum += cost[i];
    }

    for (int i = 1; i <= n; i++) {
        int cm = memory[i];
        int c = cost[i];

        for (int j = 0; j <= sum; j++) {
            if (j - c >= 0) {
                dp[i][j] = max(dp[i - 1][j], cm + dp[i - 1][j - c]);
            } else {
                dp[i][j] = dp[i][j - 1];
            }

            dp[i][j] = max(dp[i][j], dp[i - 1][j]);

            if (dp[i][j] >= m) {
                result = min(j, result);
                break;
            }
        }
    }

    cout << result << endl;
}
```

## 주요 포인트

- **관점 전환**: 메모리를 가치로, 비용을 무게로 보는 역발상이 필요하다.
- `dp[i][j] >= m`을 만족하는 순간 `break`하여 불필요한 계산을 줄인다.
- 비용 총합(`sum`)이 DP 테이블의 크기를 결정한다.

## 복잡도

- 시간: O(N × sum(cost))
- 공간: O(N × sum(cost))

*Knapsack의 변형, 최적화 대상과 제약 조건을 바꿔서 생각하는 발상이 필요하다.*
