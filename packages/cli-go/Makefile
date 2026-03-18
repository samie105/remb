VERSION ?= 0.1.0
BINARY  := remb
GOFLAGS := -trimpath
LDFLAGS := -s -w -X github.com/richie/remb/cmd.Version=$(VERSION)

# Detect OS/Arch
GOOS   ?= $(shell go env GOOS)
GOARCH ?= $(shell go env GOARCH)

.PHONY: build clean install uninstall test all release sha256 docker

# Build for current platform
build:
	go build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o bin/$(BINARY) .

# Install to GOPATH/bin (or /usr/local/bin)
install: build
	cp bin/$(BINARY) /usr/local/bin/$(BINARY)
	@echo "✔ Installed $(BINARY) to /usr/local/bin/$(BINARY)"

# Uninstall
uninstall:
	rm -f /usr/local/bin/$(BINARY)
	@echo "✔ Removed $(BINARY) from /usr/local/bin"

# Run tests
test:
	go test ./...

# Remove build artifacts
clean:
	rm -rf bin/ dist/

# Cross-compile for all platforms
release: clean
	@mkdir -p dist
	GOOS=darwin  GOARCH=arm64 go build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-darwin-arm64 .
	GOOS=darwin  GOARCH=amd64 go build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-darwin-amd64 .
	GOOS=linux   GOARCH=amd64 go build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-linux-amd64 .
	GOOS=linux   GOARCH=arm64 go build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-linux-arm64 .
	GOOS=windows GOARCH=amd64 go build $(GOFLAGS) -ldflags "$(LDFLAGS)" -o dist/$(BINARY)-windows-amd64.exe .
	@echo "✔ Built release binaries in dist/"
	@ls -lh dist/

all: test build
