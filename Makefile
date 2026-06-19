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

.PHONY: dev build qcontrol update-qcontrol pkg msi clean

build: qcontrol
	mkdir -p $(BIN_DIR)
	$(BUN) build $(ENTRY) --compile --outfile $(BIN_DIR)/$(BINARY)

qcontrol: $(QCONTROL_BIN)

$(QCONTROL_BIN):
ifneq ($(WINDOWS_UNAME),)
	@printf '%s\n' 'Windows qcontrol builds are not published yet.'
	@printf '%s\n' 'Copy the built qcontrol binary to bin\qcontrol.bin, then rerun make build.'
	@exit 1
else
	./scripts/download-qcontrol.sh $(QCONTROL_BIN)
endif

update-qcontrol:
ifneq ($(WINDOWS_UNAME),)
	@printf '%s\n' 'Windows qcontrol builds are not published yet.'
	@printf '%s\n' 'Copy the built qcontrol binary to bin\qcontrol.bin manually.'
	@exit 1
else
	./scripts/download-qcontrol.sh $(QCONTROL_BIN)
endif

pkg:
	./scripts/build-pkg.sh

msi:
	powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-msi.ps1

clean:
	rm -rf $(BIN_DIR)
	rm -rf $(QCONTROL_BIN)
