# reverse_image_api/Dockerfile
FROM node:20-slim

WORKDIR /app

# (optional) silence npm notice
ENV npm_config_loglevel=error

COPY package*.json ./
RUN npm install

COPY . .
EXPOSE 8080
CMD ["node","src/app.js"]
