# Shared settings for the deploy scripts. Override any of them in the environment.
PROJECT="${PROJECT:-maassel-mtg-advisor}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-deck-advisor}"
REPOSITORY="${REPOSITORY:-deck-advisor}"
RUNTIME_SA="deck-advisor-run@${PROJECT}.iam.gserviceaccount.com"
# Where the model is called. gemini-3.8-flash is served from "global" and the multi-regions "us" and "eu",
# not from single regions such as us-central1.
MODEL_LOCATION="${MODEL_LOCATION:-global}"
