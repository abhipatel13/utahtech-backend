# ---- build stage ----
    FROM node:20-alpine AS build
    WORKDIR /app
    
    COPY package*.json ./
    RUN npm ci
    
    COPY . .
    
    # ---- runtime stage ----
    FROM node:20-alpine
    WORKDIR /app
    ENV NODE_ENV=production
    
    COPY --from=build /app /app
    
    EXPOSE 3002
    CMD ["node", "server.js"]