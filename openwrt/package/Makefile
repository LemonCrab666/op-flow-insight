include $(TOPDIR)/rules.mk

PKG_NAME:=op-flow-insight
PKG_VERSION:=0.1.1
PKG_RELEASE:=5

PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE
PKG_MAINTAINER:=OP Flow Insight contributors
PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk

define Package/op-flow-insight
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Per-host traffic and offline IP risk insight
  URL:=https://github.com/op-flow-insight/op-flow-insight
  DEPENDS:=@TARGET_x86_64 +ca-bundle +rpcd +jsonfilter +luci-base
endef

define Package/op-flow-insight/description
  Cumulative and live per-host traffic accounting for ImmortalWrt/OpenWrt x86_64,
  with conntrack endpoints, offline country/ASN attribution and explainable
  0-100 IP risk evidence.
endef

define Package/op-flow-insight/conffiles
/etc/config/op-flow
endef

define Build/Compile
endef

define Package/op-flow-insight/install
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) ./files/op-flowd $(1)/usr/sbin/op-flowd

	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/rootfs/etc/config/op-flow $(1)/etc/config/op-flow

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/rootfs/etc/init.d/op-flow $(1)/etc/init.d/op-flow

	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./files/rootfs/usr/libexec/rpcd/op-flow $(1)/usr/libexec/rpcd/op-flow

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./files/rootfs/usr/share/rpcd/acl.d/luci-app-op-flow.json \
		$(1)/usr/share/rpcd/acl.d/luci-app-op-flow.json

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./files/rootfs/usr/share/luci/menu.d/luci-app-op-flow.json \
		$(1)/usr/share/luci/menu.d/luci-app-op-flow.json

	$(INSTALL_DIR) $(1)/www/luci-static/resources
	$(INSTALL_DATA) ./files/rootfs/www/luci-static/resources/op-flow.css \
		$(1)/www/luci-static/resources/op-flow.css

	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/status
	$(INSTALL_DATA) ./files/rootfs/www/luci-static/resources/view/status/op_flow.js \
		$(1)/www/luci-static/resources/view/status/op_flow.js

	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/op_flow
	$(INSTALL_DATA) ./files/rootfs/www/luci-static/resources/view/op_flow/settings.js \
		$(1)/www/luci-static/resources/view/op_flow/settings.js

	$(INSTALL_DIR) $(1)/lib/upgrade/keep.d
	$(INSTALL_DATA) ./files/rootfs/lib/upgrade/keep.d/op-flow \
		$(1)/lib/upgrade/keep.d/op-flow
endef

define Package/op-flow-insight/postinst
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] && exit 0
/etc/init.d/rpcd restart >/dev/null 2>&1 || true
exit 0
endef

define Package/op-flow-insight/prerm
#!/bin/sh
[ -n "$$IPKG_INSTROOT" ] && exit 0
/etc/init.d/op-flow stop >/dev/null 2>&1 || true
exit 0
endef

$(eval $(call BuildPackage,op-flow-insight))
