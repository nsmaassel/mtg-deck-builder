#!/usr/bin/env bash
# One-time project setup for the deck advisor on Cloud Run. Safe to run again:
# every step either creates what is missing or leaves what exists alone. A
# first run can fail on a permission that has not spread yet (a new service
# account takes a minute to be usable); run it again.
#
# Creates one service account with no key, deck-advisor-run: it runs the
# service and may call Gemini through Vertex AI, and nothing else.
#
# It does not set the spending limits. Those are spend cap budgets on the
# billing account, made in the console: see deploy/README.md.
#
# Usage: deploy/1-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
. deploy/config.sh

# Echoed to stderr, so it still shows when a command's own output is sent to /dev/null.
run() { echo "+ $*" >&2; "$@"; }
exists() { "$@" >/dev/null 2>&1; }

run gcloud services enable \
  iam.googleapis.com run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com aiplatform.googleapis.com \
  --project "$PROJECT"

exists gcloud artifacts repositories describe "$REPOSITORY" --location "$REGION" --project "$PROJECT" ||
  run gcloud artifacts repositories create "$REPOSITORY" --repository-format=docker --location "$REGION" \
    --description="Deck advisor images" --project "$PROJECT"

exists gcloud iam service-accounts describe "$RUNTIME_SA" --project "$PROJECT" ||
  run gcloud iam service-accounts create deck-advisor-run --display-name="Deck advisor (Cloud Run)" --project "$PROJECT"

# The service reaches Gemini through Vertex AI as its own identity: no API key, no key file.
run gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${RUNTIME_SA}" \
  --role=roles/aiplatform.user --condition=None --quiet >/dev/null

# In a project without an organization, Cloud Build runs as the Compute Engine default account, which
# newer projects no longer make an Editor. This is the one role a build needs; harmless if already covered.
NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
BUILD_SA="${NUMBER}-compute@developer.gserviceaccount.com"
if exists gcloud iam service-accounts describe "$BUILD_SA" --project "$PROJECT"; then
  run gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${BUILD_SA}" \
    --role=roles/cloudbuild.builds.builder --condition=None --quiet >/dev/null
else
  echo "No Compute Engine default account yet. If the first build fails on permissions, see deploy/README.md."
fi

echo
echo "Set up. Before deploying, create the spend cap budgets (deploy/README.md). Then: deploy/2-deploy.sh"
