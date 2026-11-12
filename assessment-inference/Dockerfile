FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py exam_import.py external_grading.py test_app.py test_exam_import.py test_external_grading.py ./
RUN python -m unittest -q && rm test_app.py test_exam_import.py test_external_grading.py
USER 1001:1001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--no-proxy-headers", "--limit-concurrency", "8"]
