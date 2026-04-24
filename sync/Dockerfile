FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js ./

ENV HOST=0.0.0.0
ENV PORT=1234
EXPOSE 1234

CMD ["node", "index.js"]
