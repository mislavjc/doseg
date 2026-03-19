FROM rust:1-bookworm AS builder
WORKDIR /app
COPY . .
RUN cargo build --release --bin isochrone-server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/isochrone-server /usr/local/bin/
EXPOSE 3001
CMD ["isochrone-server"]
