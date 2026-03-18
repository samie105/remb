FROM alpine:3.21

ARG VERSION=0.1.0
ARG TARGETARCH

RUN apk add --no-cache ca-certificates curl && \
    ARCH=$([ "$TARGETARCH" = "arm64" ] && echo "arm64" || echo "amd64") && \
    curl -fsSL \
      "https://github.com/richie/remb/releases/download/v${VERSION}/remb-linux-${ARCH}" \
      -o /usr/local/bin/remb && \
    chmod +x /usr/local/bin/remb

ENTRYPOINT ["remb"]
CMD ["--help"]
