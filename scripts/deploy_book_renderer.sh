#!/usr/bin/env bash
set -euo pipefail

# Deploy one renderer per Supabase environment. The matching secret must already
# exist in Secret Manager, and the same value must be set as the Supabase secret.
: "${BOOK_SUPABASE_HOST:?Set BOOK_SUPABASE_HOST to the Supabase project host}"
: "${BOOK_RENDER_SECRET_NAME:?Set BOOK_RENDER_SECRET_NAME to the Secret Manager secret name}"

project="${BOOK_GCP_PROJECT:-koe-project-486620}"
region="${BOOK_GCP_REGION:-asia-northeast1}"
service="${BOOK_RENDER_SERVICE:-tateyoko-book-renderer}"
repository="${BOOK_ARTIFACT_REPOSITORY:-book-renderer}"
runtime_account_name="${BOOK_RENDER_RUNTIME_ACCOUNT:-book-render-runtime}"
context="$(mktemp -d)"
trap 'rm -rf "$context"' EXIT
mkdir -p "$context/scripts" "$context/src/lib"
cp Dockerfile.book-renderer "$context/Dockerfile"
cp package.json "$context/"
cp scripts/book_pdf_server.mjs scripts/render_book_pdf.mjs scripts/book_qr_svg.py \
  scripts/preflight_book_pdf.py "$context/scripts/"
cp src/lib/bookEdition.js src/lib/bookPagination.js src/lib/bookPrintHtml.js \
  src/lib/bookPhotoLayout.js "$context/src/lib/"

# Tag the image by the actual build inputs, including uncommitted edits.
image_tag="$(python3 - "$context" <<'PY'
import hashlib
from pathlib import Path
import sys

root = Path(sys.argv[1])
digest = hashlib.sha256()
for path in sorted(p for p in root.rglob('*') if p.is_file()):
    digest.update(str(path.relative_to(root)).encode('utf-8'))
    digest.update(path.read_bytes())
print(digest.hexdigest()[:16])
PY
)"
image="${region}-docker.pkg.dev/${project}/${repository}/${service}:${image_tag}"

gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com iam.googleapis.com \
  --project "$project"

runtime_account="${runtime_account_name}@${project}.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$runtime_account" --project "$project" >/dev/null 2>&1 || \
  gcloud iam service-accounts create "$runtime_account_name" --project "$project" \
    --display-name="Book PDF renderer runtime"
gcloud secrets describe "$BOOK_RENDER_SECRET_NAME" --project "$project" >/dev/null
gcloud secrets add-iam-policy-binding "$BOOK_RENDER_SECRET_NAME" --project "$project" \
  --member="serviceAccount:${runtime_account}" --role=roles/secretmanager.secretAccessor >/dev/null

gcloud artifacts repositories describe "$repository" \
  --project "$project" --location "$region" >/dev/null 2>&1 || \
  gcloud artifacts repositories create "$repository" --repository-format=docker \
    --project "$project" --location "$region"

gcloud builds submit "$context" --tag "$image" --project "$project" --region "$region"
gcloud run deploy "$service" \
  --project "$project" --region "$region" --image "$image" \
  --allow-unauthenticated --min-instances=0 --max-instances=2 \
  --concurrency=1 --cpu=2 --memory=2Gi --timeout=180 \
  --service-account="$runtime_account" \
  --set-env-vars="BOOK_ASSET_HOSTS=${BOOK_SUPABASE_HOST}" \
  --set-secrets="BOOK_RENDER_SECRET=${BOOK_RENDER_SECRET_NAME}:latest"

gcloud run services describe "$service" --project "$project" \
  --region "$region" --format='value(status.url)'
