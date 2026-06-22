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

.PHONY: dev build qcontrol update-qcontrol pkg win-installer clean

build: qcontrol
	mkdir -p $(BIN_DIR)
	$(BUN) build $(ENTRY) --compile --outfile $(BIN_DIR)/$(BINARY)

qcontrol: $(QCONTROL_BIN)

$(QCONTROL_BIN):
	./scripts/download-qcontrol.sh $(QCONTROL_BIN)

update-qcontrol:
	./scripts/download-qcontrol.sh $(QCONTROL_BIN)

pkg:
	./scripts/build-pkg.sh

win-installer:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-installer.ps1

clean:
	rm -rf $(BIN_DIR)
	rm -rf $(QCONTROL_BIN)
