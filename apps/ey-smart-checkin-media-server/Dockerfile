# Base stage
FROM node:25.2.1 AS base

WORKDIR /app

# Install Corepack and prepare Yarn 4.2.1
ENV COREPACK_ENABLE_AUTO_PIN=0
RUN npm install -g corepack@latest --force && \
    corepack enable && \
    corepack prepare yarn@4.2.1 --activate

# Copy package files
COPY package.json yarn.lock .yarnrc.yml ./

# Dependencies stage
FROM base AS dependencies

# Install all dependencies
RUN yarn install

# Copy source files
COPY . .

# Build stage
FROM dependencies AS build

# Build the media server
RUN yarn nx build ey-smart-checkin-media-server --skip-nx-cache

# Production stage
FROM node:25.2.1-slim AS production

WORKDIR /app

# Install Corepack and prepare Yarn 4.2.1
ENV COREPACK_ENABLE_AUTO_PIN=0
RUN npm install -g corepack@latest --force && \
    corepack enable && \
    corepack prepare yarn@4.2.1 --activate

# Copy built application and dependencies
COPY --from=build /app/dist/apps/ey-smart-checkin-media-server ./
COPY --from=build /app/node_modules ./node_modules

# Expose port
EXPOSE 3002

# Start the application
CMD ["node", "main.js"]
