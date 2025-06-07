FROM node:18

WORKDIR /app

# 1) Upgrade npm so no “new major version” notices show
RUN npm install -g npm@11.4.1

# 2) Copy package files and install deps
COPY package*.json ./
RUN npm install

COPY . .
EXPOSE 8080
CMD ["node","src/app.js"]
