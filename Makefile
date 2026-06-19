# Desktop Environment — build helper
# Place at the app root. Produces a store-ready, single-top-level-folder tarball,
# and signs it automatically if a code-signing certificate is present.
#
# Usage:
#   make            # build unsigned (or signed if cert present) tarball
#   make clean
#
# Signing expects (see Nextcloud "Code signing" docs):
#   ~/.nextcloud/certificates/desktop_workspace.key   (your private key, keep secret)
#   ~/.nextcloud/certificates/desktop_workspace.crt   (cert returned by Nextcloud)

app_name = desktop_workspace
version  = 0.12.4

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

dist_dir = $(build_dir)/dist

.PHONY: dist install

# Plain, unsigned app folder for a local test instance (no tarball, no signing).
dist: clean
	@mkdir -p $(dist_dir)/$(app_name)
	tar -cf - $(exclude) -C $(CURDIR) . | tar -xf - -C $(dist_dir)/$(app_name)
	@echo "App folder ready: $(dist_dir)/$(app_name)"

# Copy it straight into a Nextcloud apps dir:
#   make install DEST=/var/www/html/nextcloud/custom_apps
install: dist
	@test -n "$(DEST)" || { echo "Usage: make install DEST=/path/to/custom_apps"; exit 1; }
	rsync -a --delete $(dist_dir)/$(app_name) $(DEST)/
	@echo "Installed to $(DEST)/$(app_name)"
