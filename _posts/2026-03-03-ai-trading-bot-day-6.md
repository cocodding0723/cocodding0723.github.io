---
title: "AI 트레이딩 봇 개발기 - 6일차"
description: "git push 한 번으로 서버 배포를 자동화하는 4가지 방법 비교, Unity 게임 이벤트 트래킹 설계. 코드 없이 설계만 한 하루의 기록."
date: 2026-03-03
categories: [Project]
tags: [AI, Trading, Unity]
---

## 코드를 한 줄도 쓰지 않은 날

[5일차](/blog/2026/03/02/ai-trading-bot-day-5/)까지는 매일 코드가 바뀌었다. API 폴백, 트레일링 스탑, 백테스트 프레임워크, 선물 백테스트, 30건 버그 수정. 기능을 만들고 고치는 데 집중한 5일이었다.

6일차에는 코드를 한 줄도 쓰지 않았다. 대신 두 가지 설계를 했다. AI 트레이딩 봇의 배포 자동화, 그리고 Unity 게임 프로젝트(AI-Vamsulike)의 이벤트 트래킹 아키텍처. 프로젝트 두 개를 오가며 "어떻게 만들 것인가"를 정리한 날이다.

코드를 작성하지 않아도 설계는 진행된다. 오히려 코드를 치기 전에 선택지를 펼쳐놓고 비교하는 시간이 이후 작업 속도를 결정한다.

---

## 배포 자동화: git push 한 번으로 서버에 반영하기

트레이딩 봇은 현재 외부 서버에서 돌아간다. 코드를 수정할 때마다 SSH로 접속해서 `git pull`하고, 프로세스를 재시작하는 과정을 반복하고 있었다. 매번 터미널을 열고, 서버에 붙고, 명령어를 치는 것 — 자동매매 봇을 만들면서 정작 배포는 수동이라는 모순이다.

목표는 단순하다. **로컬에서 `git push`만 하면 서버에서 자동으로 최신 코드를 받아 프로그램을 재시작하는 것.**

검토한 방법은 네 가지다.

### 방법 1: GitHub Actions

GitHub의 CI/CD 파이프라인이다. `.github/workflows/deploy.yml` 파일 하나로 push 이벤트에 반응하는 워크플로우를 정의한다.

```yaml
# .github/workflows/deploy.yml
name: Deploy Trading Bot
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: SSH로 서버 접속 후 배포
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /opt/ai-trading-v3
            git pull origin main
            pip install -r requirements.txt
            systemctl restart trading-bot
```

GitHub 서버에서 SSH로 내 서버에 접속해 명령을 실행하는 구조다. 테스트, 린트 등 중간 단계를 끼워넣기 좋다.

### 방법 2: Webhook 수신 서버

서버에 경량 HTTP 서버를 띄워 GitHub webhook을 직접 수신하는 방식이다.

```python
# deploy_webhook.py
from flask import Flask, request
import subprocess

app = Flask(__name__)

@app.route('/deploy', methods=['POST'])
def deploy():
    payload = request.json
    if payload.get('ref') == 'refs/heads/main':
        subprocess.run(['bash', '/opt/scripts/deploy.sh'], check=True)
        return 'Deployed', 200
    return 'Skipped', 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=9000)
```

```bash
#!/bin/bash
# /opt/scripts/deploy.sh
cd /opt/ai-trading-v3
git pull origin main
pip install -r requirements.txt
systemctl restart trading-bot
```

GitHub 리포지토리 설정에서 `http://서버IP:9000/deploy`를 webhook URL로 등록하면 된다. push가 발생할 때마다 GitHub이 이 URL로 POST 요청을 보낸다.

### 방법 3: Git Hook (post-receive)

서버에 bare repository를 만들고, `post-receive` hook으로 배포를 트리거하는 방식이다.

```bash
# 서버에서 bare repo 생성
git init --bare /opt/ai-trading-v3.git

# post-receive hook 작성
cat > /opt/ai-trading-v3.git/hooks/post-receive << 'EOF'
#!/bin/bash
TARGET="/opt/ai-trading-v3"
GIT_DIR="/opt/ai-trading-v3.git"

git --work-tree=$TARGET --git-dir=$GIT_DIR checkout -f main
cd $TARGET
pip install -r requirements.txt
systemctl restart trading-bot
EOF

chmod +x /opt/ai-trading-v3.git/hooks/post-receive
```

로컬에서 remote를 추가하고 push하면 hook이 발동한다.

```bash
# 로컬에서 remote 추가
git remote add deploy user@서버IP:/opt/ai-trading-v3.git
git push deploy main
```

