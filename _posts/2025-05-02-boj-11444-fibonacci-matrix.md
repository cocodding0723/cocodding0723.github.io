---
title: "BOJ 11444 — 피보나치 수 6 (C++ 풀이)"
description: "행렬 거듭제곱으로 피보나치 수를 O(log N)에 구하는 풀이. 2×2 행렬의 분할 정복 거듭제곱이 핵심이다."
date: 2025-05-02
categories: [Algorithm]
tags: [Algorithm, Math, DP]
---

## 문제

[BOJ 11444 - 피보나치 수 6](https://www.acmicpc.net/problem/11444)

N이 최대 10^18일 때 피보나치 수 F(N)을 1,000,000,007로 나눈 나머지를 구하는 문제다.

## 핵심 아이디어

1. 피보나치 점화식을 행렬로 표현할 수 있다:
   ```
   |F(n+1)|   |1 1|^n   |F(1)|
   |F(n)  | = |1 0|   × |F(0)|
   ```
2. 행렬 거듭제곱을 분할 정복으로 수행하면 O(log N)에 계산 가능하다.
3. N이 10^18까지이므로 일반적인 DP로는 불가능하고, 행렬 거듭제곱이 필수다.

## 풀이

```cpp
#include <iostream>
#include <vector>

using namespace std;

typedef vector<vector<long long>> Matrix;

Matrix multiply(Matrix a, Matrix b) {
    int n = a.size();
    int m = a[0].size();
    Matrix ret(n, vector<long long>(m, 0));

    for (int i = 0; i < n; i++) {
        for (int j = 0; j < m; j++) {
            long long sum = 0;
            for (int k = 0; k < m; k++) {
                sum += a[i][k] * b[k][j];
                sum %= 1000000007;
            }
            ret[i][j] = sum;
        }
    }

    return ret;
}

Matrix pow(Matrix m, long long sqr) {
    if (sqr == 0 || sqr == 1) return m;

    Matrix ret = pow(m, sqr / 2);
    if (sqr % 2 == 1) {
        return multiply(multiply(ret, ret), m);
    }

    return multiply(ret, ret);
}

int main() {
    long long n;
    cin >> n;

    Matrix a = {
        {0, 1},
        {1, 1}
    };

    Matrix ret = pow(a, n - 1);

    cout << ret[1][1] << endl;

    return 0;
}
```

## 주요 포인트

- 행렬 곱셈 시 중간 과정에서 오버플로우를 방지하기 위해 `long long`을 사용하고 매번 MOD 연산을 수행한다.
- `pow(a, n-1)`의 결과에서 `ret[1][1]`이 F(n)에 해당한다.

## 복잡도

- 시간: O(8 × log N) ≈ O(log N) — 2×2 행렬 곱셈이 상수
- 공간: O(log N) — 재귀 스택

*행렬 거듭제곱은 피보나치뿐 아니라 선형 점화식 전반에 적용할 수 있는 강력한 테크닉이다.*
