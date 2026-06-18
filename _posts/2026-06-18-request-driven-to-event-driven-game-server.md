---
title: "request-driven에서 event-driven으로 — 마작 게임 서버를 다시 짠 기록"
description: "평문 비밀번호와 단일 스레드로 모든 걸 처리하던 마작 게임 서버를 IO·로직·DB 워커로 나눈 event-driven 코어로 다시 짠 기록. request-driven의 한계부터 Argon2 해싱·송신 큐·Docker 통합 테스트까지 실제 C++ 코드로 정리한다."
date: 2026-06-18
categories: [Project]
tags: [C++, Server, Game, Architecture]
---

## 들어가며 — 요청이 와야만 움직이는 서버

팀 프로젝트로 만들던 실시간 마작 게임 서버(C++ / Boost.Asio + PostgreSQL) 코드를 넘겨받았다. 클라이언트가 붙고, 로그인하고, 4명이 모이면 매칭이 잡혀 패를 섞는 데까지 동작은 됐다. 그런데 코드를 따라가 보니 서버 전체가 **딱 하나의 동작 모델**로만 굴러가고 있었다.

> 클라이언트 패킷이 도착한다 → 그 자리에서 동기 처리한다 → 응답을 보낸다.

이게 전부였다. 서버가 **스스로** 무언가를 시작하는 통로가 없었다. "30초 동안 입력이 없으면 끊는다", "DB 검증이 끝나면 그때 응답한다", "매칭이 성사되면 4명 모두에게 먼저 보낸다" 같은, 요청에 대한 1:1 응답이 아닌 동작을 끼워 넣을 자리가 구조적으로 없었던 것이다.

이게 **request-driven** 구조의 본질적 한계다. 이 글은 그 한계가 코드에서 구체적으로 어떻게 터졌는지, 그리고 그걸 **event-driven** 코어로 어떻게 다시 짰는지를 실제 작업한 커밋 순서대로 정리한 기록이다. 같이 보강한 비밀번호 해싱·송신 큐·운영 안정화·Docker 통합 테스트까지 묶었다.

순서는 **① 두 패턴 정의 → ② request-driven 서버의 실제 모습 → ③ 그래서 깨진 것들 → ④ event-driven 전환 → ⑤ 골격 위 나머지 작업 → ⑥ before/after**다.

---

## request-driven vs event-driven — 두 패턴부터 정리

용어가 흔하게 쓰이는 만큼 사람마다 다르게 쓴다. 이 글에서 쓰는 정의는 이렇다.

- **request-driven**: 처리의 트리거가 **외부 요청(클라이언트 패킷)뿐**이다. 요청이 오면 처리하고, 안 오면 아무 일도 안 한다. REST API 핸들러가 전형이다. 요청 1개 → 응답 1개의 세계.
- **event-driven**: 처리의 트리거가 **"이벤트"로 일반화**된다. 클라이언트 패킷도 이벤트, 연결 종료도 이벤트, 타이머 만료도 이벤트, "DB 작업이 끝났다"도 이벤트다. 처리 주체는 큐에서 이벤트를 하나씩 꺼내 처리할 뿐이고, 누가 그 이벤트를 넣었는지는 신경 쓰지 않는다.

표로 정리하면 차이가 분명해진다.

| 항목 | request-driven | event-driven |
|------|----------------|--------------|
| 처리 트리거 | 클라이언트 패킷 도착만 | 패킷·끊김·타이머·작업 완료 등 모든 이벤트 |
| 서버 발신(push) | 불가 — 요청에 대한 응답만 | 가능 — 로직이 언제든 송신을 시작 |
| 블로킹 작업(DB·해싱) | 처리 스레드에서 그 자리 실행 → 전체 정지 | 워커로 위임, 완료를 이벤트로 회신 |
| 상태 동시성 | 핸들러가 IO 스레드에서 상태 직접 변경 | 단일 로직 스레드가 상태 소유 → 락 불필요 |
| 시간 개념 | 없음(요청에 종속) | 있음(스스로 타이머·주기 작업) |
| 잘 맞는 곳 | 단순 요청-응답 API | 실시간·멀티플레이·스스로 시간을 다루는 서버 |

핵심은 마지막 줄이다. **request-driven은 틀린 패턴이 아니다.** 단순 요청-응답 서비스라면 오히려 더 단순하고 좋다. 문제는 멀티플레이 게임 서버처럼 "서버가 스스로 시간을 다루고, 클라이언트에게 먼저 말을 걸어야 하는" 도메인에 request-driven을 쓸 때 생긴다. 우리 서버가 정확히 그 경우였다.