GitHub을 경유하지 않고 서버에 직접 push하는 구조다.

### 방법 4: Docker 컨테이너화

봇 자체를 Docker 이미지로 만들어 배포하는 방식이다.

```dockerfile
# Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["python", "main.py"]
```

```yaml
# docker-compose.yml
services:
  trading-bot:
    build: .
    restart: always
    env_file: .env
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs
```

GitHub Actions에서 Docker 이미지를 빌드해서 레지스트리에 올리고, 서버에서 pull + restart하는 흐름이 된다. 환경 일관성이 보장되지만, 초기 설정 비용이 가장 높다.

---

## 4가지 방법 비교

| 항목 | GitHub Actions | Webhook | Git Hook | Docker |
|------|---------------|---------|----------|--------|
| **초기 설정** | 낮음 (YAML 하나) | 중간 (서버 프로세스) | 낮음 (hook 스크립트) | 높음 (Dockerfile + compose) |
| **외부 의존** | GitHub 서비스 | 없음 (자체 서버) | 없음 (자체 서버) | Docker 레지스트리 |
| **보안** | SSH 키 Secrets 관리 | 포트 개방 + secret 검증 | SSH 키 관리 | 이미지 레지스트리 인증 |
| **CI/CD 확장** | 매우 쉬움 | 수동 구현 | 어려움 | Actions 연동 가능 |
| **환경 일관성** | 서버 환경 의존 | 서버 환경 의존 | 서버 환경 의존 | 완전 격리 |
| **디버깅** | GitHub UI에서 로그 | 서버 로그 직접 확인 | 서버 로그 직접 확인 | 컨테이너 로그 |
| **적합한 규모** | 팀/오픈소스 | 개인 서버 | 단일 서버 | 멀티 환경 |

### 개인 트레이딩 봇에는 어떤 것이 적합한가

결론부터 말하면, **Webhook 방식이 가장 실용적**이다.

이유는 세 가지다.

1. **이미 외부 서버가 있다.** 트레이딩 봇이 돌아가는 서버가 곧 배포 대상이다. GitHub Actions처럼 외부에서 SSH로 들어올 필요 없이, 서버가 직접 webhook을 수신하면 된다.
2. **확장이 자유롭다.** 배포 전 테스트를 끼워넣고 싶으면 `deploy.sh`에 한 줄 추가하면 된다. 배포 실패 시 Slack 알림도 스크립트 수준에서 해결 가능하다.
3. **디버깅이 직관적이다.** 문제가 생기면 서버에 접속해서 로그를 보면 된다. GitHub Actions의 러너 환경에서 디버깅하는 것보다 훨씬 빠르다.

Docker는 환경 격리가 매력적이지만, 봇 하나를 운영하는 데는 과하다. Git Hook은 GitHub를 경유하지 않으므로 코드 리뷰나 PR 워크플로우와 단절된다. GitHub Actions는 훌륭하지만, 개인 서버 한 대에 배포하는 용도로는 과하다.

다음 작업 시 Webhook 방식으로 구현할 예정이다.

---

## Unity 게임 이벤트 트래킹 설계

트레이딩 봇과 별개로, AI-Vamsulike(뱀서라이크 Unity 게임) 프로젝트의 이벤트 트래킹 아키텍처도 설계했다.

### 현재 구조: R3 Subject 기반 GameEvents 허브

게임 내 모든 이벤트는 `GameEvents` 정적 클래스를 통해 발행된다. Reactive Extensions(R3)의 Subject 패턴을 사용한다.

```csharp
// GameEvents.cs (기존 구조)
public static class GameEvents
{
    // 전투 이벤트
    public static readonly Subject<DamageEvent> OnDamageDealt = new();
    public static readonly Subject<KillEvent> OnEnemyKilled = new();
    public static readonly Subject<LevelUpEvent> OnLevelUp = new();

    // 경제 이벤트
    public static readonly Subject<GoldEvent> OnGoldChanged = new();
    public static readonly Subject<ItemEvent> OnItemAcquired = new();

    // ... 총 21종 이벤트
}
```

각 시스템(전투, UI, 사운드 등)이 필요한 이벤트를 구독하는 구조다. 이 구조 자체는 잘 동작한다. 문제는 분석 데이터 수집이다. "플레이어가 어떤 무기로 가장 많이 킬을 했는지", "어느 시점에서 죽는지", "골드 획득 패턴은 어떤지" 같은 데이터를 모으려면, 이벤트를 수집하는 별도 시스템이 필요하다.

### 설계안: AnalyticsTracker (Observer 패턴)

기존 GameEvents 허브를 건드리지 않고, 구독만 하는 AnalyticsTracker를 추가하는 방식이다.

