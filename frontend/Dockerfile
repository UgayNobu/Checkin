# ---- build: compile the React app with Vite ----
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Relative URL: nginx below forwards /api to the backend, so one image works on any host
ARG VITE_API=/api
ENV VITE_API=$VITE_API
RUN npm run build

# ---- runtime: static files + reverse proxy ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=5s --retries=5 CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
