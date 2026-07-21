---
title: "백준 7579번 앱 — 배낭 Knapsack DP C++ 풀이"
description: "백준 7579번 앱 풀이. 비용을 인덱스로 삼는 Knapsack 변형 DP로 메모리 M바이트를 확보하는 최소 비용을 구하는 C++ 코드와 점화식, 풀이 과정을 정리한다."
date: 2025-06-11
categories: [Algorithm]
tags: [Algorithm, DP]
---

## 문제

[BOJ 7579 - 앱](https://www.acmicpc.net/problem/7579)

N개의 앱이 있고 각각 메모리와 비활성화 비용이 있다. 최소 M바이트의 메모리를 확보하기 위한 최소 비용을 구하는 문제다.

처음에는 “확보할 메모리”를 DP의 인덱스로 삼고 싶어진다. 하지만 메모리 합은 최대 1,000만이라 표가 너무 커진다. 반면 앱 하나의 비용은 최대 100이고 앱은 최대 100개이므로, 모든 비용을 합쳐도 10,000이다. **더 작은 범위인 비용을 인덱스로 삼는 것**이 이 문제의 관점 전환이다.

`dp[비용]`에는 그 비용 이하로 비활성화했을 때 확보할 수 있는 최대 메모리를 저장한다. 모든 앱을 처리한 뒤 `dp[비용]`가 목표 메모리 이상인 가장 작은 비용을 찾으면 된다.

## 핵심 아이디어

1. 일반 Knapsack과 다르게, **비용을 기준(인덱스)**으로 DP를 구성한다.
2. `dp[j]` = 지금까지 본 앱 중 비용 합 j로 확보할 수 있는 최대 메모리.
3. 모든 앱을 반영한 뒤 `dp[j] >= M`을 만족하는 최소 j가 정답이다.
4. 비용의 총합이 최대 10,000이므로 DP 테이블 크기가 관리 가능하다.

## 풀이

```cpp
#include <algorithm>
#include <iostream>
#include <numeric>
#include <vector>

using namespace std;

int main() {
    int n, requiredMemory;

    cin >> n >> requiredMemory;

    vector<int> memory(n);
    vector<int> cost(n);
    for (int& value : memory) cin >> value;
    for (int& value : cost) cin >> value;

    int totalCost = accumulate(cost.begin(), cost.end(), 0);
    vector<int> dp(totalCost + 1, 0);

    for (int i = 0; i < n; ++i) {
        // 뒤에서 앞으로 순회해야 같은 앱을 한 번만 사용한다.
        for (int currentCost = totalCost; currentCost >= cost[i]; --currentCost) {
            dp[currentCost] = max(
                dp[currentCost],
                dp[currentCost - cost[i]] + memory[i]
            );
        }
    }

    for (int currentCost = 0; currentCost <= totalCost; ++currentCost) {
        if (dp[currentCost] >= requiredMemory) {
            cout << currentCost << '\n';
            break;
        }
    }
}
```

## 주요 포인트

- 메모리를 가치, 비활성화 비용을 무게로 본다.
- 비용을 뒤에서 앞으로 순회해야 방금 처리한 앱을 같은 반복에서 다시 선택하지 않는다.
- 비용 총합이 DP 배열의 크기를 결정한다.

## 복잡도

- 시간: O(N × sum(cost))
- 공간: O(sum(cost))

*Knapsack의 변형, 최적화 대상과 제약 조건을 바꿔서 생각하는 발상이 필요하다.*
