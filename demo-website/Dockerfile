# ============================================================
# LangNation Cloud Platform - Demo Website
# ============================================================
#
# ECS/Fargate production container for the sanitized
# LangNation website used in the AWS Capstone.
# ============================================================

FROM node:20-alpine


# ------------------------------------------------------------
# Application directory
# ------------------------------------------------------------

WORKDIR /app


# ------------------------------------------------------------
# Install production dependencies
#
# Copy package files first so Docker can cache npm install.
# ------------------------------------------------------------

COPY package.json package-lock.json ./

RUN npm ci --omit=dev \
    && npm cache clean --force


# ------------------------------------------------------------
# Copy LangNation application
# ------------------------------------------------------------

COPY . .


# ------------------------------------------------------------
# Runtime configuration
#
# Database credentials and AWS configuration are NOT stored
# inside this image.
#
# ECS will inject them later.
# ------------------------------------------------------------

ENV NODE_ENV=production
ENV PORT=3000


# ------------------------------------------------------------
# ECS/ALB application port
# ------------------------------------------------------------

EXPOSE 3000


# ------------------------------------------------------------
# Start LangNation
# ------------------------------------------------------------

CMD ["npm", "start"]