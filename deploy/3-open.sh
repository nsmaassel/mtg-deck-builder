#!/usr/bin/env bash
# Put the service on the public internet, or take it off.
#
#   deploy/3-open.sh open    after the first deploy has been checked and the spend cap budgets exist
#   deploy/3-open.sh close   take it off again
#
# Anything else changes nothing. Both are safe to repeat, and both end by
# reading back who can call the service: the script fails if that is not what
# was asked for.
set -euo pipefail
cd "$(dirname "$0")/.."
. deploy/config.sh

invokers() {
  gcloud run services get-iam-policy "$SERVICE" --region "$REGION" --project "$PROJECT" \
    --flatten='bindings[].members' --filter='bindings.role:roles/run.invoker' --format='value(bindings.members)'
}
# Any Google account is the public too, for a service whose every question costs money.
is_public() { grep -qxE 'allUsers|allAuthenticatedUsers' <<<"$1"; }

case "${1:-}" in
  open | close) ;;
  *)
    echo "Usage: deploy/3-open.sh open|close" >&2
    exit 2
    ;;
esac

# Read first: a failure here (no such service, no permission) stops the script before anything is claimed.
before="$(invokers)"
if [ "$1" = open ]; then
  run gcloud run services add-iam-policy-binding "$SERVICE" --region "$REGION" --project "$PROJECT" \
    --member=allUsers --role=roles/run.invoker >/dev/null
elif is_public "$before"; then
  for member in allUsers allAuthenticatedUsers; do
    grep -qx "$member" <<<"$before" || continue
    run gcloud run services remove-iam-policy-binding "$SERVICE" --region "$REGION" --project "$PROJECT" \
      --member="$member" --role=roles/run.invoker >/dev/null
  done
else
  echo "The public was not an invoker; nothing to remove."
fi

after="$(invokers)"
echo "$(service_url) can be called by: ${after:-nobody but project members}"
if [ "$1" = close ] && is_public "$after"; then
  echo "STILL PUBLIC: the list above still holds allUsers or allAuthenticatedUsers." >&2
  exit 1
fi
if [ "$1" = open ] && ! grep -qx allUsers <<<"$after"; then
  echo "NOT OPEN: allUsers is not an invoker." >&2
  exit 1
fi
echo "Access changes take a couple of minutes to apply, sometimes longer."
[ "$1" = open ] || echo "close removes the public and any-Google-account invokers. A named invoker, or an invoker check switched off in the console, is not undone here."
