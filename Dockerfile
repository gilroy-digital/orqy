# ── Stage 1: Build frontend ──
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Build Rust backend ──
FROM rust:1.88-bookworm AS backend-builder
WORKDIR /app

# Install dependencies for libgit2
RUN apt-get update && apt-get install -y libssl-dev pkg-config cmake && rm -rf /var/lib/apt/lists/*

# Cache dependencies
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs && cargo build --release && rm -rf src

# Build the actual app
COPY src/ src/
COPY migrations/ migrations/
RUN touch src/main.rs && cargo build --release

# ── Stage 3: Runtime ──
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y \
    ca-certificates libssl3 git curl gnupg \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian bookworm stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update && apt-get install -y docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artifacts
COPY --from=backend-builder /app/target/release/orqy /app/orqy
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist
COPY migrations/ /app/migrations/

ENV RUST_LOG=orqy=info
EXPOSE 3456

CMD ["/app/orqy"]
