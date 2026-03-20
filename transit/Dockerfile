FROM rust:1-bookworm AS chef
RUN cargo install cargo-chef --locked
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json --bin isochrone-server
COPY . .
RUN cargo build --release --bin isochrone-server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1001 isochrone
RUN mkdir -p /app/rt-db && chown isochrone:isochrone /app/rt-db
COPY --from=builder /app/target/release/isochrone-server /usr/local/bin/
USER isochrone
EXPOSE 3001
CMD ["isochrone-server"]
