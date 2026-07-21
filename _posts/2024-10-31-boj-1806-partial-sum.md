---
title: "백준 1806번 부분합 — 투 포인터 C++ 풀이"
description: "백준 1806번 부분합 풀이. 투 포인터(슬라이딩 윈도우)로 연속 부분 수열의 합이 S 이상인 최소 길이를 O(N)에 구하는 C++ 코드와 풀이 과정을 정리한다."
date: 2024-10-31
categories: [Algorithm]
tags: [Algorithm]
---

## 문제

[BOJ 1806 - 부분합](https://www.acmicpc.net/problem/1806)

N개의 자연수로 이루어진 수열에서 연속된 부분 수열의 합이 S 이상인 것 중 가장 짧은 길이를 구하는 문제다.

모든 구간을 하나씩 더하면 시작점과 끝점 조합이 O(N²)개 생긴다. 하지만 원소가 모두 자연수라는 조건을 이용하면 더 적게 볼 수 있다. 오른쪽 끝을 옮기면 합은 반드시 커지고, 왼쪽 끝을 옮기면 합은 반드시 작아진다. 이 단조로운 변화를 이용하는 방법이 투 포인터, 또는 슬라이딩 윈도우다.

예를 들어 현재 구간 합이 S보다 작다면 왼쪽을 줄여서는 답에 가까워질 수 없다. 오른쪽에 원소를 더해야 한다. 반대로 합이 S 이상이면 현재 길이를 후보로 기록하고 왼쪽을 줄여 더 짧은 구간을 찾는다.

## 핵심 아이디어

1. **투 포인터(슬라이딩 윈도우)** 기법을 사용한다.
2. `start`와 `end` 두 포인터를 유지하면서:
   - `sum < S`이면 `end`를 오른쪽으로 이동하여 합을 늘린다.
   - `sum >= S`이면 길이를 기록하고 `start`를 오른쪽으로 이동하여 합을 줄인다.
3. 한 번의 순회로 O(N)에 해결 가능하다.

## 풀이

```cpp
#include <iostream>

using namespace std;

int n, target;
int arr[100001];

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(); cout.tie();

    int left = 0;
    int sum = 0;

    cin >> n >> target;
    int answer = n + 1;

    for (int i = 0; i < n; i++) {
        cin >> arr[i];
    }

    for (int right = 0; right < n; ++right) {
        sum += arr[right];

        while (sum >= target) {
            answer = min(answer, right - left + 1);
            sum -= arr[left++];
        }
    }

    cout << (answer == n + 1 ? 0 : answer) << '\n';

    return 0;
}
```

## 주요 포인트

- `right`는 매 반복마다 한 칸 이동하고, 합이 충분히 크면 `left`를 가능한 만큼 옮긴다.
- 두 포인터 모두 왼쪽으로 돌아가지 않으므로 각 원소는 구간에 한 번 들어오고 한 번 빠진다.
- 답을 찾지 못했는지는 가능한 최대 길이보다 큰 `n + 1`을 그대로 유지하는지로 판별한다.

## 복잡도

- 시간: O(N) — 각 포인터가 최대 N번 이동
- 공간: O(N)

*투 포인터의 기본 문제, 연속 부분 수열 조건 최적화에 자주 등장하는 패턴이다.*
