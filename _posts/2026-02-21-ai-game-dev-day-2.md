---
title: "AI로 게임 개발하기 - 2일차"
description: "AI로 뱀서라이크(Vampire Survivors 라이크) 게임을 만들어보자"
date: 2026-02-21
categories: [Project]
tags: [Unity, AI]
---

## 오늘의 목표

게임의 핵심 시스템(플레이어, 무기 22종, 적, 보스, 레벨업, 메타 강화, 업적 등)은 이미 완성된 상태다. 하지만 대부분의 비주얼이 프로시저럴(코드 생성) 스프라이트나 플레이스홀더를 쓰고 있었다. 오늘은 **외부 아트 에셋을 쉽게 교체할 수 있는 인프라** 구축에 집중했다.

핵심 키워드는 **Addressables**. 기존 직접 참조 방식을 유지하면서도, Addressable 키만 입력하면 런타임에 비동기로 에셋을 로드하는 **듀얼 패스(Dual-Pass)** 구조를 설계했다.

---

## 작업 내용

### 1. AddressableSpriteResolver — 듀얼 패스 스프라이트 해석기

모든 스프라이트 로딩의 핵심이 되는 유틸리티 클래스를 만들었다.

```csharp
public static class AddressableSpriteResolver
{
    // Addressable 키가 있으면 비동기 로드, 없으면 직접 참조 사용
    public static void ResolveSprite(Sprite directRef, string addressableKey, Action<Sprite> onResolved)

    // UI Image에 직접 적용하는 편의 메서드
    public static void ResolveSpriteForImage(Image image, Sprite directRef, string addressableKey)
}
```

**설계 포인트:**
- `addressableKey`가 비어있으면 기존 `directRef`를 그대로 사용 → **하위 호환성 100%**
- `AddressableLoader` 싱글톤이 없어도 안전하게 폴백
- 캐싱은 `AddressableLoader`가 담당하므로 중복 구현 없음

이 한 클래스 덕분에 40개 이상 스크립트에서 동일한 패턴으로 Addressable 스프라이트를 지원할 수 있게 됐다.

---

### 2. ScriptableObject에 Addressable 키 필드 추가

8개 데이터 SO에 `addressableKey` 문자열 필드를 추가했다. 기존 Sprite 직접 참조 필드는 그대로 두어 **Inspector 워크플로우가 깨지지 않는다.**

| ScriptableObject | 추가 필드 |
|-----------------|----------|
| WeaponData | `_iconAddressableKey` |
| EnemyData | `_enemySprite` + `_enemySpriteAddressableKey` |
| CharacterData | `_characterSpriteAddressableKey` |
| UpgradeData | `_iconAddressableKey` |
| PassiveItemData | `_iconAddressableKey` |
| AchievementData | `_iconAddressableKey` |
| MetaUpgradeData | `_iconAddressableKey` |
| StageData | `_stageIconAddressableKey` |

에셋을 바꾸고 싶으면? Inspector에서 Addressable 키만 넣으면 끝이다.

---

### 3. 무기/투사체/엔티티 스프라이트 Addressable 지원 (14개 스크립트)

KnifeProjectile, BulletProjectile, ArrowProjectile, RocketProjectile 등 14개 무기/엔티티 스크립트에 `_spriteAddressableKey` 필드를 추가했다. 모든 스크립트가 같은 패턴을 따른다.

```csharp
[SerializeField] private string _spriteAddressableKey;

protected override void Awake()
{
    base.Awake();
    if (!string.IsNullOrEmpty(_spriteAddressableKey))
    {
        AddressableSpriteResolver.ResolveSprite(_sprite, _spriteAddressableKey, resolved =>
        {
            _sprite = resolved;
            var sr = GetComponent<SpriteRenderer>();
            if (sr != null) sr.sprite = resolved;
        });
    }
}
```

기존 프로시저럴 스프라이트가 기본값으로 남아 있어서, 아트 에셋이 준비되기 전에도 게임이 그대로 돌아간다.

---

### 4. UI 카드 Addressable 아이콘 적용 (5개 UI 스크립트)

UpgradeCard, CharacterCard, MetaShopCard, StageCard, AchievementCard — 5개 UI 카드의 아이콘 로딩 로직을 `AddressableSpriteResolver.ResolveSpriteForImage()`로 바꿨다.

이제 SO의 Addressable 키만 채우면 UI 아이콘이 자동으로 비동기 로드된다.

---

### 5. UI 테마 시스템 — UIThemeApplier

UI의 일관된 비주얼을 위해 테마 시스템을 만들었다.

- **UIThemeApplier** (MonoBehaviour): UI 오브젝트에 부착, `UIElementType` enum으로 어떤 테마 스프라이트를 사용할지 지정
- **UIThemeData** (ScriptableObject): 패널, 버튼, 프로그레스 바, 아이콘 등 27개 스프라이트 슬롯
- **UIThemeSetupHelper** (에디터 도구): VioletTheme 스프라이트를 자동 매핑하는 메뉴 아이템

VioletTheme UI 에셋팩(패널 32종, 버튼 18종, 아이콘 90+종, 프로그레스 바 9종)이 이미 프로젝트에 포함되어 있어서, 테마 데이터만 연결하면 바로 적용된다.

---

### 6. VFX 확장 — EffectManager + 무기별 VFX

#### EffectManager 신규 슬롯 6개 추가

