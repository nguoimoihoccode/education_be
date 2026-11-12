# Python assessment worker. Build context is the repo root because the image
# ships docs/assessment/contracts:
#   docker build -f assessment-worker/Dockerfile .
FROM python:3.12-slim AS runtime

# poppler replaces sharp's PDF rendering; DejaVu keeps Vietnamese diacritics in
# the exported report, the same family the Node image installed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends poppler-utils fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY assessment-worker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY assessment-worker/src ./src
COPY docs/assessment/contracts ./docs/assessment/contracts

# Build-time smoke test: imports catch a missing native dependency (Pillow,
# reportlab) and the two shell tools the worker relies on must exist. No model
# call or credential is involved.
RUN FONT="$(find /usr/share/fonts -name DejaVuSans.ttf | head -n 1)" \
    && test -n "$FONT" \
    && pdfinfo -v 2>&1 | grep -q 'pdfinfo version' \
    && pdftoppm -v 2>&1 | grep -q 'pdftoppm version' \
    && PYTHONPATH=/app/src python -c \
       'import assessment_worker.canonical, assessment_worker.config, assessment_worker.db.jobs, assessment_worker.processor, PIL, reportlab, openpyxl, asyncpg, boto3, httpx, jsonschema'

# The compose file mounts the workspace; the volume must already belong to 1001.
RUN useradd --uid 1001 --create-home worker \
    && mkdir -p /app/workspace \
    && chown -R 1001:1001 /app/workspace

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src \
    TMPDIR=/app/workspace \
    ASSESSMENT_WORKSPACE_PATH=/app/workspace \
    ASSESSMENT_WORKER_HEARTBEAT_PATH=/app/workspace/heartbeat

USER 1001

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import os,sys,time; p=os.environ['ASSESSMENT_WORKER_HEARTBEAT_PATH']; sys.exit(0 if time.time()-os.stat(p).st_mtime<120 else 1)"

CMD ["python", "-m", "assessment_worker.main"]
