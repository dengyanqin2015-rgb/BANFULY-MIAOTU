FROM node:20-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 python3-venv libgomp1 libxcb1 libgl1 libglib2.0-0 libsm6 libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json requirements.txt ./
RUN npm ci \
    && python3 -m venv /opt/ocr-venv \
    && /opt/ocr-venv/bin/pip install --no-cache-dir -r requirements.txt

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV OCR_PYTHON=/opt/ocr-venv/bin/python
ENV BANFULY_OCR_PORT=8787

EXPOSE 8080
CMD ["npm", "start"]
