#!/usr/bin/env bash
# Put the service on the public internet. Run once, after the first deploy has
# been checked and the spend cap budgets exist. To take it off again:
#   deploy/3-open.sh close
#
# Usage: deploy/3-open.sh [close]
set -euo pipefail
cd "$(dirname "$0")/.."
. deploy/config.sh

# Echoed to stderr, so it still shows when a command's own output is sent to /dev/null.
run() { echo "+ $*" >&2; "$@"; }
action=add-iam-policy-binding
[ "${1:-}" = "close" ] && action=remove-iam-policy-binding

run gcloud run services "$action" "$SERVICE" --region "$REGION" --project "$PROJECT" \
  --member=allUsers --role=roles/run.invoker >/dev/null

echo "$([ "$action" = add-iam-policy-binding ] && echo Open || echo Closed): $(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" --format='value(status.url)')"
echo "Access changes take a couple of minutes to apply, sometimes longer."
