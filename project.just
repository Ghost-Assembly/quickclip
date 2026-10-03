
# Project-specific offline integration tests
test-extra:
    @true

# Isolated GNOME lifecycle test
live-check:
    bash scripts/headless-check.sh

# Additional integration checks
live-extra:
    @true

# Project services stopped before uninstalling
uninstall-extra:
    @true
