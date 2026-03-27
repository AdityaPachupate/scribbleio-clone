FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
ENV NODE_OPTIONS="--max-old-space-size=400"
ENV CI=false
RUN npm run build -- --configuration production

FROM nginx:alpine
COPY --from=build /app/dist/scribble-client/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
