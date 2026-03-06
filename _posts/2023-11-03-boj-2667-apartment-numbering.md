---
title: "BOJ 2667 — 단지번호 붙이기 (C++ 풀이)"
description: "2D 격자에서 DFS로 연결 요소를 찾고, 각 단지의 크기를 오름차순으로 출력하는 문제."
date: 2023-11-03
categories: [Algorithm]
tags: [Algorithm, DFS]
---

## 문제

[BOJ 2667 - 단지번호 붙이기](https://www.acmicpc.net/problem/2667)

N×N 지도에서 1은 집, 0은 빈 칸이다. 상하좌우로 연결된 집들의 모임을 단지라 하고, 총 단지 수와 각 단지의 집 수를 오름차순으로 출력한다.

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

char arr[26][26];
vector<pair<int, int>> graph[26][26];
vector<int> apartment_complexes;
bool visit[26][26];
int total = 0;

void dfs(int x, int y, int& count) {
    if (!visit[x][y]) {
        visit[x][y] = true;
        count++;
        for (int i = 0; i < graph[x][y].size(); i++) {
            dfs(graph[x][y][i].first, graph[x][y][i].second, count);
        }
    }
}

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);

    int N;
    cin >> N;

    for (int i = 0; i < N; i++)
        for (int j = 0; j < N; j++)
            cin >> arr[i][j];

    // 인접 리스트 구성
    for (int i = 0; i < N; i++)
        for (int j = 0; j < N; j++)
            if (arr[i][j] == '1') {
                if (i + 1 < N && arr[i + 1][j] == '1')
                    graph[i][j].push_back(make_pair(i + 1, j));
                if (i - 1 >= 0 && arr[i - 1][j] == '1')
                    graph[i][j].push_back(make_pair(i - 1, j));
                if (j + 1 < N && arr[i][j + 1] == '1')
                    graph[i][j].push_back(make_pair(i, j + 1));
                if (j - 1 >= 0 && arr[i][j - 1] == '1')
                    graph[i][j].push_back(make_pair(i, j - 1));
            }

    // 연결 요소 탐색
    for (int i = 0; i < N; i++)
        for (int j = 0; j < N; j++)
            if (!visit[i][j] && arr[i][j] == '1') {
                int count = 0;
                dfs(i, j, count);
                total++;
                apartment_complexes.push_back(count);
            }

    sort(apartment_complexes.begin(), apartment_complexes.end());

    cout << total << endl;
    for (int i = 0; i < apartment_complexes.size(); i++)
        cout << apartment_complexes[i] << endl;

    return 0;
}
```

## 풀이 흐름

1. 입력을 받으면서 2D 격자를 인접 리스트로 변환한다. 각 칸에서 상하좌우로 연결된 칸을 연결한다.
2. 전체 격자를 순회하면서 방문하지 않은 집(1)을 발견하면 DFS를 시작한다.
3. DFS에서 방문한 칸의 수(`count`)가 해당 단지의 크기다.
4. 모든 단지를 찾은 뒤 크기를 오름차순 정렬하여 출력한다.

## 다른 접근: 인접 리스트 없이

위 풀이는 인접 리스트를 명시적으로 구성했지만, DFS 안에서 직접 4방향을 탐색하는 것이 더 간결하다.

```cpp
void dfs(int x, int y, int N, int& count) {
    if (x < 0 || x >= N || y < 0 || y >= N) return;
    if (visit[x][y] || arr[x][y] != '1') return;

    visit[x][y] = true;
    count++;

    dfs(x + 1, y, N, count);
    dfs(x - 1, y, N, count);
    dfs(x, y + 1, N, count);
    dfs(x, y - 1, N, count);
}
```

인접 리스트를 미리 만들면 메모리를 더 쓰지만, DFS 함수 자체는 깔끔해진다. 어떤 방식이든 복잡도는 동일하다.

## 복잡도

- 시간: O(N²) — 모든 칸을 한 번씩 방문
- 공간: O(N²) — 격자 + 방문 배열

*2D 격자에서 "연결된 덩어리 세기"는 Connected Components 문제다. DFS로 각 덩어리를 탐색하면서 크기를 세면 된다.*