| 슬롯 | 매핑 VFX | 용도 |
|------|---------|------|
| `_rocketExplosionEffect` | CFXR Explosion 1 | 로켓 폭발 |
| `_iceHitEffect` | CFXR3 Hit Ice B | 얼음 피격 |
| `_poisonCloudEffect` | CFXR2 Poison Cloud | 독구름 |
| `_electricEffect` | CFXR3 Hit Electric C | 전기 공격 |
| `_magicEffect` | CFXR Magic Poof | 마법 이펙트 |
| `_shinyItemEffect` | CFXR2 Shiny Item | 아이템 반짝임 |

#### 무기별 VFX 필드 추가 (7개 스크립트)

AxeWeapon, SpearWeapon, ThunderZoneEntity, BlackHoleEntity, TurretEntity, GuardianEntity, LandMineEntity에 각각 `_hitVFX`, `_electricVFX`, `_vortexVFX` 등 VFX 프리팹 슬롯을 추가했다.

#### WeaponVFXSetupHelper 경로 수정

이전 서드파티 에셋 리팩토링(`Assets/Packages/` → `Assets/VFX/`) 때문에 깨졌던 VFX 프리팹 경로를 전부 고쳤다.

---

### 7. Addressable 그룹 확장

AddressableSetupHelper에 신규 그룹 3개를 추가했다.

- **VFX_CartoonFX**: `Assets/VFX/CartoonFX/CFXR Prefabs/**/*.prefab`
- **VFX_HyperCasualFX**: `Assets/VFX/HyperCasualFX/Prefabs/**/*.prefab`
- **Sprites_Characters**: `Assets/Sprites/Characters/**/*.png`

기존 11개 + 신규 3개 = **총 14개 Addressable 그룹**으로 늘렸다.

---

### 8. 에디터 자동화 — VisualUpdateSetupHelper

`Tools/Visual Update/` 메뉴에 자동화 도구 4개를 추가했다.

1. **Assign VFX to EffectManager** — CFXR 프리팹을 EffectManager 슬롯에 자동 할당
2. **Create UIThemeData Asset** — VioletTheme 스프라이트를 SO에 자동 매핑
3. **Verify All Sprite References** — 모든 SO/프리팹의 스프라이트 null 참조 검증
4. **Register VFX as Addressable** — VFX 프리팹을 Addressable로 일괄 등록

---

### 9. 비주얼 에셋 매핑 문서 작성

마지막으로 프로젝트의 모든 비주얼 요소를 정리한 매핑 문서를 작성했다.

| 카테고리 | 총 항목 | 완료 | 임시 | 없음 |
|---------|---------|------|------|------|
| 캐릭터 | 3 | 1 | 0 | 2 |
| 적 | 10 | 3 | 0 | 7 |
| 무기 아이콘 | 22 | 0 | 0 | 22 |
| 투사체/엔티티 | 16 | 1 | 15 | 0 |
| 패시브 아이템 | 19 | 0 | 0 | 19 |
| 진화 무기 | 22 | 0 | 0 | 22 |
| UI 테마 | 27 | 27 | 0 | 0 |
| 기타 (업그레이드, 메타, 업적, 스테이지, VFX) | 43 | 7 | 3 | 33 |
| **합계** | **162** | **39** | **18** | **105** |

총 162개 비주얼 에셋 중 39개가 완료, 18개가 임시(프로시저럴), **105개는 신규 제작이 필요하다.**

---

## 아키텍처 다이어그램

```
┌─────────────────────────────────────────────┐
│              ScriptableObject               │
│  ┌─────────┐  ┌──────────────────────────┐  │
│  │  icon   │  │  iconAddressableKey      │  │
│  │(Sprite) │  │  (string, 비어있으면     │  │
│  │         │  │   직접 참조 사용)        │  │
│  └────┬────┘  └────────────┬─────────────┘  │
│       │                    │                │
└───────┼────────────────────┼────────────────┘
        │                    │
        ▼                    ▼
┌───────────────────────────────────────┐
│      AddressableSpriteResolver       │
│                                       │
│  키가 비어있음? → directRef 반환      │
│  키가 있음?    → AddressableLoader    │
│                  로 비동기 로드       │
└───────────────────┬───────────────────┘
                    │
                    ▼
         ┌────────────────────┐
         │  SpriteRenderer /  │
         │  UI Image          │
         │  (최종 적용)       │
         └────────────────────┘
```

---

## 오늘의 수치

- **수정/생성된 파일**: 42개
- **추가된 코드**: 약 1,190줄
- **Addressable 키 필드 추가**: 8개 SO + 14개 무기 스크립트
- **VFX 슬롯 추가**: 6개 (EffectManager) + 7개 (개별 무기)
- **에디터 도구**: 4개 메뉴 아이템
- **컴파일 에러**: 0개

---

## 다음 단계

1. **아트 에셋 제작**: 매핑 문서 기반으로 105개 스프라이트 제작/구매
2. **Addressable 키 할당**: 아트 에셋 준비 후 SO Inspector에서 키 입력
3. **UIThemeApplier 씬 적용**: 기존 Canvas UI에 테마 컴포넌트 일괄 부착
4. **VFX 할당**: `Tools/Visual Update/Assign VFX to EffectManager` 실행
5. **전체 검증**: `Tools/Visual Update/Verify All Sprite References` 실행

인프라가 갖춰졌으니, 이제 에셋만 넣으면 게임 비주얼이 한 단계 올라간다.

---

*이 글은 Unity 6 + Addressables 2.8을 쓰는 2D 로그라이크 프로젝트의 개발 과정을 정리한 것이다.*
