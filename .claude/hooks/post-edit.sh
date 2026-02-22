#!/bin/bash
# PostToolUse Hook (Edit|Write): 수정된 파일 기록
# _posts/ 하위 파일 수정 시 edit-log에 기록하여 품질 검사에서 참조

TMPFILE=$(mktemp)
cat > "$TMPFILE"

# sed로 JSON 값 추출 (grep -P 미지원 환경 대응)
TOOL_NAME=$(sed -n 's/.*"tool_name" *: *"\([^"]*\)".*/\1/p' "$TMPFILE" | head -1)
FILE_PATH=$(sed -n 's/.*"file_path" *: *"\([^"]*\)".*/\1/p' "$TMPFILE" | head -1)

rm -f "$TMPFILE"

# _posts 하위 파일인지 확인
if echo "$FILE_PATH" | grep -q '_posts'; then
  LOG_DIR="$CLAUDE_PROJECT_DIR/.claude"
  LOG_FILE="$LOG_DIR/edit-log.txt"
  TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
  echo "[$TIMESTAMP] $TOOL_NAME: $FILE_PATH" >> "$LOG_FILE"
fi

echo '{}'
