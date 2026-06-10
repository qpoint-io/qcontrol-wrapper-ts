BUN ?= bun
ENTRY := src/main.ts
BIN_DIR := bin
BINARY := qctl
QCONTROL_BIN := vendor/qcontrol.bin

.DEFAULT_GOAL := build

.PHONY: dev build qcontrol clean

build: qcontrol
	mkdir -p $(BIN_DIR)
	$(BUN) build $(ENTRY) --compile --outfile $(BIN_DIR)/$(BINARY)

qcontrol:
	./scripts/download-qcontrol.sh $(QCONTROL_BIN)

clean:
	rm -rf $(BIN_DIR)
	rm -rf $(QCONTROL_BIN)
