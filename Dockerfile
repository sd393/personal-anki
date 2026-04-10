FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV DB_PATH=/data/flashcards.db
EXPOSE 3000
CMD ["npm", "start"]
