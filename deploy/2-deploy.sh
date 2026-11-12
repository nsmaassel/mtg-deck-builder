#!/usr/bin/env bash
# Build the image with Cloud Build and deploy it. Used for the first deploy and every later one.
#
# It never changes who may call the service: a first deploy is private until
# deploy/3-open.sh opens it, and a service that was closed by hand stays closed.
# That is why the deploy passes neither --allow-unauthenticated nor its opposite:
# the first would reopen a closed service, the second would close an open one.
#
# Usage: deploy/2-deploy.sh            build from the working tree and deploy
#        IMAGE=... deploy/2-deploy.sh  deploy an image that is already built
set -euo pipefail
cd "$(dirname "$0")/.."
. deploy/config.sh

run() { echo "+ $*"; "$@"; }

if [ -z "${IMAGE:-}" ]; then
  IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPOSITORY}/app:$(git rev-parse --short HEAD)"
  # The image builds its own card index, meta snapshots and combos; DATA_DATE refreshes them at most daily.
  run gcloud builds submit . --project "$PROJECT" --config deploy/cloudbuild.yaml \
    --substitutions="_IMAGE=${IMAGE},_DATA_DATE=$(date -u +%F)"
fi

# One instance at most: the in-app spending ceilings are kept in that instance's memory.
# --update-env-vars leaves variables set by hand (ADVISOR_AGENT_MODEL, ADVISOR_AGENT_DAILY_USD) in place.
run gcloud run deploy "$SERVICE" --image "$IMAGE" --region "$REGION" --project "$PROJECT" \
  --service-account "$RUNTIME_SA" \
  --quiet \
  --max-instances=1 --min-instances=0 --concurrency=40 --timeout=60 \
  --memory=1Gi --cpu=1 --cpu-boost \
  --update-env-vars="NODE_ENV=production,GOOGLE_GENAI_USE_ENTERPRISE=true,GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${MODEL_LOCATION}"

echo
echo "Deployed: $(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" --format='value(status.url)')"
echo "Public access is unchanged. First deploy: check it (deploy/README.md), then deploy/3-open.sh."
