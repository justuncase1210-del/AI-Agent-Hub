FROM node:20-slim

WORKDIR /app

# pg is a pure-JS driver — no native build toolchain needed (unlike the
# earlier better-sqlite3 setup).
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /app/uploads

EXPOSE 4021
CMD ["node", "src/index.js"]
