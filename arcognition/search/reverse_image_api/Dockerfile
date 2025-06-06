FROM node:20-slim
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile
COPY . .
CMD ["node","src/app.js"]
