---
title: "BOJ 11401 — 이항 계수 3 (C++ 풀이)"
description: "페르마 소정리를 활용한 모듈러 역원으로 이항 계수를 구하는 풀이. 팩토리얼 전처리와 분할 정복 거듭제곱이 핵심이다."
date: 2025-07-19
categories: [Algorithm]
tags: [Algorithm, Math]
---

## 문제

[BOJ 11401 - 이항 계수 3](https://www.acmicpc.net/problem/11401)

N과 K가 최대 4,000,000일 때 이항 계수 C(N, K)를 1,000,000,007로 나눈 나머지를 구하는 문제다.

## 핵심 아이디어

1. C(N, K) = N! / (K! × (N-K)!)인데, 나눗셈은 모듈러 연산에서 직접 사용할 수 없다.
2. **페르마 소정리**: p가 소수일 때 a^(p-1) ≡ 1 (mod p)이므로, a^(-1) ≡ a^(p-2) (mod p).
3. 따라서 `N! × (K!)^(p-2) × ((N-K)!)^(p-2) mod p`로 계산한다.
4. 팩토리얼을 미리 전처리하고, 거듭제곱은 분할 정복으로 O(log p)에 수행한다.

## 풀이

```cpp
#include <iostream>

using namespace std;

const int MOD = 1e9 + 7;
long long f[4000001];

long long pow(int n, long long sqr) {
    if (sqr == 0) return 1 % MOD;
    if (sqr == 1) return n % MOD;

    long long q = pow(n, sqr / 2);
    if (sqr % 2 == 1) {
        return ((q * q) % MOD * n % MOD);
    }

    return (q * q) % MOD;
}

void fac() {
    f[0] = 1;

    for (int i = 1; i <= 4000000; i++) {
        f[i] = f[i - 1] * i % MOD;
    }
}

int main() {
    int n, k;

    cin >> n >> k;

    fac();

    long long ret = ((f[n] * pow(f[k], MOD - 2)) % MOD)
                    * pow(f[n - k], MOD - 2) % MOD;

    cout << ret << endl;

    return 0;
}
```

## 주요 포인트

- `pow(f[k], MOD - 2)`가 바로 `f[k]`의 모듈러 역원이다.
- 팩토리얼 전처리를 한 번에 해두면 여러 쿼리도 O(1)에 대응 가능하다.

## 복잡도

- 시간: O(N + log P) — 팩토리얼 전처리 O(N) + 거듭제곱 O(log P)
- 공간: O(N)

*모듈러 역원과 페르마 소정리, 정수론 문제의 필수 테크닉이다.*
