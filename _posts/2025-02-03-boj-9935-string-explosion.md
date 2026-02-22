---
title: "BOJ 9935 — 문자열 폭발 (C++ 풀이)"
description: "스택 기반으로 문자열에서 폭발 패턴을 효율적으로 제거하는 풀이. 뒤에서부터 매칭하여 O(N)에 해결한다."
date: 2025-02-03
categories: [Algorithm]
tags: [Algorithm, Stack]
---

## 문제

[BOJ 9935 - 문자열 폭발](https://www.acmicpc.net/problem/9935)

문자열에서 특정 폭발 문자열이 포함되어 있으면 제거하고, 제거 후 남은 문자열에서 다시 폭발이 일어나는 과정을 반복한다.

## 핵심 아이디어

1. 단순히 `find & erase`를 반복하면 O(N^2)이 되어 시간 초과가 발생한다.
2. **스택(문자열)** 에 문자를 하나씩 push하면서, 스택의 끝부분이 폭발 문자열과 일치하면 pop한다.
3. 이 방식으로 한 번의 순회(O(N))만에 모든 폭발을 처리할 수 있다.

## 풀이

```cpp
#include <iostream>
#include <string>

using namespace std;

int main() {
    string ss, b;
    string ret = "";

    cin >> ss >> b;

    int blen = b.size();

    for (int i = 0; i < ss.size(); i++) {
        int j = 0;

        ret.push_back(ss[i]);

        while (ret.size() >= blen &&
               ret[ret.size() - j - 1] == b[blen - j - 1]) {
            j++;
        }

        if (j >= blen) {
            for (int k = 0; k < b.size(); k++) {
                ret.pop_back();
            }
        }
    }

    if (ret.size() == 0) {
        cout << "FRULA" << endl;
    } else {
        cout << ret << endl;
    }

    return 0;
}
```

## 주요 포인트

- `ret` 문자열을 스택처럼 사용한다. `push_back`으로 추가, `pop_back`으로 제거.
- 문자를 추가할 때마다 끝부분에서 역방향으로 폭발 문자열과 비교한다.
- 결과가 빈 문자열이면 `"FRULA"`를 출력한다.

## 복잡도

- 시간: O(N × M) — N: 원본 문자열 길이, M: 폭발 문자열 길이 (최악)
- 공간: O(N)

*스택을 활용한 문자열 처리의 대표 문제, 연쇄 폭발을 한 번에 처리하는 아이디어가 핵심이다.*
