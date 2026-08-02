FROM node:20-slim

WORKDIR /app

# native deps for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/uploads /app/data

EXPOSE 4021
CMD ["node", "src/index.js"]
