BUN ?= bun
ENTRY := src/main.ts
BIN_DIR := bin
BINARY := qctl

.PHONY: dev build clean

dev:
	$(BUN) run $(ENTRY)

build:
	mkdir -p $(BIN_DIR)
	$(BUN) build $(ENTRY) --compile --outfile $(BIN_DIR)/$(BINARY)

clean:
	rm -rf $(BIN_DIR)
