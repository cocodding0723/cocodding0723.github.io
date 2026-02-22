#!/bin/bash
# UserPromptSubmit Hook: 세션 시작 시 session-logs 분석하여 블로그 포스트 후보 제안
# 첫 프롬프트에서만 실행되도록 마커 파일로 제어

MARKER_DIR="/tmp/claude-blog-session"
mkdir -p "$MARKER_DIR"

# 세션별 마커 파일 (PID 기반 — 같은 세션에서 한 번만 실행)
MARKER_FILE="$MARKER_DIR/analyzed_$$"

# 이미 이 세션에서 분석했으면 스킵
if [ -f "$MARKER_FILE" ]; then
  echo '{}'
  exit 0
fi

# stdin 소비 (hook 프로토콜 준수)
cat > /dev/null

# 마커 생성 (이후 프롬프트에서는 스킵)
touch "$MARKER_FILE"

# 오래된 마커 정리 (1일 이상)
find "$MARKER_DIR" -name "analyzed_*" -mtime +1 -delete 2>/dev/null

# session-logs 디렉토리 확인
LOG_DIR="$HOME/.claude/session-logs"
if [ ! -d "$LOG_DIR" ]; then
  echo '{}'
  exit 0
fi

# 마지막 분석 시점 마커
LAST_CHECK="$MARKER_DIR/last_blog_check"

# 새로운 로그 찾기 (마지막 체크 이후, 또는 최근 7일)
if [ -f "$LAST_CHECK" ]; then
  NEW_LOGS=$(find "$LOG_DIR" -name "*.md" -newer "$LAST_CHECK" -type f 2>/dev/null | sort)
else
  NEW_LOGS=$(find "$LOG_DIR" -name "*.md" -mtime -7 -type f 2>/dev/null | sort)
fi

# 이 블로그 프로젝트의 로그는 제외 (다른 프로젝트 로그만)
CANDIDATE_LOGS=""
for LOG in $NEW_LOGS; do
  BASENAME=$(basename "$LOG")
  # _posts 프로젝트 로그 제외
  if echo "$BASENAME" | grep -qE '_posts_|cocodding|github-io|github\.io'; then
    continue
  fi
  CANDIDATE_LOGS="$CANDIDATE_LOGS $LOG"
done

# 마지막 체크 시점 업데이트
touch "$LAST_CHECK"

# 분석할 로그가 없으면 스킵
if [ -z "$CANDIDATE_LOGS" ]; then
  echo '{}'
  exit 0
fi

# 각 로그에서 작업 요약 추출
SUMMARIES=""
COUNT=0
for LOG in $CANDIDATE_LOGS; do
  BASENAME=$(basename "$LOG" .md)
  # 작업 요약 섹션 추출
  SUMMARY=$(sed -n '/## 작업 요약/,/^##/p' "$LOG" 2>/dev/null | head -5 | grep -v '^##')
  # 프로젝트명 추출 (파일명에서)
  PROJECT=$(echo "$BASENAME" | sed 's/^[0-9-]*__//; s/_[a-z0-9]*$//')

  if [ -n "$SUMMARY" ]; then
    SUMMARIES="${SUMMARIES}  - [${PROJECT}] ${SUMMARY}\n"
    COUNT=$((COUNT + 1))
  fi
done

if [ "$COUNT" -eq 0 ]; then
  echo '{}'
  exit 0
fi

# 결과 반환
CONTEXT=$(printf "[세션 로그 분석] 블로그 포스트로 작성할 만한 세션 로그 %d개를 발견했습니다:\n%b\n위 내용을 확인하고 블로그 포스트 초안을 작성하세요. session-logs 경로: %s" "$COUNT" "$SUMMARIES" "$LOG_DIR")

# JSON 이스케이프
ESCAPED=$(echo "$CONTEXT" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/ /g' | tr '\n' ' ')

cat << ENDJSON
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "$ESCAPED"
  }
}
ENDJSON
