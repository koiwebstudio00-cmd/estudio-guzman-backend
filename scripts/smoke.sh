#!/usr/bin/env bash
set -euo pipefail

: "${SMOKE_BASE_URL:?Defina SMOKE_BASE_URL, por ejemplo https://api.example.com/api/v1}"

curl --fail --silent --show-error "${SMOKE_BASE_URL}/health/live" >/dev/null
curl --fail --silent --show-error "${SMOKE_BASE_URL}/health/ready" >/dev/null
curl --fail --silent --show-error "${SMOKE_BASE_URL}/health/worker" >/dev/null

if [[ -n "${SMOKE_EMAIL:-}" && -n "${SMOKE_PASSWORD:-}" ]]; then
  smoke_tmp="$(mktemp -d)"
  trap 'rm -rf "${smoke_tmp}"' EXIT
  login_body="$(jq -n --arg email "${SMOKE_EMAIL}" --arg password "${SMOKE_PASSWORD}" '{email:$email,password:$password}')"
  login_response="$(curl --fail --silent --show-error -c "${smoke_tmp}/cookies" -H "Origin: ${SMOKE_ORIGIN:?Defina SMOKE_ORIGIN}" -H 'Content-Type: application/json' --data "${login_body}" "${SMOKE_BASE_URL}/auth/login")"
  csrf="$(jq -r '.data.csrfToken' <<<"${login_response}")"
  test -n "${csrf}"
  curl --fail --silent --show-error -b "${smoke_tmp}/cookies" "${SMOKE_BASE_URL}/auth/me" >/dev/null
  curl --fail --silent --show-error -b "${smoke_tmp}/cookies" "${SMOKE_BASE_URL}/dashboard" >/dev/null
  curl --fail --silent --show-error -b "${smoke_tmp}/cookies" -H "Origin: ${SMOKE_ORIGIN}" -H "x-csrf-token: ${csrf}" -X POST "${SMOKE_BASE_URL}/auth/logout" >/dev/null
fi

echo "Smoke checks OK"