```csharp
// AnalyticsTracker.cs (설계안)
public class AnalyticsTracker : MonoBehaviour
{
    private readonly List<AnalyticsEvent> _buffer = new();
    private float _flushInterval = 30f; // 30초마다 저장

    void Start()
    {
        // GameEvents 구독 — 기존 코드에 영향 없음
        GameEvents.OnEnemyKilled.Subscribe(e => Track("enemy_killed", new
        {
            enemy_type = e.EnemyType,
            weapon_used = e.WeaponId,
            time_elapsed = Time.time
        })).AddTo(this);

        GameEvents.OnLevelUp.Subscribe(e => Track("level_up", new
        {
            new_level = e.Level,
            time_elapsed = Time.time
        })).AddTo(this);

        GameEvents.OnGoldChanged.Subscribe(e => Track("gold_changed", new
        {
            amount = e.Amount,
            source = e.Source
        })).AddTo(this);

        // 버퍼를 주기적으로 저장
        Observable.Interval(TimeSpan.FromSeconds(_flushInterval))
            .Subscribe(_ => Flush())
            .AddTo(this);
    }

    private void Track(string eventName, object data)
    {
        _buffer.Add(new AnalyticsEvent
        {
            Name = eventName,
            Data = data,
            Timestamp = DateTime.UtcNow
        });
    }

    private void Flush()
    {
        if (_buffer.Count == 0) return;
        // MVP: 로컬 JSON 파일로 저장
        // 이후: Firebase, 자체 백엔드 등으로 확장
        SaveToJson(_buffer);
        _buffer.Clear();
    }
}
```

이 설계의 장점은 **기존 코드를 전혀 수정하지 않는다는 것**이다. GameEvents는 발행만 하고, AnalyticsTracker는 구독만 한다. 트래킹을 끄고 싶으면 AnalyticsTracker 게임오브젝트를 비활성화하면 된다. 게임 로직과 분석 로직이 완전히 분리된다.

### MVP vs 풀 스택

구현 후보는 두 가지다.

| 항목 | MVP (로컬 JSON) | 풀 스택 (Firebase) |
|------|-----------------|-------------------|
| 저장소 | 로컬 파일 | Firebase Firestore |
| 실시간 확인 | 파일 열어서 확인 | Firebase 콘솔 대시보드 |
| 구현 시간 | 1~2시간 | 반나절~하루 |
| 적합한 시점 | 프로토타입 | 플레이테스트 배포 후 |

MVP로 시작해서 로컬 JSON에 저장하고, 플레이테스트 단계에서 Firebase로 전환하는 것이 합리적이다. 분석 구조는 동일하고, Flush 메서드의 저장 대상만 바꾸면 된다.

---

## 6일간의 회고

6일차까지 오면서 AI 트레이딩 봇이 어떤 궤적을 그렸는지 정리한다.

| 일차 | 핵심 작업 | 성격 |
|------|----------|------|
| 1일차 | Claude API 529 폴백 + OpenAI 자동 전환 | 장애 대응 |
| 2일차 | 트레일링 스탑 구현 | 신규 기능 |
| 3일차 | 백테스트 프레임워크 구축 | 인프라 |
| 4일차 | 선물 백테스트 확장 | 기능 확장 |
| 5일차 | 30건 버그 수정 | 안정화 |
| 6일차 | 배포 자동화 설계 + 이벤트 트래킹 설계 | 설계 |

1~5일차는 코드를 쓰는 날이었다. 6일차는 코드를 쓰지 않고 생각하는 날이었다. 돌아보면, 설계 없이 바로 코드로 들어갔다면 Webhook과 Docker 사이에서 중간에 방향을 바꾸거나, AnalyticsTracker를 GameEvents에 직접 끼워넣어 결합도를 높이는 실수를 했을 가능성이 크다.

현재 시스템의 상태를 요약하면 다음과 같다.

- **AI 분석**: Claude 우선 + OpenAI 폴백 (안정화 완료)
- **매매 전략**: 트레일링 스탑 포함, 선물/현물 지원
- **검증**: 백테스트 프레임워크 (현물 + 선물)
- **안정성**: 주요 버그 30건 수정
- **배포**: 수동 → Webhook 자동화 (설계 완료, 구현 예정)

다음 단계는 Webhook 배포 구현과, 실제 운영 데이터를 기반으로 한 전략 튜닝이다.

---

*배포 자동화 4가지 방법을 비교하고 Webhook을 선택, Unity 이벤트 트래킹 아키텍처를 설계한 — 코드 없이 설계로 채운 6일차 기록이다.*
