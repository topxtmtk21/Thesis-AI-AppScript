FROM python:3.13-slim

WORKDIR /app

# Install python dependencies
COPY backend/requirements.txt .
RUN python -m pip install --no-cache-dir --upgrade pip \
    && python -m pip install --no-cache-dir -r requirements.txt

# Copy the entire project
COPY . /app/

# Set working directory to backend so uvicorn finds app.main
WORKDIR /app/backend

# Expose default port (Railway overrides this dynamically)
EXPOSE 8080

# Command to run the application (Uses PORT env var if set, otherwise 8080)
CMD sh -c "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"
