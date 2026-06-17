# Desktop Environment — build helper
# Place at the app root. Produces a store-ready, single-top-level-folder tarball,
# and signs it automatically if a code-signing certificate is present.
#
# Usage:
#   make            # build unsigned (or signed if cert present) tarball
#   make clean
#
# Signing expects (see Nextcloud "Code signing" docs):
#   ~/.nextcloud/certificates/desktop.key   (your private key, keep secret)
#   ~/.nextcloud/certificates/desktop.crt   (cert returned by Nextcloud)

app_name = desktop
version  = 0.10.2

build_dir    = $(CURDIR)/build
sign_dir     = $(build_dir)/sign
appstore_dir = $(build_dir)/appstore
cert_dir     = $(HOME)/.nextcloud/certificates

# occ lives at the Nextcloud root; from custom_apps/<app> that is ../../occ
occ = ../../occ

exclude = --exclude='build' --exclude='.git' --exclude='.github' \
          --exclude='node_modules' --exclude='.DS_Store' \
          --exclude='*.swp' --exclude='Makefile' \
          --exclude='screenshots' --exclude='.gitignore' --exclude='.gitattributes'

.PHONY: all appstore clean

all: appstore

appstore: clean
	@mkdir -p $(sign_dir)/$(app_name)
	tar -cf - $(exclude) -C $(CURDIR) . | tar -xf - -C $(sign_dir)/$(app_name)
	@if [ -f $(cert_dir)/$(app_name).key ]; then \
		echo "Signing app files…"; \
		php $(occ) integrity:sign-app \
			--privateKey=$(cert_dir)/$(app_name).key \
			--certificate=$(cert_dir)/$(app_name).crt \
			--path=$(sign_dir)/$(app_name); \
		echo "Signed."; \
	else \
		echo "No certificate at $(cert_dir)/$(app_name).key — building UNSIGNED (store upload will reject it)."; \
	fi
	@mkdir -p $(appstore_dir)
	tar -czf $(appstore_dir)/$(app_name)-$(version).tar.gz -C $(sign_dir) $(app_name)
	@echo ""
	@echo "Built: $(appstore_dir)/$(app_name)-$(version).tar.gz"

clean:
	rm -rf $(build_dir)
