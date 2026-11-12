#!/usr/bin/env bash
# Build the image with Cloud Build and deploy it. Used for the first deploy and every later one.
#
# It never opens the service. A first deploy is created private, and stays so
# until deploy/3-open.sh opens it. On a service that exists, the deploy passes
# neither --allow-unauthenticated nor its opposite, so an open service stays
# open and one that was closed stays closed.
#
# Usage: deploy/2-deploy.sh            build from the working tree and deploy
#        IMAGE=... deploy/2-deploy.sh  deploy an image that is already built (no rebuild, no downloads)
set -euo pipefail
cd "$(dirname "$0")/.."
. deploy/config.sh

if [ -z "${IMAGE:-}" ]; then
  # The build takes the working tree as it is, so the tag says when that is not the commit, and which build it was.
  TAG="$(git rev-parse --short HEAD)"
  [ -z "$(git status --porcelain)" ] || TAG="${TAG}-dirty-$(date -u +%Y%m%dT%H%M%SZ)"
  IMAGE="${REGION}-docker.pkg.dev/${PROJECT}/${REPOSITORY}/app:${TAG}"
  # Cloud Build starts from nothing each time, so every build downloads Scryfall's bulk files and
  # Commander Spellbook's variants again. Both ask for about one fetch a day: do not rebuild in a loop,
  # and use IMAGE=... to redeploy without building.
  run gcloud builds submit . --project "$PROJECT" --config deploy/cloudbuild.yaml \
    --service-account="projects/${PROJECT}/serviceAccounts/${BUILD_SA}" \
    --substitutions="_IMAGE=${IMAGE},_DATA_DATE=$(date -u +%F)"
fi

# A new service is created private, said outright rather than left to gcloud's prompt default.
# Listing tells "not there" (no output) from "could not ask" (the command fails and the script stops):
# a failed lookup must not be taken for a new service, or the deploy would close an open one.
EXISTING="$(gcloud run services list --region "$REGION" --project "$PROJECT" \
  --filter="metadata.name=${SERVICE}" --format='value(metadata.name)')"
ACCESS=()
[ -n "$EXISTING" ] || ACCESS=(--no-allow-unauthenticated)

# One instance at most: the in-app spending ceilings are kept in that instance's memory.
# --update-env-vars leaves variables set by hand (ADVISOR_AGENT_MODEL, ADVISOR_AGENT_DAILY_USD) in place.
# The timeout is for the request; a chat turn of several model calls can take most of a minute.
run gcloud run deploy "$SERVICE" --image "$IMAGE" --region "$REGION" --project "$PROJECT" \
  --service-account "$RUNTIME_SA" \
  --quiet ${ACCESS[@]+"${ACCESS[@]}"} \
  --max-instances=1 --min-instances=0 --concurrency=40 --timeout=120 \
  --memory=1Gi --cpu=1 --cpu-boost \
  --update-env-vars="NODE_ENV=production,GOOGLE_GENAI_USE_ENTERPRISE=true,GOOGLE_CLOUD_PROJECT=${PROJECT},GOOGLE_CLOUD_LOCATION=${MODEL_LOCATION}"

echo
echo "Deployed: $(service_url)"
if [ -n "$EXISTING" ]; then
  echo "Public access is unchanged."
else
  echo "Created private. Check it (deploy/README.md), then: deploy/3-open.sh open"
fi
