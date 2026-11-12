#!/usr/bin/env bash
# Put the service on the public internet, or take it off.
#
#   deploy/3-open.sh open    after the first deploy has been checked and the spend cap budgets exist
#   deploy/3-open.sh close   take it off again
#
# Anything else changes nothing. Both are safe to repeat.
set -euo pipefail
cd "$(dirname "$0")/.."
. deploy/config.sh

case "${1:-}" in
  open)
    run gcloud run services add-iam-policy-binding "$SERVICE" --region "$REGION" --project "$PROJECT" \
      --member=allUsers --role=roles/run.invoker >/dev/null
    ;;
  close)
    # Removing a binding that is not there is an error to gcloud and no problem here.
    run gcloud run services remove-iam-policy-binding "$SERVICE" --region "$REGION" --project "$PROJECT" \
      --member=allUsers --role=roles/run.invoker >/dev/null 2>&1 || echo "(the public was not an invoker)"
    ;;
  *)
    echo "Usage: deploy/3-open.sh open|close" >&2
    exit 2
    ;;
esac

echo "$(service_url) can now be called by:"
gcloud run services get-iam-policy "$SERVICE" --region "$REGION" --project "$PROJECT" \
  --flatten='bindings[].members' --filter='bindings.role:roles/run.invoker' --format='value(bindings.members)'
echo "(an empty list means nobody but project members). Access changes take a couple of minutes to apply, sometimes longer."
echo "close removes only the public: an invoker added another way, or an invoker check switched off in the console, is not undone here."
