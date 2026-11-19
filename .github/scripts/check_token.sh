#!/usr/bin/env bash
# Перевіряє формат токена Supabase, НЕ розкриваючи його значення.
# Прибирає випадкові пробіли/переноси рядка і передає очищений токен наступним крокам.
set -euo pipefail
ENV_NAME="$1"
CLEAN=$(printf '%s' "${RAW_ACCESS_TOKEN:-}" | tr -d '[:space:]')
echo "::add-mask::$CLEAN"
LEN=${#CLEAN}
if [[ "$CLEAN" =~ ^sbp_(oauth_)?[a-f0-9]{40}$ ]]; then
  if [ "$CLEAN" != "${RAW_ACCESS_TOKEN}" ]; then
    echo "::notice title=Токен $ENV_NAME::У токені були зайві пробіли або перенос рядка — їх прибрано автоматично."
  fi
  echo "SUPABASE_ACCESS_TOKEN=$CLEAN" >> "$GITHUB_ENV"
  echo "Токен $ENV_NAME: формат правильний."
else
  PREFIX_OK=no; [[ "$CLEAN" == sbp_* ]] && PREFIX_OK=yes
  echo "::error title=Неправильний токен у середовищі $ENV_NAME::Секрет SUPABASE_ACCESS_TOKEN має починатися з sbp_ і мати 44 символи. Зараз: довжина $LEN, починається з sbp_: $PREFIX_OK. Ймовірно, вставлено інший ключ (пароль БД або S3-ключ). Створіть токен у Supabase → Access Tokens і внесіть його ще раз."
  exit 1
fi

# Пароль бази: прибрати випадкові пробіли/переноси, повідомити лише довжину
PW_RAW="${RAW_DB_PASSWORD:-}"
PW=$(printf '%s' "$PW_RAW" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
echo "::add-mask::$PW"
if [ "$PW" != "$PW_RAW" ]; then
  echo "::notice title=Пароль $ENV_NAME::У паролі бази були пробіли або перенос рядка на краях — їх прибрано."
fi
echo "Пароль бази $ENV_NAME: довжина ${#PW} символів."
{
  echo "SUPABASE_DB_PASSWORD<<__PW_EOF__"
  echo "$PW"
  echo "__PW_EOF__"
} >> "$GITHUB_ENV"
