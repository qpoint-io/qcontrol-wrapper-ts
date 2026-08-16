BUN ?= bun
ENTRY := src/main.ts
BIN_DIR := bin
QCONTROL_BIN := bin/qcontrol.bin
UNAME_S := $(shell uname -s)
WINDOWS_UNAME := $(filter MINGW% MSYS% CYGWIN%,$(UNAME_S))
EXE_SUFFIX :=

ifneq ($(WINDOWS_UNAME),)
EXE_SUFFIX := .exe
endif

BINARY := qctl$(EXE_SUFFIX)

.DEFAULT_GOAL := build

.PHONY: dev build qcontrol update-qcontrol test pkg clean

build: qcontrol
	mkdir -p $(BIN_DIR)
	$(BUN) build $(ENTRY) --compile --outfile $(BIN_DIR)/$(BINARY)

qcontrol: $(QCONTROL_BIN)

$(QCONTROL_BIN):
	./scripts/download-qcontrol.sh $(QCONTROL_BIN)

update-qcontrol:
	./scripts/download-qcontrol.sh $(QCONTROL_BIN)
	./scripts/sync-qcontrol-types.sh

test:
	$(BUN) test

# Version stamp for release artifacts: exact git tag on tag builds, else the
# short SHA. Matches the naming used by qcontrol's macOS pkg.
PKG_VERSION ?= $(shell git describe --tags --exact-match 2>/dev/null || git rev-parse --short HEAD)

# Build the macOS installer package from the already-built bin/qctl. Run
# `make build` first. Artifacts land in the ignored dist/ directory.
pkg: build
	scripts/macos-pkg/build.sh --binary $(BIN_DIR)/$(BINARY) --version $(PKG_VERSION) --output-dir dist

clean:
	rm -rf $(BIN_DIR)
	rm -rf $(QCONTROL_BIN)
