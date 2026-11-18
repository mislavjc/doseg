FROM rust:1-bookworm AS builder
WORKDIR /app
COPY . .
# Cache mounts keep the cargo registry and target/ across builds, so a moved
# rust:1-bookworm tag or a Cargo.lock bump recompiles only what changed instead
# of every dependency. Binaries are copied out because the mount is not part of
# the layer.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/app/target,sharing=locked \
    cargo build --release --bin isochrone-server --bin transit-scorer \
    && mkdir -p /app/bin \
    && cp target/release/isochrone-server target/release/transit-scorer /app/bin/

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*
RUN useradd -m -u 1001 isochrone
RUN mkdir -p /app/rt-db && chown isochrone:isochrone /app/rt-db
COPY --from=builder /app/bin/isochrone-server /usr/local/bin/
# transit-scorer rides in the same image; the `scorer` compose service (tools
# profile) overrides the entrypoint to run it for the page-data regen.
COPY --from=builder /app/bin/transit-scorer /usr/local/bin/
USER isochrone
EXPOSE 3001
CMD ["isochrone-server"]
