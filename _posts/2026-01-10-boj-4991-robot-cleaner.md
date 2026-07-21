---
title: "백준 4991번 로봇 청소기 — BFS와 비트마스크 DP C++ 풀이"
description: "백준 4991번 로봇 청소기 풀이. BFS로 로봇과 먼지 사이 최단 거리를 구하고 비트마스크 DP로 모든 먼지를 청소하는 최소 이동 횟수를 계산한다."
date: 2026-01-10
categories: [Algorithm]
tags: [Algorithm, BFS, DP]
---

## 문제를 두 단계로 나누기

[BOJ 4991 - 로봇 청소기](https://www.acmicpc.net/problem/4991)

방에는 로봇 시작점 `o`, 더러운 칸 `*`, 벽 `x`가 있다. 상하좌우로 이동해 모든 먼지를 청소하는 최소 이동 횟수를 구해야 한다.

격자 전체에서 “어떤 먼지를 먼저 방문할지”까지 한 번에 탐색하면 상태가 복잡해진다. 대신 문제를 두 단계로 나눈다.

1. 로봇과 각 먼지 사이의 최단 거리를 BFS로 구한다.
2. 그 거리만 사용해 먼지 방문 순서를 결정한다.

첫 단계가 끝나면 큰 격자는 최대 11개 지점으로 이루어진 작은 완전 그래프로 바뀐다. 이처럼 원래 공간에서 중요한 지점 사이 거리만 남기는 것이 핵심이다.

## 1단계: BFS로 지점 사이 거리 구하기

BFS는 간선 비용이 모두 1인 격자에서 최단 거리를 구한다. 로봇과 각 먼지에서 BFS를 한 번씩 실행하면 모든 중요 지점 쌍의 거리를 얻을 수 있다.

어느 먼지도 로봇에서 도달할 수 없다면 방문 순서를 고민할 필요 없이 답은 -1이다.

## 2단계: 청소한 먼지를 비트로 기록하기

먼지는 최대 10개다. 각 먼지의 청소 여부를 비트 하나로 표현하면 `2¹⁰ = 1024`가지 상태만 생긴다.

`solve(current, mask)`를 다음처럼 정의한다.

- `current`: 현재 서 있는 중요 지점
- `mask`: 지금까지 청소한 먼지 집합
- 반환값: 남은 먼지를 모두 청소하는 최소 추가 거리

같은 위치와 같은 청소 상태는 이후 선택도 같으므로 한 번 계산한 값을 메모이제이션한다.

## C++ 풀이

```cpp
#include <algorithm>
#include <cstring>
#include <iostream>
#include <queue>
#include <string>
#include <vector>

using namespace std;

const int INF = 1'000'000;
const int dy[4] = {-1, 1, 0, 0};
const int dx[4] = {0, 0, -1, 1};

struct Point {
    int y, x;
};

int width, height;
vector<string> room;
vector<Point> points;  // 0번은 로봇, 1번부터 먼지
vector<vector<int>> pairDistance;
int memo[11][1 << 10];

vector<vector<int>> bfs(Point start) {
    vector<vector<int>> distance(height, vector<int>(width, -1));
    queue<Point> q;

    distance[start.y][start.x] = 0;
    q.push(start);

    while (!q.empty()) {
        Point current = q.front();
        q.pop();

        for (int dir = 0; dir < 4; ++dir) {
            int ny = current.y + dy[dir];
            int nx = current.x + dx[dir];

            if (ny < 0 || ny >= height || nx < 0 || nx >= width) continue;
            if (room[ny][nx] == 'x' || distance[ny][nx] != -1) continue;

            distance[ny][nx] = distance[current.y][current.x] + 1;
            q.push({ny, nx});
        }
    }

    return distance;
}

int solve(int current, int mask) {
    int dirtCount = static_cast<int>(points.size()) - 1;
    int allCleaned = (1 << dirtCount) - 1;
    if (mask == allCleaned) return 0;

    int& cached = memo[current][mask];
    if (cached != -1) return cached;

    cached = INF;
    for (int next = 1; next < static_cast<int>(points.size()); ++next) {
        int bit = 1 << (next - 1);
        if (mask & bit) continue;
        if (pairDistance[current][next] == -1) continue;

        cached = min(
            cached,
            pairDistance[current][next] + solve(next, mask | bit)
        );
    }
    return cached;
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    while (cin >> width >> height && (width != 0 || height != 0)) {
        room.resize(height);
        points.clear();
        vector<Point> dirt;

        Point robot{};
        for (int y = 0; y < height; ++y) {
            cin >> room[y];
            for (int x = 0; x < width; ++x) {
                if (room[y][x] == 'o') robot = {y, x};
                if (room[y][x] == '*') dirt.push_back({y, x});
            }
        }

        points.push_back(robot);
        points.insert(points.end(), dirt.begin(), dirt.end());

        int pointCount = static_cast<int>(points.size());
        pairDistance.assign(pointCount, vector<int>(pointCount, -1));

        for (int i = 0; i < pointCount; ++i) {
            vector<vector<int>> distance = bfs(points[i]);
            for (int j = 0; j < pointCount; ++j) {
                pairDistance[i][j] = distance[points[j].y][points[j].x];
            }
        }

        memset(memo, -1, sizeof(memo));
        int answer = solve(0, 0);
        cout << (answer >= INF ? -1 : answer) << '\n';
    }
}
```

## 왜 로봇 위치를 고정해야 하는가

방문 순서를 단순 순열로 만들 때 로봇까지 다른 지점과 함께 섞으면, 먼지에서 출발하는 잘못된 경로가 후보에 들어간다. 시작점은 언제나 로봇이므로 `solve(0, 0)`에서 시작하고, 선택 대상은 먼지만 둔다.

비트마스크 DP를 쓰면 같은 먼지 집합에 여러 순서로 도착했을 때 남은 탐색을 반복하지 않는 장점도 있다.

## 복잡도

- 거리 전처리: O(K × W × H)
- 방문 순서 DP: O(K² × 2ᴷ)
- 공간: O(K × W × H + K × 2ᴷ)

K는 먼지 수이며 최대 10이다.

*격자에서는 BFS로 중요 지점 사이 거리를 구하고, 작은 지점 그래프에서는 비트마스크 DP로 방문 순서를 최적화한다.*
