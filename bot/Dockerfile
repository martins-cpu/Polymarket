# ==========================================
# Stage 1: Build Dashboard
# ==========================================
FROM node:18-alpine as dashboard-builder
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm install
COPY dashboard/ .
# Build the dashboard (Output will be in /app/dashboard/dist)
RUN npm run build

# ==========================================
# Stage 2: Build & Run Bot
# ==========================================
FROM node:18-alpine

# Set working directory for BOT
WORKDIR /app

# Install Bot Dependencies
COPY bot/package*.json ./
RUN npm install
RUN npm install -g tsx

# Copy Bot Source Code
COPY bot/ .

# Copy Dashboard Build from Stage 1
# We put it in /app/public so the Express server can serve it
COPY --from=dashboard-builder /app/dashboard/dist ./public

# Start command
CMD ["npm", "start"]
