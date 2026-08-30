# =========================
# LMS Backend (Express.js)
# =========================

# ---- Build/deps stage ----
FROM node:alpine3.24 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# ---- Production stage ----
FROM node:alpine3.24
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app .

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 --ingroup nodejs nodejs

COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs . .

USER nodejs

EXPOSE 3000

# Adjust this if your entrypoint file has a different name
CMD ["node", "server.js"]
