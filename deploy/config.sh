# Shared settings and helpers for the deploy scripts. Override any setting in the environment.
PROJECT="${PROJECT:-maassel-mtg-advisor}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-deck-advisor}"
REPOSITORY="${REPOSITORY:-deck-advisor}"
RUNTIME_SA="deck-advisor-run@${PROJECT}.iam.gserviceaccount.com"
BUILD_SA="deck-advisor-build@${PROJECT}.iam.gserviceaccount.com"
# Where the model is called. gemini-3.8-flash is served from "global" and the multi-regions "us" and "eu",
# not from single regions such as us-central1. Every deploy sets the service to this value, so change it
# here, not on the service.
MODEL_LOCATION="${MODEL_LOCATION:-global}"

# Echoed to stderr, so it still shows when a command's own output is sent to /dev/null.
run() { echo "+ $*" >&2; "$@"; }
exists() { "$@" >/dev/null 2>&1; }
service_url() {
  gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" --format='value(status.url)'
}
