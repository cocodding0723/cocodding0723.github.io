---
title: "백준 2667번 단지번호 붙이기 — DFS C++ 풀이"
description: "백준 2667번 단지번호 붙이기 풀이. 2차원 격자에서 DFS로 연결 요소(단지)를 찾아 단지 수와 각 단지 크기를 오름차순 출력하는 C++ 코드와 풀이 과정을 정리한다."
date: 2023-11-03
categories: [Algorithm]
tags: [Algorithm, DFS]
---

## 문제

[BOJ 2667 - 단지번호 붙이기](https://www.acmicpc.net/problem/2667)

N×N 지도에서 1은 집, 0은 빈 칸이다. 상하좌우로 연결된 집들의 모임을 단지라 하고, 총 단지 수와 각 단지의 집 수를 오름차순으로 출력한다.

지도를 왼쪽 위부터 훑다가 아직 방문하지 않은 집을 발견했다고 하자. 그 집은 지금까지 세지 않은 새 단지에 속한다. 그 위치에서 상하좌우로 이어진 집을 모두 방문하면 단지 하나의 범위와 크기를 동시에 알 수 있다.

이처럼 그래프에서 서로 이어진 정점의 덩어리를 **연결 요소(Connected Component)**라고 한다. 이 문제에서는 집 한 칸이 정점이고, 상하좌우로 붙은 두 집 사이가 간선이다.

## 핵심 포인트

1. **Connected Components**: 그래프의 연결 요소를 찾는 전형적인 문제다.
2. 방문하지 않은 집(1)을 발견할 때마다 새로운 단지로 DFS를 시작한다.
3. DFS 과정에서 방문한 칸 수를 세면 단지 크기가 된다.

## C++ 풀이

```cpp
#include <iostream>
#include <vector>
#include <algorithm>

using namespace std;

char grid[25][25];
bool seen[25][25];
int n;

int dfs(int y, int x) {
    if (y < 0 || y >= n || x < 0 || x >= n) return 0;
    if (seen[y][x] || grid[y][x] != '1') return 0;

    seen[y][x] = true;

    int size = 1;
    size += dfs(y - 1, x);
    size += dfs(y + 1, x);
    size += dfs(y, x - 1);
    size += dfs(y, x + 1);
    return size;
}

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    cin >> n;

    for (int y = 0; y < n; ++y)
        for (int x = 0; x < n; ++x)
            cin >> grid[y][x];

    vector<int> complexSizes;

    for (int y = 0; y < n; ++y) {
        for (int x = 0; x < n; ++x) {
            if (!seen[y][x] && grid[y][x] == '1') {
                complexSizes.push_back(dfs(y, x));
            }
        }
    }

    sort(complexSizes.begin(), complexSizes.end());

    cout << complexSizes.size() << '\n';
    for (int size : complexSizes) cout << size << '\n';

    return 0;
}
```

## 풀이 흐름

1. 지도를 순회하면서 방문하지 않은 집을 찾는다.
2. 그 집에서 DFS를 시작해 상하좌우로 연결된 집을 모두 방문한다.
3. DFS가 반환한 방문 칸 수가 단지 크기다.
4. 모든 단지 크기를 모아 오름차순으로 정렬한다.

## 작은 예로 따라가기

`110`, `010`, `001`인 3×3 지도를 생각해 보자. `(0,0)`에서 시작한 DFS는 `(0,1)`과 `(1,1)`까지 방문해 크기 3을 반환한다. 마지막 `(2,2)`는 앞 단지와 상하좌우로 연결되지 않았으므로 다음 순회에서 새 DFS가 시작되고 크기 1을 반환한다. 결과는 단지 2개, 크기 1과 3이다.

## 복잡도

- 시간: O(N²) — 모든 칸을 한 번씩 방문
- 공간: O(N²) — 격자 + 방문 배열

*2D 격자에서 "연결된 덩어리 세기"는 Connected Components 문제다. DFS로 각 덩어리를 탐색하면서 크기를 세면 된다.*