---

## request-driven 서버의 실제 모습

넘겨받은 코드(`master` 브랜치)의 흐름은 이랬다.

```text
[기동]    main() → DB 연결 → io_context.run()  (단일 스레드)
                                  │
[수락]    async_accept ──→ Session 생성 ──→ start()
                                  │
[수신]    do_read_header(5B) ─→ do_read_body ─→ PacketProcess::Process()
                                  │                  (IO 스레드에서 동기 실행)
[로그인]  ProcessLogin → ValidateUser(DB 쿼리 + Argon2) → GetPlayerProfile(DB 쿼리)
                                  │
[송신]    async_write (큐 없음, fire-and-forget)
```

전부 한 스레드(`io_context.run()`)에서 돌았다. 네트워크 IO도, 패킷 처리도, DB 쿼리도, 비밀번호 검증도 같은 스레드다. 그리고 `Process()`는 IO 스레드에서 **동기로 인라인 실행**됐다. 즉, 한 클라이언트의 로그인 처리가 끝날 때까지 **다른 모든 세션의 수신과 송신이 멈췄다.**

더 근본적인 문제는 따로 있었다. `Session`을 만든 뒤 **아무 데도 보관하지 않았다.** `shared_ptr<Session>`이 비동기 콜백 체인 안에서만 살아 있어서, 서버가 "3번 세션에게 지금 패킷 보내"를 할 방법 자체가 없었다. 매칭이 성사돼도 4명에게 먼저 보낼 수가 없는 것이다. 이게 request-driven 구조가 코드에 박혀버린 지점이었다.

---

## 그래서 무엇이 깨졌나 — 코드에서 마주한 문제들

