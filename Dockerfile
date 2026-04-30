FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY node_modules ./node_modules/

COPY server/ ./server/
COPY dist/ ./dist/
COPY index.html ./

EXPOSE 3001

CMD ["node", "server/index.js"]
