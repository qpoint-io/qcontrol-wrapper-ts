BUN ?= bun
ENTRY := src/main.ts
BIN_DIR := bin
BINARY := qctl
QCONTROL_BIN := vendor/qcontrol.bin

.DEFAULT_GOAL := build

.PHONY: dev build qcontrol update-qcontrol pkg clean

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

clean:
	rm -rf $(BIN_DIR)
	rm -rf $(QCONTROL_BIN)
