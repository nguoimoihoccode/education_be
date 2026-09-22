# syntax=docker/dockerfile:1

# Postgres + pgvector, deliberately kept on alpine.
#
# pgvector's official images are Debian-based, and moving the live `pgdata`
# volume from musl to glibc risks corrupting indexes. Staying on alpine lets the
# existing volume be reused as-is, with no dump/restore.
#
# An apk package cannot be used: postgres:16-alpine builds Postgres with
# `./configure --prefix=/usr/local` (docker-library/postgres, 16/alpine3.23),
# while Alpine's postgresql-pgvector installs into /usr for Alpine's own
# postgresql16 — `CREATE EXTENSION vector` would not find it. So compile against
# this image's own pg_config, which is what pgvector does for its own images.
#
# The base image deletes its toolchain (`apk del .build-deps`), so the compiler
# is installed here and removed again in the same layer.
FROM postgres:16.4-alpine

# Pinned so the built image is reproducible; bump deliberately.
ADD https://github.com/pgvector/pgvector.git#v0.8.6 /tmp/pgvector

# OPTFLAGS="" drops -march=native so the binary stays portable across hosts.
# with_llvm=no skips JIT bitcode: it earns a vector index nothing, and it would
# otherwise tie the build to whichever clang version the server itself was
# compiled against.
RUN set -eux; \
    apk add --no-cache --virtual .pgvector-build-deps build-base; \
    cd /tmp/pgvector; \
    make OPTFLAGS="" with_llvm=no; \
    make install with_llvm=no; \
    cd /; \
    rm -rf /tmp/pgvector; \
    apk del --no-network .pgvector-build-deps