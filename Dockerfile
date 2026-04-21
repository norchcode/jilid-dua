FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/ ./
COPY frontend/ /app/frontend/
CMD ["sh", "-c", "npm run db:init && node src/server.js"]
