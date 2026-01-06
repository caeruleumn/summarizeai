FROM node:20-alpine

WORKDIR /app

# copy manifest dulu supaya layer cache install bisa dipakai ulang
COPY package.json package-lock.json* ./
RUN npm install

# lalu copy semua source
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]