전환에 앞서 흐름을 단계별로 뜯어 [`docs/server-flow-analysis.md`](https://github.com/cocodding0723/pokermahjong-server)에 문제를 전부 적었다. 그중 실제로 사람을 잡는 치명적인 것들만 추리면 이렇다.

**① Argon2 검증이 IO 스레드를 점유한다.** 비밀번호 검증(`crypto_pwhash_str_verify`)은 의도적으로 느린 연산이다 — 건당 수십~수백 ms, 메모리 64MB. 이게 IO 스레드에서 동기로 돌면 **로그인 1건마다 서버 전체가 그 시간만큼 정지**한다. 초당 로그인 10건이면 서버 가용 시간의 대부분을 해시 검증이 먹는다.

**② 바디 수신 중 끊기면 유저가 영원히 남는다.** 헤더 read 에러에서는 `RemoveUser`를 부르는데, 바디 read 에러 분기에서는 안 불렀다. 로그인 후 바디 수신 중 끊긴 유저는 `m_activeUsers`에 영원히 남고, 중복 로그인 차단에 걸려 **서버 재시작 전까지 그 계정은 재로그인 불가**가 된다. 유령 유저다.

**③ 송신 큐가 없어 바이트가 섞인다.** Asio 규칙상 하나의 소켓에는 `async_write`가 동시에 1개만 진행될 수 있다. 그런데 기존 `SendPacket`은 호출마다 즉시 `async_write`를 걸었다. master는 요청당 응답 1개라 잠재 상태였지만, **매칭 브로드캐스트(4명 연속 송신)에서 즉시 현실화**되는 데이터 손상 버그였다.

**④ DB 장애가 로그인 실패로 위장한다.** `Query()`가 예외를 삼키고 빈 결과를 반환해서, 호출자는 "계정 없음"과 "DB 다운"을 구분할 수 없었다. DB가 죽었는데 클라이언트는 `INVALID_CREDENTIALS`를 받는, 장애 은폐 상황이었다.

**⑤ 종료 처리가 없다.** `signal_set`이 없어 Ctrl+C/SIGTERM 시 진행 중인 쓰기·DB 작업·세션 정리 없이 그냥 죽었다. 스레드를 늘리는 순간(로직/DB 워커) 이건 치명적이 된다.

①과 ③, ⑤는 전부 한 뿌리에서 나온다. **"모든 걸 한 스레드에서, 요청에 대한 응답으로만 처리한다"** 는 request-driven 구조 그 자체다. 그래서 개별 버그를 때우는 대신 코어를 갈아엎기로 했다.

---

## event-driven 코어로 다시 짜기

목표는 단순하다. **"네트워크 IO 스레드와 게임 로직 스레드는 절대 블로킹하지 않는다."** 무거운 작업은 따로 빼고, 스레드 사이는 큐 하나로만 잇는다. 구조를 셋으로 나눴다.

```text
   ┌─────────────┐   PacketEvent /     ┌──────────────┐
   │  IO 스레드   │   DisconnectEvent   │  로직 스레드  │
   │ (Boost.Asio)│ ──────────────────▶ │ (단일 소유)   │
   └─────────────┘                     └──────┬───────┘
         ▲                                    │ Post(블로킹 작업)
         │ async_write                        ▼
         │                              ┌──────────────┐
         └────────── TaskEvent ──────── │  DB 워커 풀   │
                  (게임 상태 반영+송신)   │ (쿼리+Argon2) │
                                        └──────────────┘
```

- **IO 스레드**: 소켓만 다룬다. 패킷을 받으면 `PacketEvent`로 만들어 로직 큐에 넣고, 끝. 끊기면 `DisconnectEvent`를 넣고, 끝.
- **로직 스레드**: 게임 상태(유저·룸·매칭 큐)를 **혼자** 소유한다. 큐에서 이벤트를 하나씩 꺼내 처리하고, 그 안에서는 **어떤 블로킹도 하지 않는다.** 혼자 소유하므로 락이 필요 없다.
- **DB 워커 풀**: DB 쿼리·Argon2 같은 블로킹 작업 전용. 끝나면 결과를 다시 `TaskEvent`로 로직 큐에 되돌린다.

### 스레드 경계를 넘는 유일한 통로 — EventQueue

핵심은 큐 하나다. 모든 스레드 간 데이터는 이 MPMC(멀티 프로듀서·멀티 컨슈머) 블로킹 큐로만 오간다.

```cpp
template<typename T>
class EventQueue {
public:
    void Push(T event) {
        {
            std::lock_guard<std::mutex> lock(mutex_);
            queue_.push_back(std::move(event));
        }
        cv_.notify_one(); // 잠금을 푼 뒤 깨워야 불필요한 재대기를 막는다
    }

    // 반환값이 nullopt면 "Stop() 호출됨 + 큐 소진" → 루프 종료.
    // Stop() 이후에도 큐에 남은 이벤트는 전부 소진된 뒤에야 nullopt가 나온다.
    std::optional<T> WaitPop() {
        std::unique_lock<std::mutex> lock(mutex_);
        cv_.wait(lock, [this] { return stopped_ || !queue_.empty(); });
        if (queue_.empty()) return std::nullopt;
        T event = std::move(queue_.front());
        queue_.pop_front();
        return event;
    }

    void Stop() { /* stopped_ = true; cv_.notify_all(); */ }
private:
    std::deque<T> queue_;
    std::mutex mutex_;
    std::condition_variable cv_;
    bool stopped_ = false;
};
```

`WaitPop()`이 `nullopt`를 "정지 + 큐 소진"일 때만 반환한다는 게 중요하다. 덕분에 종료할 때 큐에 남은 이벤트를 버리지 않고 전부 처리한 뒤 깔끔하게 끝낼 수 있다.

### 모든 게 "이벤트"가 된다 — Events

로직 스레드 입장에서는 패킷이든, 끊김이든, DB 작업 완료든 전부 똑같은 이벤트다. `std::variant`로 묶었다.

```cpp
struct PacketEvent {       // IO 스레드 → 로직 스레드
    int sessionId;
    short packetId;
    std::vector<char> body; // 수신 버퍼에서 move — 복사 비용 없음
};

struct DisconnectEvent {   // IO 스레드 → 로직 스레드
    int sessionId;
};

struct TaskEvent {         // DB 워커 → 로직 스레드
    std::function<void()> fn; // 블로킹 작업의 "후속 처리"를 로직 스레드로 되돌림
};

using Event = std::variant<PacketEvent, DisconnectEvent, TaskEvent>;
```

로직 스레드의 메인 루프는 이것뿐이다. 큐에서 꺼내 종류에 따라 분기한다.

```cpp
std::thread logicThread([&]() {
    while (auto eventOpt = logicQueue.WaitPop()) {
        auto &event = *eventOpt;
        if (auto *pkt = std::get_if<core::PacketEvent>(&event)) {
            processor.Process(pkt->packetId, pkt->body.data(), pkt->body.size(), pkt->sessionId, route);
        } else if (auto *dc = std::get_if<core::DisconnectEvent>(&event)) {
            // 유저 / 매칭 큐 / 세션 맵 정리 — 전부 로직 스레드에서
        } else if (auto *task = std::get_if<core::TaskEvent>(&event)) {
            task->fn(); // DB 워커가 되돌린 후속 작업
        }
    }
});
```

### 블로킹은 전부 워커로 — WorkerPool

DB 쿼리와 Argon2 해싱은 여기로 보낸다. 워커는 작업을 실행하고, 결과를 `TaskEvent`로 로직 큐에 되돌린다.

```cpp
class WorkerPool {
public:
    explicit WorkerPool(size_t threadCount) {
        for (size_t i = 0; i < threadCount; ++i)
            threads_.emplace_back([this]() {
                while (auto job = jobs_.WaitPop()) (*job)();
            });
    }
    void Post(std::function<void()> job) { jobs_.Push(std::move(job)); }
    void Stop() { /* jobs_.Stop(); join all */ }
private:
    core::EventQueue<std::function<void()>> jobs_;
    std::vector<std::thread> threads_;
};
```

> 워커 수 메모: DB 커넥션이 1개라 SQL은 내부에서 직렬화되지만, 로그인 비용의 대부분인 **Argon2 해싱은 워커 수만큼 병렬**로 돈다. 로그인이 몰리면 워커 수를 늘리면 처리량이 따라 늘어난다.

### 로그인 — 3단계로 쪼갠 실제 경로

이 패턴이 한데 모이는 곳이 로그인이다. 기존엔 IO 스레드에서 한 방에 끝나던 걸 셋으로 쪼갰다.

```cpp
// 1단계 (로직 스레드): 패킷 파싱 + 값 복사
//   고정 길이 char 배열은 널 종료 보장이 없으므로 strnlen으로 안전 복사.
//   원본 버퍼는 함수가 리턴하면 사라지므로 비동기 작업엔 값 복사가 필수다.
const std::string ID(reqPkt->szID, strnlen(reqPkt->szID, sizeof(reqPkt->szID)));
const std::string PW(reqPkt->szPW, strnlen(reqPkt->szPW, sizeof(reqPkt->szPW)));

// 2단계 (DB 워커): 블로킹 인증 — DB 조회 + Argon2 검증
m_pDbWorkers->Post([this, ID, PW, sessionIndex, routeCallback]() {
    PlayerProfile profile;
    const auto authResult = m_pUserHandler->Authenticate(ID, PW, profile);

    // 3단계 (로직 스레드, TaskEvent): 게임 상태 반영 + 응답 송신
    m_pLogicQueue->Push(core::TaskEvent{[=]() {
        // DB 작업 중 클라이언트가 끊겼다면 결과를 폐기한다.
        // 이 검사가 없으면 DisconnectEvent가 먼저 처리된 뒤 AddUser가 실행돼
        // 접속자도 없는 유령 유저가 영원히 등록된다 → 재로그인 차단.
        if (!m_isSessionAlive(sessionIndex)) return;

        auto finalResult = authResult;
        if (authResult == SUCCESS && !m_pUserManager->AddUser(sessionIndex, profile))
            finalResult = ALREADY_LOGGED_IN; // 게임 상태 변경은 로직 스레드에서만
        // ... PktLoginRes 구성 후 송신
    }});
});
```

규칙이 명확해졌다. **블로킹은 DB 워커, 게임 상태 변경은 로직 스레드.** `UserManager` 같은 상태는 오직 로직 스레드만 만지므로, 그 안에서는 락이 필요 없다. 그리고 ②의 유령 유저 버그가 여기서 `m_isSessionAlive` 한 줄로 자연스럽게 막힌다 — DB 왕복 사이에 세션이 죽었으면 결과를 그냥 버리면 된다.

### 종료도 이벤트 — 순서가 중요한 graceful shutdown

`signal_set`으로 SIGINT/SIGTERM을 받아 `io_context`를 멈추고, **순서대로** 내려간다.

```cpp
boost::asio::signal_set signals(io_context, SIGINT, SIGTERM);
signals.async_wait([&](auto, int) { io_context.stop(); });

io_context.run(); // IO 스레드 (main이 겸함)

// 종료 시퀀스 — 순서가 핵심이다:
dbWorkers.Stop();   // 1. 진행 중 쿼리를 끝내고, 후속 TaskEvent를 로직 큐에 다 넣은 뒤 join
logicQueue.Stop();  // 2. 남은 이벤트(위 TaskEvent 포함)를 전부 소진한 뒤
logicThread.join(); //    로직 스레드 종료
```

DB 워커를 먼저 멈춰야 마지막 작업 결과까지 로직 큐에 들어가고, 그 다음 로직 큐를 멈춰야 그 결과들이 유실 없이 처리된다. `WaitPop`의 "정지 후 큐 소진" 의미가 여기서 빛을 본다.

---

## 골격 위에 올린 나머지 작업들

코어를 바꾸기 전후로, 함께 보강한 것들이다.

### 평문 비밀번호 → Argon2id 해싱

기존엔 비밀번호를 평문 비교했다. libsodium의 `crypto_pwhash`(Argon2id)로 갈아끼웠다.

```cpp
static std::string Hash(const std::string &password) {
    char hash[crypto_pwhash_STRBYTES]; // 128B — 알고리즘/솔트/비용이 문자열 안에 포함
    if (crypto_pwhash_str(hash, password.c_str(), password.size(),
                          crypto_pwhash_OPSLIMIT_INTERACTIVE,
                          crypto_pwhash_MEMLIMIT_INTERACTIVE) != 0)
        throw std::runtime_error("[PasswordUtils] Hashing failed: out of memory");
    return std::string(hash);
}

static bool Verify(const std::string &password, const std::string &storedHash) {
    // 비교는 libsodium 내부에서 상수 시간(constant-time)으로 수행된다
    return crypto_pwhash_str_verify(storedHash.c_str(), password.c_str(), password.size()) == 0;
}
```

SHA-256/MD5가 아니라 Argon2id를 쓴 이유는, 비밀번호 해싱은 **느릴수록 좋기** 때문이다(무차별 대입 비용을 올린다). 솔트와 비용 파라미터가 해시 문자열 안에 같이 들어가서 별도 컬럼이 필요 없다는 것도 장점이다. 단, 이 "느림" 때문에 검증을 IO 스레드에서 돌리면 안 된다는 게 바로 위 event-driven 전환의 직접적 동기였다. `sodium_init()`은 다른 API보다 먼저 1회 호출해야 한다 — 기존 game 브랜치에서 이게 누락돼 있던 회귀도 같이 복원했다.

### 세션별 송신 큐

③의 바이트 인터리브를 막는다. "소켓당 async_write 1개" 규칙을 코드로 강제했다.

```cpp
void SendPacket(std::vector<char> sendBuffer) {
    if (sendQueue_.size() >= kMaxSendQueueSize) { /* 백프레셔: 느린 클라 끊기 */ return; }
    const bool writeInProgress = !sendQueue_.empty();
    sendQueue_.push_back(std::move(sendBuffer));
    if (!writeInProgress) do_write(); // 진행 중이 아닐 때만 체인 시작
}

void do_write() {
    boost::asio::async_write(socket_, boost::asio::buffer(sendQueue_.front()),
        [this, self](auto ec, auto) {
            if (ec) { Disconnect("write failed"); return; }
            sendQueue_.pop_front();          // 완료된 뒤에만 pop
            if (!sendQueue_.empty()) do_write(); // 다음 버퍼로 체인
        });
}
```

진행 중인 write의 완료 핸들러만이 다음 `do_write()`를 호출한다. 동시에 두 개가 나갈 수 없다. `kMaxSendQueueSize`(256)로 백프레셔도 걸었다 — 수신이 느린 클라이언트에게 버퍼가 무한 적체되는 걸 막는다.

### 끊김 경로 단일화 + DB 견고화

흩어져 있던 정리 코드를 멱등한 `Disconnect()` 하나로 모았다. 그리고 `DatabaseManager`가 예외를 삼키고 빈 결과를 던지던 걸 고쳐, "계정 없음"과 "DB 장애"를 다른 에러 코드(`DATABASE_ERROR` vs `INVALID_CREDENTIALS`)로 분리했다(④ 해결). 재연결 시 무한 재귀 가능성도 재시도 횟수로 막았다.

### 인증 가드 + 패킷 크기 검증

`reinterpret_cast`로 패킷을 해석하기 **전에** 바디 크기를 반드시 검증하도록 했다. 크기 미달이면 그냥 드롭한다. 로그인하지 않은 세션이 게임/매칭 패킷을 보내는 것도 인증 상태로 거른다.

```cpp
if (bodySize < sizeof(PktLoginReq)) {
    std::cerr << "[Security] Client " << sessionIndex << " sent a malformed LOGIN_REQ. Dropping.\n";
    return;
}
```

### 유휴 타임아웃 + 룸 정리 + 매치 시드

half-open TCP(말없이 사라진 클라이언트)를 잡기 위해 세션별 `steady_timer`를 달았다. `kIdleTimeout`(300초) 동안 패킷이 하나도 안 오면 죽은 연결로 간주하고 끊는다. 패킷이 올 때마다 `expires_after`로 타이머를 다시 무장한다(진행 중 대기는 자동 취소된다). 끊긴 플레이어를 룸에서 제거하는 경로도 추가했고, `12345`로 하드코딩돼 있던 매치 시드도 실제 난수로 바꿨다. **이 전부가 "서버가 스스로 시간을 다룬다"는 event-driven 전환이 있어야 가능한 작업들**이다.

### Docker 통합 테스트

마지막으로 `docker compose`로 DB + 서버를 띄우고, 실제 TCP 소켓으로 바이너리 프로토콜을 검증하는 통합 테스트를 붙였다. 테스트 계정을 시딩하고, 파이썬에서 `struct`로 패킷을 직접 만들어 던진다.

```python
# 패킷 레이아웃은 include/models/Packets.h와 1:1 대응 (#pragma pack(1))
#   PktHeader   : short Id + uint16 TotalSize + uint8 Reserve  → '<hHB' (5바이트)
#   PktLoginReq : char[16] ID + char[16] PW                    → '<16s16s'
#   PktLoginRes : uint8 Status + int coins + int level + int accountId → '<Biii'
HEADER_FMT = "<hHB"

def login(sock, user, pw):
    body = struct.pack("<16s16s", user.encode(), pw.encode())
    sock.sendall(make_packet(USER_LOGIN_REQ, body))
    # ... PktLoginRes 파싱 후 Status 검증
```

정상 로그인, 틀린 비밀번호(`INVALID_CREDENTIALS`), 중복 로그인(`ALREADY_LOGGED_IN`), 매칭까지 시나리오로 검증한다. 프로토콜이 바이너리라 단위 테스트로는 잡기 어려운 직렬화/엔디안 문제를 여기서 걸러낸다.

---

## before / after

| 항목 | before (request-driven) | after (event-driven) |
|------|-------------------------|----------------------|
| 스레드 모델 | 단일 스레드 전부 처리 | IO / 로직(단일 소유) / DB 워커 풀 |
| 블로킹 작업 | IO 스레드 점유 → 전 세션 정지 | DB 워커로 위임, TaskEvent로 회신 |
| 상태 동시성 | IO 스레드에서 직접 변경 | 로직 스레드 단독 소유 → 락 불필요 |
| 서버 발신(push) | 불가 | 세션 맵 + 송신 큐로 가능 |
| 비밀번호 | 평문 비교 | Argon2id(libsodium) |
| 송신 | fire-and-forget(인터리브 위험) | 세션별 송신 큐 + 백프레셔 |
| 죽은 연결 | 영구 대기(유령 유저) | 유휴 타임아웃 300초 |
| DB 장애 | 로그인 실패로 위장 | 별도 에러 코드 전파 |
| 종료 | 즉사 | signal → 순서 있는 graceful shutdown |
| 테스트 | 없음 | Docker 통합 테스트 스위트 |

---

## 마무리

이 작업에서 가장 크게 배운 건, **개별 버그처럼 보이던 것들이 사실 하나의 구조에서 나왔다**는 점이다. Argon2가 서버를 멈추는 것, 매칭 브로드캐스트에서 바이트가 섞이는 것, 죽은 연결이 슬롯을 잡고 안 놓는 것 — 따로 때우려 했으면 끝이 없었을 것이다. "요청에 대한 응답으로만 처리한다"는 request-driven 전제를 "모든 게 이벤트다"로 바꾸자, 타임아웃도 브로드캐스트도 비동기 인증도 전부 같은 큐 위에 자연스럽게 올라갔다.

물론 request-driven이 나쁜 게 아니다. 단순 요청-응답 서비스였다면 이 모든 스레드와 큐는 과한 복잡도였을 것이다. **도메인이 "서버가 스스로 시간을 다루고 클라이언트에게 먼저 말을 거는" 실시간 멀티플레이였기 때문에** event-driven이 맞는 답이었던 것이다. 패턴 선택은 늘 도메인이 결정한다.

*요청에만 반응하던 서버에 "이벤트"라는 단어 하나를 들이자, 멈추던 로그인도 섞이던 송신도 죽은 연결도 같은 큐 위에서 풀렸다.*
