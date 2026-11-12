#!/usr/bin/env bash
# One-time project setup for the deck advisor on Cloud Run. Safe to run again:
# every step either creates what is missing or leaves what exists alone. A
# first run can fail on a permission that has not spread yet (a new service
# account takes a minute to be usable); run it again.
#
# Creates two service accounts, neither with a key:
#   deck-advisor-run    runs the service. It gets roles/aiplatform.user, the role
#                       approved for calling Gemini through Vertex AI. That role is
#                       wider than calling a model: it can also create Vertex AI
#                       jobs and endpoints.
#   deck-advisor-build  runs Cloud Build. It gets roles/cloudbuild.builds.builder,
#                       so the build does not depend on the Compute Engine default
#                       account, which this project may not have and which is
#                       often an Editor where it exists.
#
# It does not set the spending limits. Those are spend cap budgets on the
# billing account, made in the console: see deploy/README.md.
#
# Usage: deploy/1-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."
. deploy/config.sh

run gcloud services enable \
  iam.googleapis.com run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com \
  aiplatform.googleapis.com logging.googleapis.com \
  --project "$PROJECT"

exists gcloud artifacts repositories describe "$REPOSITORY" --location "$REGION" --project "$PROJECT" ||
  run gcloud artifacts repositories create "$REPOSITORY" --repository-format=docker --location "$REGION" \
    --description="Deck advisor images" --project "$PROJECT"

exists gcloud iam service-accounts describe "$RUNTIME_SA" --project "$PROJECT" ||
  run gcloud iam service-accounts create deck-advisor-run --display-name="Deck advisor (Cloud Run)" --project "$PROJECT"
exists gcloud iam service-accounts describe "$BUILD_SA" --project "$PROJECT" ||
  run gcloud iam service-accounts create deck-advisor-build --display-name="Deck advisor (Cloud Build)" --project "$PROJECT"

# The service reaches Gemini through Vertex AI as its own identity: no API key, no key file.
run gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${RUNTIME_SA}" \
  --role=roles/aiplatform.user --condition=None --quiet >/dev/null

# What a build needs: read the uploaded source, write its log, push the image.
run gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:${BUILD_SA}" \
  --role=roles/cloudbuild.builds.builder --condition=None --quiet >/dev/null

echo
echo "Set up. Before deploying, create the spend cap budgets (deploy/README.md). Then: deploy/2-deploy.sh"
